/* =====================================================================
   SETTINGS — the only part you should need to edit
   ===================================================================== */
export const CONFIG = {
  // The ID from your Google Sheet's link: docs.google.com/spreadsheets/d/<THIS PART>/edit
  sheetId: '1cFKxVMGLDuZeS974UUVzH-Oa57sHUe9tHMFCUkwM0r0',
  // Your school's name. Leave '' to show only "Spirit Team".
  schoolName: 'Nueva',
  // How often open pages check the sheet for new points, in seconds.
  refreshSeconds: 60
};
/* ===================================================================== */

export const GRADES = [
  { id: 'sr', name: 'Seniors', year: 2027, match: /senior/i },
  { id: 'jr', name: 'Juniors', year: 2028, match: /junior/i },
  { id: 'so', name: 'Sophomores', year: 2029, match: /sophomore/i },
  { id: 'fr', name: 'Freshmen', year: 2030, match: /fresh/i }
];

export const yy = y => '’' + String(y).slice(2);
export const fmt = n => Number(n).toLocaleString('en-US');
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function season() {
  const d = new Date(), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return y + '–' + String(y + 1).slice(2);
}
export function totals(entries) {
  const t = {}; GRADES.forEach(g => t[g.id] = 0);
  entries.forEach(e => GRADES.forEach(g => { t[g.id] += Number(e.points[g.id] || 0); }));
  return t;
}
export function ranked(entries) {
  const t = totals(entries);
  const arr = GRADES.map((g, i) => ({ id: g.id, name: g.name, year: g.year, pts: t[g.id], order: i }));
  arr.sort((a, b) => b.pts - a.pts || a.order - b.order);
  let rank = 0, prev = null;
  arr.forEach((r, i) => { if (r.pts !== prev) { rank = i + 1; prev = r.pts; } r.rank = rank; });
  return arr;
}
export const newestFirst = entries => entries.slice().sort((a, b) => (b.t || 0) - (a.t || 0) || b.row - a.row);

function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function parseDate(s) {
  s = String(s || '').trim(); if (!s) return null; let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[1] - 1, +m[2]).getTime(); }
  const t = Date.parse(s); return isNaN(t) ? null : t;
}
const parseNum = s => { const v = parseFloat(String(s || '').replace(/[^0-9.\-]/g, '')); return isFinite(v) ? Math.round(v) : 0; };
function rowsToEntries(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(h => String(h).trim());
  const col = { date: -1, name: -1 };
  head.forEach((h, i) => {
    if (/date|day|when/i.test(h) && col.date < 0) col.date = i;
    if (/challenge|event|activity|name/i.test(h) && col.name < 0) col.name = i;
  });
  GRADES.forEach(g => { col[g.id] = -1; head.forEach((h, i) => { if (g.match.test(h) && col[g.id] < 0) col[g.id] = i; }); });
  if (GRADES.every(g => col[g.id] < 0)) throw new Error('columns');
  const out = [];
  rows.slice(1).forEach((r, i) => {
    const name = col.name > -1 ? String(r[col.name] || '').trim() : '';
    const pts = {}; let any = false;
    GRADES.forEach(g => { const v = col[g.id] > -1 ? parseNum(r[col[g.id]]) : 0; if (v) { pts[g.id] = v; any = true; } });
    if (!name && !any) return;
    out.push({ row: i, challenge: name || 'Spirit points', t: col.date > -1 ? parseDate(r[col.date]) : null, points: pts });
  });
  return out;
}
export async function fetchScores() {
  const url = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(CONFIG.sheetId) + '/gviz/tq?tqx=out:csv&headers=1&_=' + Date.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('http ' + res.status);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error('not shared');
  return rowsToEntries(parseCSV(text));
}
