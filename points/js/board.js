// The Spirit Points board: the standings (split-flap ranks and points, tap a class for its numbers), the results
// timetable with class filters, an event's full breakdown, live refresh with toasts. Shared by /points/ (on the
// ride's billboard) and the platform (the billboard the officer points you to); both pages have the same markup.
import { CONFIG, GRADES, yy, fmt, esc, season, totals, ranked, newestFirst, fetchScores } from './data.js';
import { flap, padStart, blank } from '/hub/flap.js';

const $ = id => document.getElementById(id);
let mobile = false, audio = { tick() {}, chime() {}, clatter() {} };
const SHORT = { sr: 'Seniors', jr: 'Juniors', so: 'Sophs', fr: 'Frosh' };
const ORD = n => ['1st', '2nd', '3rd', '4th'][n - 1] || n + 'th';
const keyOf = e => e.row + '|' + e.challenge;
const chronological = entries => entries.slice().sort((a, b) => (a.t || 0) - (b.t || 0) || a.row - b.row);
const school = (CONFIG.schoolName || '').trim();

/* ---------- data ---------- */
const CACHE_KEY = 'spirit-cache-' + CONFIG.sheetId;
const state = { entries: [], loaded: false, error: false, checkedAt: null };
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.entries) state.entries = c.entries; } catch (e) {}
let rows = ranked([]), filterId = null, boardShown = false;
export const setShown = v => { boardShown = v; };
export const detailOpen = () => !$('detail').hidden;

function statusLine() {
  const es = state.entries;
  if (!es.length) return state.error ? 'Couldn’t load the scores. Refresh to try again.' : state.loaded ? 'No events yet.' : 'Loading…';
  const top = rows.filter(x => x.rank === 1);
  if (top.length > 1) return `<b>${top.map(x => x.name).join(' and ')}</b> tied at <b class="num">${fmt(top[0].pts)}</b>`;
  return `<b>${rows[0].name}</b> lead by <b class="num">${fmt(rows[0].pts - rows[1].pts)}</b>`;
}
function classStats(id) {
  const es = state.entries; let wins = 0, best = null;
  es.forEach(e => { const me = ranked([e]).find(x => x.id === id); if (me.rank === 1 && me.pts > 0) wins++; if (me.pts > 0 && (!best || me.pts > best.p)) best = { p: me.pts, name: e.challenge }; });
  const tot = totals(es)[id];
  return { tot, wins, best, avg: es.length ? tot / es.length : 0, rank: (rows.find(x => x.id === id) || {}).rank };
}

/* ---------- the standings: split-flap rank and points, a meter, and each class's numbers on tap ---------- */
function renderStandings(fresh) {
  const list = $('standings'), started = state.entries.length > 0, max = Math.max(1, ...rows.map(x => x.pts));
  if (!list.children.length) list.innerHTML = GRADES.map(g => `<li><button class="row" type="button" data-id="${g.id}" aria-expanded="false" style="--c:var(--${g.id})">
      <span class="main"><span class="rk flap" aria-hidden="true"></span><span class="nm"><b>${mobile ? SHORT[g.id] : g.name}</b><span class="yr">${yy(g.year)}</span></span><span class="pts flap num" aria-hidden="true"></span><span class="meter"><i></i></span></span>
      <dl class="stats"></dl><span class="sr-only"></span></button></li>`).join('');
  let changed = 0;
  rows.forEach((x, i) => {
    const btn = list.querySelector(`[data-id="${x.id}"]`), li = btn.parentElement;
    if (list.children[i] !== li) list.insertBefore(li, list.children[i]); // keep them in rank order
    btn.classList.toggle('lead', started && x.rank === 1);
    if (fresh) btn.querySelectorAll('.flap').forEach(blank);
    const delay = fresh ? 300 + i * 120 : 0;
    changed += flap(btn.querySelector('.rk'), started ? String(x.rank).padStart(2, '0') : '  ', delay) + flap(btn.querySelector('.pts'), padStart(fmt(x.pts), 6), delay + 120);
    btn.querySelector('.meter i').style.setProperty('--w', (started ? Math.max(2, x.pts / max * 100) : 0) + '%');
    const st = classStats(x.id);
    btn.querySelector('.stats').innerHTML = started ? `<div><dt>Rank</dt><dd>${ORD(st.rank)}</dd></div><div><dt>Points</dt><dd class="num">${fmt(st.tot)}</dd></div><div><dt>Event wins</dt><dd>${st.wins}</dd></div><div><dt>Avg / event</dt><dd class="num">${fmt(Math.round(st.avg))}</dd></div>${st.best ? `<div><dt>Best</dt><dd>+${fmt(st.best.p)} · ${esc(st.best.name)}</dd></div>` : ''}` : '';
    btn.querySelector('.sr-only').textContent = started ? `${ORD(x.rank)}, ${fmt(x.pts)} points` : 'No points yet';
  });
  return changed;
}

/* ---------- results: a timetable of events, newest first; tap one for the full breakdown ---------- */
function renderResults(fresh = []) {
  const es = state.entries;
  $('filters').innerHTML = `<button class="filter${filterId ? '' : ' on'}" type="button" data-filter="">All</button>` + GRADES.map(g => `<button class="filter${filterId === g.id ? ' on' : ''}" type="button" data-filter="${g.id}" style="--c:var(--${g.id})" aria-pressed="${filterId === g.id}"><i></i>${mobile ? SHORT[g.id] : g.name}</button>`).join('');
  if (filterId && es.length) { const st = classStats(filterId), g = GRADES.find(x => x.id === filterId); $('f-summary').innerHTML = `<b>${g.name}</b> · ${fmt(st.tot)} pts · ${st.wins} win${st.wins === 1 ? '' : 's'}${st.best ? ` · best: ${esc(st.best.name)} (+${fmt(st.best.p)})` : ''}`; }
  else $('f-summary').textContent = '';
  if (!es.length) { $('results').innerHTML = `<li class="empty">${state.error ? 'Results couldn’t load. Refresh the page to try again.' : state.loaded ? 'No events scored yet.' : 'Loading results…'}</li>`; return; }
  const chrono = chronological(es);
  $('results').innerHTML = newestFirst(es).map(e => {
    const no = String(chrono.indexOf(e) + 1).padStart(2, '0'), d = e.t ? new Date(e.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const ev = ranked([e]), total = ev.reduce((a, x) => a + x.pts, 0), win = ev[0], me = filterId ? ev.find(x => x.id === filterId) : null;
    const who = me ? `<span class="who" style="--c:var(--${me.id})"><i></i>${ORD(me.rank)} · ${me.pts > 0 ? '+' : ''}${fmt(me.pts)}</span>` : (win.pts > 0 ? `<span class="who" style="--c:var(--${win.id})"><i></i>${mobile ? SHORT[win.id] : win.name}</span>` : '<span class="who">–</span>');
    return `<li><button class="ev${fresh.includes(keyOf(e)) ? ' fresh' : ''}" type="button" data-key="${esc(keyOf(e))}" aria-label="Event ${no}: ${esc(e.challenge)}. Open the full breakdown"><span class="no">${no}</span><span class="dt">${d}</span><span class="name">${esc(e.challenge)}</span>${who}<span class="aw num">${fmt(total)}<small>pts</small></span></button></li>`;
  }).join('');
}

let detailFrom = null;
function openDetail(key, from) {
  const e = state.entries.find(x => keyOf(x) === key); if (!e) return; detailFrom = from;
  const chrono = chronological(state.entries), idx = chrono.indexOf(e), ev = ranked([e]), max = Math.max(1, ...ev.map(x => Math.max(0, x.pts)));
  const d = e.t ? new Date(e.t).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  $('d-when').textContent = `Event ${String(idx + 1).padStart(2, '0')}${d ? ' · ' + d : ''}`;
  $('d-total').textContent = fmt(ev.reduce((a, x) => a + x.pts, 0)) + ' pts';
  $('d-name').textContent = e.challenge;
  $('d-places').innerHTML = ev.map(x => `<li><span class="pl">${x.rank}</span><span class="nm">${x.name}</span><span class="pt">${x.pts > 0 ? '+' : ''}${fmt(x.pts)}</span><span class="bar"><i style="--w:${Math.max(2, Math.max(0, x.pts) / max * 100)}%;--c:var(--${x.id})"></i></span></li>`).join('');
  const before = ranked(chrono.slice(0, idx)), after = ranked(chrono.slice(0, idx + 1));
  $('d-after').innerHTML = after.map(x => { const b = before.find(y => y.id === x.id), mv = idx === 0 ? 0 : b.rank - x.rank; return `<li><span>${x.rank}</span><span>${x.name}</span><span class="num">${fmt(x.pts)}</span><span class="mv ${mv > 0 ? 'up' : mv < 0 ? 'down' : 'same'}">${mv > 0 ? '▲ ' + mv : mv < 0 ? '▼ ' + (-mv) : '—'}</span></li>`; }).join('');
  const dl = $('detail'); dl.hidden = false; void dl.offsetWidth; dl.classList.add('open');
  audio.chime(); dl.querySelector('.d-close').focus({ preventScroll: true });
}
function closeDetail() { const dl = $('detail'); if (dl.hidden) return; dl.classList.remove('open'); setTimeout(() => { dl.hidden = true; }, 450); audio.tick(); if (detailFrom) detailFrom.focus({ preventScroll: true }); }

function renderAll({ fresh = [], flipFresh = false } = {}) {
  rows = ranked(state.entries);
  $('status').innerHTML = statusLine();
  const t = state.checkedAt ? new Date(state.checkedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  $('live-text').textContent = t ? 'Live · ' + t : 'Live';
  $('end-note').textContent = `${school ? school + ' ' : ''}Spirit Team · ${season()}`;
  const changed = renderStandings(flipFresh); renderResults(fresh);
  if (changed && boardShown) audio.clatter(1);
}

/* ---------- live updates ---------- */
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4200); }
async function load(isRefresh) {
  try {
    const entries = await fetchScores();
    const before = JSON.stringify(state.entries), prev = new Set(state.entries.map(keyOf));
    Object.assign(state, { entries, loaded: true, error: false, checkedAt: Date.now() });
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ entries, at: state.checkedAt })); } catch (e) {}
    const fresh = isRefresh ? entries.map(keyOf).filter(k => !prev.has(k)) : [];
    renderAll({ fresh });
    if (isRefresh && before !== JSON.stringify(entries) && boardShown) { const n = newestFirst(entries)[0]; toast(fresh.length && n ? 'New results · ' + n.challenge : 'Standings updated'); audio.chime(); }
  } catch (e) { if (!state.entries.length) state.error = true; renderAll(); }
}


// once per page: the controls, the live refresh, a first draw from the cache
let ready = false;
export function initBoard(opts = {}) {
  if (ready) return; ready = true;
  mobile = !!opts.mobile; if (opts.audio) audio = opts.audio;
  $('season').textContent = season() + ' season';
  $('standings').addEventListener('click', e => {
    const b = e.target.closest('.row'); if (!b || !state.entries.length) return;
    const open = b.getAttribute('aria-expanded') !== 'true';
    $('standings').querySelectorAll('.row').forEach(r => r.setAttribute('aria-expanded', 'false'));
    b.setAttribute('aria-expanded', String(open)); audio.tick();
  });
  $('filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; filterId = b.dataset.filter || null; audio.tick(); renderResults(); });
  $('results').addEventListener('click', e => { const b = e.target.closest('.ev'); if (b) openDetail(b.dataset.key, b); });
  $('detail').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDetail(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
  setInterval(() => { if (!document.hidden) load(true); }, Math.max(15, CONFIG.refreshSeconds) * 1000);
  renderAll();
}
export { renderAll, load, closeDetail };
