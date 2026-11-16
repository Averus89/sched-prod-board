// Black-box check of the board: node tests/check.mjs <board url>
import { chromium } from 'playwright';
const url = process.argv[2];
const out = [];
const ok = (name, cond, detail = '') => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!cond) process.exitCode = 1; };
const browser = await chromium.launch();
for (const [tz, locale] of [['Pacific/Auckland', 'en-NZ'], ['Europe/Berlin', 'de-DE'], ['America/New_York', 'en-US']]) {
  const ctx = await browser.newContext({ timezoneId: tz, locale });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto(url);
  const loaderSeen = await page.locator('[data-testid="loader"]').count();
  await page.locator('[data-testid="incident-row"]').first().waitFor();
  ok(`${tz} loader gone`, (await page.locator('[data-testid="loader"]').count()) === 0, `(seen at open: ${loaderSeen})`);
  const first = page.locator('[data-testid="incident-row"]').first();
  const iso = await first.locator('time').getAttribute('datetime');
  const shown = await first.locator('time').textContent();
  const expect = new Intl.DateTimeFormat(locale, { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  ok(`${tz} local time`, shown === expect, `${iso} -> "${shown}" (want "${expect}")`);
  const times = await page.locator('[data-testid="incident-row"] time').evaluateAll((ts) => ts.map((t) => Date.parse(t.getAttribute('datetime'))));
  ok(`${tz} newest first`, times.every((t, i) => i === 0 || times[i - 1] >= t), `${times.length} rows`);
  if (tz === 'Europe/Berlin') {
    const sha = await page.locator('[data-testid="build-sha"]').textContent();
    const meta = await page.locator('meta[name="build"]').getAttribute('content');
    ok('build sha footer = meta', sha === meta, sha);
    let reqs = 0;
    page.on('request', (r) => { if (r.url().includes('/incidents')) reqs++; });
    const el = await first.elementHandle();
    await page.waitForTimeout(6500);
    ok('refresh every 2s', reqs >= 3, `${reqs} fetches in 6.5s`);
    ok('row kept across refresh', await el.evaluate((n) => n.isConnected));
    const row = page.locator('[data-testid="incident-row"]').nth(1);
    const id = await row.getAttribute('data-id');
    await row.locator('[data-testid="ack"]').click();
    await row.locator('[data-testid="acked"]').waitFor();
    await page.waitForTimeout(2500);
    ok('ack marked and survives refresh', (await page.locator(`[data-testid="incident-row"][data-id="${id}"] [data-testid="acked"]`).count()) === 1, id);
    ok('ack receipt logged', logs.some((l) => l.startsWith(`ack ${id}`)));
  }
  await ctx.close();
}
await browser.close();
console.log(out.join('\n'));
