import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('.error');

const acked = new Map(); // incident id -> ackedAt, survives every refresh
const rows = new Map(); // incident id -> <li>, so a refresh never replaces a row under the pointer

// R5: the viewer's own zone and locale order (en-GB/de-DE → dd/mm, en-US → mm/dd).
const fmt = new Intl.DateTimeFormat(navigator.languages?.[0] || navigator.language, {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
export const localTime = (iso) => fmt.format(new Date(iso));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function rowHtml(i) {
  return `<span class="id">${esc(i.id)}</span>
    <span class="sev">${esc(i.severity)}</span>
    <span class="what">${esc(i.service)} · ${esc(i.region)} · ${esc(i.summary)}</span>
    <time datetime="${esc(i.openedAt)}">${esc(localTime(i.openedAt))}</time>
    <span class="act"></span>`;
}

function renderAction(li, id) {
  const slot = li.querySelector('.act');
  if (acked.has(id)) {
    if (!slot.querySelector('[data-testid="acked"]')) slot.innerHTML = '<span data-testid="acked" class="acked">✓ acked</span>';
    return;
  }
  if (slot.querySelector('[data-testid="ack"]')) return;
  slot.innerHTML = '<button type="button" data-testid="ack">Ack</button>';
  slot.querySelector('button').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      const reply = await ack(id); // R2
      acked.set(id, reply.ackedAt);
      renderAction(li, id);
    } catch (e) {
      btn.disabled = false;
      showError(e);
    }
  });
}

function render(incidents) {
  // R1: newest first, whatever order the API sends.
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const seen = new Set();
  sorted.forEach((i, idx) => {
    seen.add(i.id);
    let li = rows.get(i.id);
    if (!li) {
      li = document.createElement('li');
      li.setAttribute('data-testid', 'incident-row');
      li.dataset.id = i.id;
      rows.set(i.id, li);
    }
    li.className = `row ${i.severity}`;
    const t = li.querySelector('time');
    if (!t) {
      li.innerHTML = rowHtml(i);
    } else {
      t.setAttribute('datetime', i.openedAt);
      t.textContent = localTime(i.openedAt);
      li.querySelector('.what').textContent = `${i.service} · ${i.region} · ${i.summary}`;
      li.querySelector('.sev').textContent = i.severity;
    }
    renderAction(li, i.id);
    if (list.children[idx] !== li) list.insertBefore(li, list.children[idx] || null);
  });
  for (const [id, li] of rows) if (!seen.has(id)) { li.remove(); rows.delete(id); }
  empty.hidden = sorted.length > 0;
}

function showError(e) {
  errorBox.textContent = String(e.message || e);
  errorBox.hidden = false;
}

let busy = false;
async function refresh() {
  if (busy) return; // never two fetches at once
  busy = true;
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    errorBox.hidden = true;
  } catch (e) {
    showError(e);
  } finally {
    busy = false;
    loader.remove?.(); // R3: gone after the first answer
  }
}

await refresh();
setInterval(refresh, REFRESH_MS); // R4
