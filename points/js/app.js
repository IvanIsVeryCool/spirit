import { CONFIG, GRADES, yy, fmt, esc, season, totals, ranked, newestFirst, fetchScores } from './data.js';
import { Sound } from './sound.js';

window.__spiritBooted = true;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const school = (CONFIG.schoolName || '').trim();
const sound = new Sound();
const $ = id => document.getElementById(id);
const SHORT = { sr: 'Seniors', jr: 'Juniors', so: 'Sophs', fr: 'Frosh' };
const SEC_NAMES = ['Intro', 'Standings', 'Results', 'Keep up'];

/* ---------- film grain texture, made once ---------- */
(() => {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'), d = x.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
})();

/* ---------- static text ---------- */
const TITLE = (school || 'Class') + ' Spirit';
$('brand-name').textContent = TITLE;
$('hero-title').textContent = TITLE; $('hero-title').setAttribute('aria-label', TITLE);
$('brand-season').textContent = season() + ' season';
$('season-line').textContent = '01 · ' + season() + ' Spirit Competition';
$('end-school').textContent = (school ? school + ' ' : '') + 'Spirit Team · ' + season();

/* ---------- data ---------- */
const CACHE_KEY = 'spirit-cache-' + CONFIG.sheetId;
const state = { entries: [], loaded: false, error: false, checkedAt: null };
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.entries) state.entries = c.entries; } catch (e) {}

/* ---------- text effects ---------- */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/';
function scramble(el, text, { duration = 900, delay = 0, ticks = true } = {}) {
  if (!el) return;
  if (reduce) { el.textContent = text; return; }
  const id = (el._scr = (el._scr || 0) + 1), t0 = performance.now(), len = text.length;
  const reveal = [...text].map((_, i) => delay + (i / Math.max(1, len)) * duration * .6 + Math.random() * duration * .4);
  const frame = now => {
    if (el._scr !== id) return;
    const t = now - t0; if (t < delay) { requestAnimationFrame(frame); return; }
    let out = '', done = true;
    for (let i = 0; i < len; i++) {
      const ch = text[i];
      if (ch === ' ' || t >= reveal[i]) out += ch; else { done = false; out += GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
    }
    el.textContent = out;
    if (ticks && Math.random() < .3) sound.tick();
    if (!done) requestAnimationFrame(frame); else el.textContent = text;
  };
  requestAnimationFrame(frame);
}
function countTo(el, from, to, { duration = 1300, delay = 0, ticks = true } = {}) {
  if (!el) return;
  if (reduce || from === to) { el.textContent = fmt(to); return; }
  const id = (el._cnt = (el._cnt || 0) + 1);
  el.textContent = fmt(from);
  setTimeout(() => {
    let start = null, last = from;
    const step = ts => {
      if (el._cnt !== id) return;
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration), v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (v !== last) { el.textContent = fmt(v); last = v; if (ticks) sound.tick(); }
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

/* ---------- rendering the content ---------- */
function statusLine(entries, r) {
  if (!entries.length) {
    if (state.error) return 'The standings couldn’t load. Check your connection and refresh.';
    if (!state.loaded) return 'Loading the latest standings…';
    return 'Every class starts at zero. Standings appear after the first spirit event.';
  }
  const top = r.filter(x => x.rank === 1);
  if (top.length > 1) return `<b>${top.map(x => x.name).join(' and ')}</b> are tied for first with <b class="num">${fmt(top[0].pts)}</b> points.`;
  const d = r[0].pts - r[1].pts;
  return `<b>${r[0].name}</b> lead the ${r[1].name} by <b class="num">${fmt(d)}</b> point${d === 1 ? '' : 's'} after ${entries.length} event${entries.length === 1 ? '' : 's'}.`;
}

let rows = ranked([]);
function renderContent({ fresh = [] } = {}) {
  const entries = state.entries; rows = ranked(entries);
  const started = entries.length > 0;
  $('status').innerHTML = statusLine(entries, rows);
  const t = state.checkedAt ? new Date(state.checkedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;
  $('st-note').textContent = started ? `${entries.length} event${entries.length === 1 ? '' : 's'} · ${fmt(Object.values(totals(entries)).reduce((a, b) => a + b, 0))} points awarded` : 'No events yet';
  $('live-text').textContent = t ? 'Live · ' + t : 'Live';
  $('end-note').textContent = t ? 'Scores checked every minute · last at ' + t : 'Scores are posted by the spirit team after each event';

  // standings list (desktop side column)
  $('board').innerHTML = rows.map(x => `<li class="${started && x.rank === 1 ? 'lead' : ''}" data-id="${x.id}"><span class="rk mono">${started ? String(x.rank).padStart(2, '0') : '–'}</span><span class="nm">${x.name}</span><span class="pt num" data-pts="${x.pts}">${fmt(x.pts)}</span></li>`).join('');

  renderResults(fresh);
  buildLabels();
}

/* ---------- results: a 3D deck of event cards ---------- */
const ORD = n => ['1st', '2nd', '3rd', '4th'][n - 1] || n + 'th';
const ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const keyOf = e => e.row + '|' + e.challenge;
const chronological = entries => entries.slice().sort((a, b) => (a.t || 0) - (b.t || 0) || a.row - b.row);
let filterId = null, deckCards = [], deckC = 0, deckIdx = -1;
function renderResults(fresh = []) {
  const entries = state.entries, deck = $('deck');
  $('filters').innerHTML = `<button class="filter${filterId ? '' : ' on'}" type="button" data-filter="">All</button>` +
    GRADES.map(g => `<button class="filter${filterId === g.id ? ' on' : ''}" type="button" data-filter="${g.id}" style="--c:var(--${g.id})"><i></i>${mobile ? SHORT[g.id] : g.name}</button>`).join('');
  updateSummary();
  if (!entries.length) {
    deck.innerHTML = `<p class="empty" style="position:absolute;left:0;top:40%;transform:translateX(-50%);width:max-content;max-width:80vw">${state.error ? 'Results couldn’t load. Refresh the page to try again.' : state.loaded ? 'No events scored yet.' : 'Loading results…'}</p>`;
    deckCards = []; $('dots').innerHTML = ''; sizeResults(); return;
  }
  const chrono = chronological(entries);
  deck.innerHTML = newestFirst(entries).map(e => {
    const no = String(chrono.indexOf(e) + 1).padStart(2, '0');
    const d = e.t ? new Date(e.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const ev = ranked([e]), total = ev.reduce((a, x) => a + x.pts, 0);
    const places = ev.map(x => `<li class="${filterId === x.id ? 'match' : ''}"><span class="pl mono">${ORD(x.rank)}</span><span class="b" style="--c:var(--${x.id})">${yy(x.year)}</span><span>${mobile ? SHORT[x.id] : x.name}</span><span class="p">${x.pts > 0 ? '+' : ''}${fmt(x.pts)}</span></li>`).join('');
    return `<div class="card${fresh.includes(keyOf(e)) ? ' fresh' : ''}" role="button" tabindex="0" data-key="${esc(keyOf(e))}" aria-label="${esc(e.challenge)}: open the full breakdown"><div class="card-in">
      <div class="c-top mono"><span>Event ${no}</span><span>${d}</span></div>
      <div class="c-no" aria-hidden="true">${no}</div><div class="c-name">${esc(e.challenge)}</div>
      <ol class="c-places">${places}</ol>
      <div class="c-foot mono"><span>${fmt(total)} pts awarded</span><span class="c-open">Open ${ARROW}</span></div></div></div>`;
  }).join('');
  deck.classList.toggle('filtered', !!filterId);
  deckCards = [...deck.querySelectorAll('.card')];
  $('dots').innerHTML = deckCards.map(() => '<i></i>').join('');
  deckIdx = -1; sizeResults();
}
function updateSummary() {
  const es = state.entries;
  if (!es.length) { $('f-summary').textContent = ''; return; }
  if (!filterId) { $('f-summary').innerHTML = `<b>${es.length}</b> event${es.length === 1 ? '' : 's'} · <b>${fmt(Object.values(totals(es)).reduce((a, b) => a + b, 0))}</b> points awarded`; return; }
  const st = classStats(filterId), g = GRADES.find(x => x.id === filterId);
  $('f-summary').innerHTML = `<b>${g.name}</b> · ${fmt(st.tot)} pts · ${st.wins} win${st.wins === 1 ? '' : 's'}${st.best ? ` · best: ${esc(st.best.name)} (+${fmt(st.best.p)})` : ''}`;
}
function sizeResults() {
  const n = Math.max(1, deckCards.length);
  secs[2].style.height = document.body.classList.contains('static') ? '' : (100 + (n - 1) * 42 + 30) + 'vh';
}
function updateDeck(dt) {
  const n = deckCards.length; if (!n) return;
  const r = secs[2].getBoundingClientRect(), span = Math.max(1, r.height - innerHeight);
  const target = Math.min(1, Math.max(0, -r.top / span)) * (n - 1);
  deckC += (target - deckC) * Math.min(1, dt * 7);
  const cw = deckCards[0].offsetWidth, step = cw * (mobile ? .9 : .8);
  deckCards.forEach((el, i) => {
    const d = i - deckC, ad = Math.abs(d);
    el.style.transform = `translate3d(${d * step}px,${ad * 8}px,${-ad * 200}px) rotateY(${Math.max(-64, Math.min(64, -d * 34))}deg) scale(${1 - Math.min(ad, 2) * .05})`;
    el.style.opacity = Math.max(0, 1 - ad * .3).toFixed(3);
    el.style.zIndex = String(100 - Math.round(ad * 10));
    el.style.pointerEvents = ad > 1.5 ? 'none' : '';
  });
  const idx = Math.round(deckC);
  if (idx !== deckIdx) { if (deckIdx !== -1) sound.tick(); deckIdx = idx; [...$('dots').children].forEach((d, i) => d.classList.toggle('on', i === idx)); }
}
function classStats(id) {
  const es = state.entries; let wins = 0, best = null;
  es.forEach(e => {
    const me = ranked([e]).find(x => x.id === id);
    if (me.rank === 1 && me.pts > 0) wins++;
    if (me.pts > 0 && (!best || me.pts > best.p)) best = { p: me.pts, name: e.challenge };
  });
  const tot = totals(es)[id];
  return { tot, wins, best, avg: es.length ? tot / es.length : 0, rank: (rows.find(x => x.id === id) || {}).rank };
}

/* event detail panel; the particles rebuild that event's podium */
let detailKey = null, detailFrom = null;
function openDetail(key, fromEl) {
  const e = state.entries.find(x => keyOf(x) === key); if (!e) return;
  detailKey = key; detailFrom = fromEl;
  const chrono = chronological(state.entries), idx = chrono.indexOf(e);
  const d = e.t ? new Date(e.t).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
  $('d-when').textContent = `Event ${String(idx + 1).padStart(2, '0')}${d ? ' · ' + d : ''}`;
  $('d-name').textContent = e.challenge;
  const ev = ranked([e]), max = Math.max(1, ...ev.map(x => Math.max(0, x.pts)));
  $('d-places').innerHTML = ev.map(x => `<li><span class="pl">${x.rank}</span><span class="nm">${x.name}</span><span class="pt">${x.pts > 0 ? '+' : ''}${fmt(x.pts)} pts</span><span class="bar"><i style="--w:${Math.max(2, Math.max(0, x.pts) / max * 100)}%;--c:var(--${x.id})"></i></span></li>`).join('');
  const before = ranked(chrono.slice(0, idx)), after = ranked(chrono.slice(0, idx + 1));
  $('d-after').innerHTML = after.map(x => {
    const b = before.find(y => y.id === x.id), mv = idx === 0 ? 0 : b.rank - x.rank;
    return `<li><span class="mono">${x.rank}</span><span>${x.name}</span><span class="num">${fmt(x.pts)}</span><span class="mv ${mv > 0 ? 'up' : mv < 0 ? 'down' : 'same'}">${mv > 0 ? '▲ ' + mv : mv < 0 ? '▼ ' + (-mv) : '—'}</span></li>`;
  }).join('');
  const dl = $('detail'); dl.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => dl.classList.add('open')));
  document.documentElement.style.overflow = 'hidden';
  if (scene) scene.morphTo(scene.pillarsTarget(ev, { anchors: false, shiftX: mobile ? 0 : scene.visW * .245, base: mobile ? 1.4 : -2.1, maxH: mobile ? 1.6 : 2.9 }), { duration: 1.6, scatter: .7 });
  sound.whoosh(1, true); sound.shimmer(5);
  dl.querySelector('.d-close').focus({ preventScroll: true });
}
function closeDetail() {
  if (!detailKey) return;
  detailKey = null;
  const dl = $('detail'); dl.classList.remove('open');
  setTimeout(() => { if (!detailKey) dl.hidden = true; }, 650);
  document.documentElement.style.overflow = '';
  if (scene && active === 2) scene.morphTo(targets.ring, { duration: 1.4, scatter: .6 });
  sound.whoosh(.9, false);
  if (detailFrom) detailFrom.focus({ preventScroll: true });
}

/* hover (or tap) a crystal to light it up and see that class's numbers */
let hovered = null;
function setHover(id) {
  if (id === hovered) return;
  hovered = id;
  if (scene) scene.highlight(id && targets.pillars && targets.pillars.ranges ? targets.pillars.ranges[id] : null);
  document.querySelectorAll('#board li').forEach(li => li.classList.toggle('hi', li.dataset.id === id));
  const card = $('pinfo');
  if (!id || !state.entries.length) { card.classList.remove('show'); return; }
  const g = GRADES.find(x => x.id === id), st = classStats(id);
  card.innerHTML = `<h4>${g.name}</h4><dl><dt>Rank</dt><dd>${ORD(st.rank)}</dd><dt>Points</dt><dd class="num">${fmt(st.tot)}</dd><dt>Event wins</dt><dd>${st.wins}</dd><dt>Avg / event</dt><dd class="num">${fmt(Math.round(st.avg))}</dd>${st.best ? `<dt>Best</dt><dd>+${fmt(st.best.p)}</dd>` : ''}</dl>`;
  card.classList.add('show'); sound.blip(.8);
}
function pillarAt(x, y) {
  if (!scene) return null;
  const pts = rows.map(r => ({ id: r.id, a: scene.project(r.id), b: scene.project(r.id + '-base') })).filter(p => p.a && p.b);
  if (pts.length < 2) return null;
  const xs = pts.map(p => (p.a.x + p.b.x) / 2).sort((m, n) => m - n), half = Math.max(24, (xs[1] - xs[0]) / 2);
  const hit = pts.find(p => Math.abs(x - (p.a.x + p.b.x) / 2) < half && y > p.a.y - 30 && y < p.b.y + 40);
  return hit ? hit.id : null;
}

/* 3D flip-in titles */
function prepFlip(el) {
  const text = el.textContent; el.setAttribute('aria-label', text);
  el.innerHTML = [...text].map((ch, i) => `<span class="fl" aria-hidden="true" style="transition-delay:${i * 45}ms">${ch === ' ' ? ' ' : esc(ch)}</span>`).join('');
}
function flipIn(el) { el.classList.add('flipped'); [...el.children].forEach((_, i) => setTimeout(() => sound.tick(), i * 45)); }
prepFlip($('st-title')); prepFlip($('rs-title'));

/* the camera's flight path through the whole story, keyed to scroll (s = section + progress) */
const PATH = [
  [0.0, [0, 0, 12], [0, .6, 0]],
  [0.5, [4.6, 1.6, 10.2], [0, .9, 0]],
  [0.95, [-2.6, 4.2, 10.6], [.6, .2, 0]],
  [1.25, [2.2, 2.4, 11.4], [1.6, -.2, 0]],
  [1.6, [6.2, 1.4, 9.8], [1.9, -.3, 0]],
  [1.92, [-.8, 3.4, 10.6], [2.1, -.2, 0]],
  [2.15, [2.6, -3, 9.4], [2.2, -.4, -1.5]],
  [2.55, [-2.4, 1.6, 9.8], [1.8, -.3, -1.5]],
  [2.95, [4.2, -.6, 8.6], [2.2, -.2, -1.5]],
  [3.2, [0, 3.4, 13.5], [0, 1.4, 0]],
  [3.7, [0, .6, 12.2], [0, 1.3, 0]],
  [4.0, [0, .6, 12.2], [0, 1.3, 0]]
];
function storyS() {
  const mid = innerHeight * .5;
  for (let i = 0; i < secs.length; i++) { const r = secs[i].getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) return i + (mid - r.top) / r.height; }
  return secs[secs.length - 1].getBoundingClientRect().top < mid ? 3.999 : 0;
}
const cr = (p0, p1, p2, p3, u) => .5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
function pathAt(s) {
  let k = 0; while (k < PATH.length - 2 && PATH[k + 1][0] <= s) k++;
  const a = PATH[Math.max(0, k - 1)], b = PATH[k], c = PATH[k + 1], d = PATH[Math.min(PATH.length - 1, k + 2)];
  const u = Math.min(1, Math.max(0, (s - b[0]) / (c[0] - b[0])));
  const out = [0, 1].map(j => [0, 1, 2].map(n => cr(a[j + 1][n], b[j + 1][n], c[j + 1][n], d[j + 1][n], u)));
  if (mobile) { out[0][0] *= .5; out[1][0] = 0; } // keep everything on a narrow screen
  return out;
}

/* labels that float above and below each 3D pillar */
const labels = {};
function buildLabels() {
  const layer = $('labels'); const started = state.entries.length > 0;
  rows.forEach(x => {
    let L = labels[x.id];
    if (!L) {
      L = labels[x.id] = { top: document.createElement('div'), base: document.createElement('div'), shown: null };
      L.top.className = 'plabel'; L.base.className = 'blabel';
      L.top.innerHTML = '<span class="pts num">0</span><span class="yr"></span>';
      layer.append(L.top, L.base);
    }
    L.top.classList.toggle('lead', started && x.rank === 1);
    L.top.querySelector('.yr').textContent = yy(x.year);
    L.base.innerHTML = `<b>${started ? ['1st', '2nd', '3rd', '4th'][x.rank - 1] : '–'}</b> <span>${mobile ? SHORT[x.id] : x.name}</span>`;
    L.pts = x.pts;
    if (L.shown === null) L.top.querySelector('.pts').textContent = fmt(x.pts);
  });
}
function countLabels(fromZero) {
  rows.forEach((x, i) => {
    const L = labels[x.id]; if (!L) return;
    const from = fromZero ? 0 : (L.shown == null ? x.pts : L.shown);
    countTo(L.top.querySelector('.pts'), from, x.pts, { duration: 1500, delay: fromZero ? 500 + i * 80 : 300 });
    L.shown = x.pts;
  });
  document.querySelectorAll('#board .pt').forEach((el, i) => countTo(el, fromZero ? 0 : Number(el.dataset.pts), Number(el.dataset.pts), { duration: 1300, delay: 300 + i * 80, ticks: false }));
}

/* ---------- the 3D stage ---------- */
let scene = null;
const targets = {};
function buildTargets() {
  if (!scene) return;
  targets.logo = scene.logoTarget(mobile ? 1.2 : 1.05, true);
  targets.endLogo = scene.logoTarget(mobile ? 1.6 : 1.5);
  targets.pillars = scene.pillarsTarget(rows);
  targets.ring = scene.ringTarget();
  targets.words = {};
}
function wordTarget(w) { if (!targets.words[w]) targets.words[w] = scene.textTarget(w, mobile ? 1.7 : 1.6); return targets.words[w]; }
function targetFor(i) { return [targets.logo, targets.pillars, targets.ring, targets.endLogo][i]; }

/* ---------- sections ---------- */
const secs = [...document.querySelectorAll('.sec')];
let active = -1, entered = false;
const seen = new Set();
function setSection(i, force) {
  if (i === active && !force) return;
  const prev = active; active = i;
  $('sec-num').textContent = String(i + 1).padStart(2, '0');
  scramble($('sec-name'), SEC_NAMES[i], { duration: 450, ticks: false });
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', Number(a.dataset.sec) === i));
  sound.setSection(i);
  $('labels').classList.toggle('show', i === 1 && !!scene);
  if (prev === 1) setHover(null);
  if (prev === 2) closeDetail();
  if (scene && entered) {
    scene.morphTo(targetFor(i), { duration: i === 1 ? 2.1 : 1.8, scatter: prev === -1 ? 1.6 : 1.1 });
    sound.whoosh(1.3, i > prev);
  }
  if (!seen.has(i) && entered) {
    seen.add(i);
    if (i === 1) { flipIn($('st-title')); countLabels(true); }
    if (i === 2) flipIn($('rs-title'));
  }
}
function currentSection() {
  const mid = innerHeight * .5;
  for (let i = 0; i < secs.length; i++) { const r = secs[i].getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) return i; }
  return secs[secs.length - 1].getBoundingClientRect().top < mid ? secs.length - 1 : 0;
}

/* ---------- pointer, cursor, sounds on UI ---------- */
const cursor = $('cursor'), dot = $('cursor-dot');
let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my;
let touchDown = false;
const ndc = (x, y) => [(x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1];
addEventListener('pointermove', e => {
  mx = e.clientX; my = e.clientY;
  if (scene && entered && (e.pointerType === 'mouse' || touchDown)) scene.setPointer(...ndc(mx, my), true);
}, { passive: true });
addEventListener('pointerdown', e => {
  if (!scene || !entered || detailKey || e.target.closest('a,button,.card,.filter,#loader,.detail,.board')) return;
  if (active === 1 && e.pointerType !== 'mouse') setHover(pillarAt(e.clientX, e.clientY));
  const [nx, ny] = ndc(e.clientX, e.clientY);
  scene.shock(nx, ny); sound.pulse();
  if (e.pointerType !== 'mouse') { touchDown = true; scene.setPointer(nx, ny, true); }
}, { passive: true });
addEventListener('pointerup', e => { if (e.pointerType !== 'mouse' && scene) { touchDown = false; scene.setPointer(0, 0, false); } }, { passive: true });
addEventListener('pointercancel', () => { if (scene) { touchDown = false; scene.setPointer(0, 0, false); } }, { passive: true });
document.documentElement.addEventListener('mouseleave', () => scene && scene.setPointer(0, 0, false));
document.addEventListener('pointerover', e => {
  const t = e.target.closest('a,button,.card');
  if (t && !t.contains(e.relatedTarget)) { cursor.classList.add('hover'); if (entered) sound.blip(t.classList.contains('card') ? .9 : 1); }
  const li = e.target.closest('#board li'); if (li && active === 1) setHover(li.dataset.id);
});
document.addEventListener('pointerout', e => {
  const t = e.target.closest('a,button,.card'); if (t && !t.contains(e.relatedTarget)) cursor.classList.remove('hover');
  const li = e.target.closest('#board li'); if (li && !li.contains(e.relatedTarget) && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#board li'))) setHover(null);
});
/* results: filters, card tilt, open and close */
$('filters').addEventListener('click', e => {
  const b = e.target.closest('[data-filter]'); if (!b) return;
  filterId = b.dataset.filter || null; sound.click(); renderResults();
});
$('deck').addEventListener('pointermove', e => {
  const c = e.target.closest('.card'); if (!c || e.pointerType !== 'mouse') return;
  const inn = c.firstElementChild, r = inn.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  inn.style.setProperty('--ry', ((x - .5) * 18).toFixed(2) + 'deg'); inn.style.setProperty('--rx', (-(y - .5) * 14).toFixed(2) + 'deg');
  inn.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); inn.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
});
$('deck').addEventListener('pointerout', e => {
  const c = e.target.closest('.card'); if (!c || c.contains(e.relatedTarget)) return;
  ['--rx', '--ry'].forEach(v => c.firstElementChild.style.setProperty(v, '0deg'));
});
$('deck').addEventListener('click', e => { const c = e.target.closest('.card'); if (c) { sound.click(); openDetail(c.dataset.key, c); } });
$('deck').addEventListener('keydown', e => { const c = e.target.closest('.card'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(c.dataset.key, c); } });
$('detail').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDetail(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

let wordTimer = null;
document.querySelectorAll('[data-morph]').forEach(a => {
  a.addEventListener('pointerenter', () => {
    if (!scene || active !== 3) return; clearTimeout(wordTimer);
    scene.morphTo(wordTarget(a.dataset.morph), { duration: 1.1, scatter: .7 }); sound.whoosh(.8, true);
  });
  a.addEventListener('pointerleave', () => {
    if (!scene || active !== 3) return; clearTimeout(wordTimer);
    wordTimer = setTimeout(() => { if (active === 3) scene.morphTo(targets.endLogo, { duration: 1.2, scatter: .6 }); }, 250);
  });
});
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (a) {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); sound.click(); scrollTo({ top: t.offsetTop + (t.id === 'standings' ? innerHeight * .35 : 0), behavior: reduce ? 'auto' : 'smooth' }); }
  }
});

/* ---------- sound toggle ---------- */
function setSound(on) {
  sound.setEnabled(on);
  $('sound-btn').classList.toggle('on', on); $('sound-btn').setAttribute('aria-pressed', String(on));
  $('sound-label').textContent = on ? 'Sound on' : 'Sound off';
  try { sessionStorage.setItem('spirit-sound', on ? '1' : '0'); } catch (e) {}
  if (on) sound.setSection(Math.max(0, active));
}
$('sound-btn').addEventListener('click', () => { setSound(!sound.enabled); if (sound.enabled) sound.click(); });

/* ---------- toast ---------- */
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 4200); }

/* ---------- main loop ---------- */
let lastY = scrollY, vel = 0, lastT = performance.now();
function loop() {
  const now = performance.now(), dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  const y = scrollY; vel += ((y - lastY) - vel) * .2; lastY = y;
  const s = currentSection(); if (s !== active) setSection(s);
  const max = document.documentElement.scrollHeight - innerHeight;
  $('progress').style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  sound.setEnergy(Math.min(1, Math.abs(vel) / 45));
  if (scene) {
    // inside the standings, scrolling slowly turns the crystals
    let spin = 0;
    if (active === 1) { const r = secs[1].getBoundingClientRect(); spin = ((-r.top) / Math.max(1, r.height - innerHeight) - .5) * .5; }
    if (detailKey) {
      const vw = scene.visW;
      if (mobile) scene.setCam(0, 1.2, 12, 0, .3, 0); else scene.setCam(vw * .1 + 1.4, 1.3, 10.4, vw * .1, -.3, 0);
    } else if (entered) { const [p, l] = pathAt(storyS()); scene.setCam(...p, ...l); }
    scene.render(vel, spin);
    if (active === 1 && !mobile && entered) {
      setHover(pillarAt(mx, my) || ($('board').matches(':hover') ? hovered : null));
      if (hovered) { const c = $('pinfo'), w = c.offsetWidth, h = c.offsetHeight; c.style.left = Math.min(innerWidth - w - 12, mx + 22) + 'px'; c.style.top = Math.min(innerHeight - h - 12, my + 22) + 'px'; }
    }
    sound.sparkle(scene.stir);
    if (active === 1) rows.forEach(x => {
      const L = labels[x.id]; if (!L) return;
      const a = scene.project(x.id), b = scene.project(x.id + '-base');
      if (a) L.top.style.transform = `translate(${a.x}px,${a.y}px) translate(-50%,-100%)`;
      if (b) L.base.style.transform = `translate(${b.x}px,${b.y}px) translate(-50%,0)`;
    });
  }
  if (active >= 1 && active <= 3) updateDeck(dt);
  if (hovered && mobile) { const c = $('pinfo'); c.style.left = '16px'; c.style.top = (innerHeight * .2) + 'px'; }
  cx += (mx - cx) * .18; cy += (my - cy) * .18;
  cursor.style.transform = `translate(${cx}px,${cy}px)`; dot.style.transform = `translate(${mx}px,${my}px)`;
  requestAnimationFrame(loop);
}

/* ---------- data loading and live updates ---------- */
async function load(isRefresh) {
  try {
    const entries = await fetchScores();
    const before = JSON.stringify(state.entries), prevKeys = new Set(state.entries.map(e => e.row + '|' + e.challenge));
    state.entries = entries; state.loaded = true; state.error = false; state.checkedAt = Date.now();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ entries, at: state.checkedAt })); } catch (e) {}
    const changed = before !== JSON.stringify(entries);
    const fresh = isRefresh ? entries.map(e => e.row + '|' + e.challenge).filter(k => !prevKeys.has(k)) : [];
    renderContent({ fresh });
    if (isRefresh && changed && entered) {
      if (scene) { targets.pillars = scene.pillarsTarget(rows); if (active === 1) { scene.morphTo(targets.pillars, { duration: 1.7, scatter: .8 }); sound.whoosh(1.1, true); } }
      if (seen.has(1)) countLabels(false);
      const newest = newestFirst(entries)[0];
      toast(fresh.length && newest ? 'New results · ' + newest.challenge : 'Standings updated');
      sound.shimmer(4);
    }
  } catch (e) {
    if (!state.entries.length) state.error = true;
    renderContent();
  }
}

/* ---------- boot: loader, then the gate ---------- */
async function boot() {
  renderContent();
  const bar = $('load-bar'), pct = $('load-pct');
  let done = 0; const total = 3, shown = { v: 0 };
  const tick = () => { done++; };
  const animPct = () => {
    shown.v += ((done / total) * 100 - shown.v) * .12;
    bar.style.transform = `scaleX(${shown.v / 100})`; pct.textContent = Math.round(shown.v) + '%';
    if (shown.v < 99.5) requestAnimationFrame(animPct); else { pct.textContent = '100%'; bar.style.transform = 'scaleX(1)'; }
  };
  requestAnimationFrame(animPct);
  scramble($('load-title'), TITLE.toUpperCase(), { duration: 900, ticks: false });

  const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]).then(tick);
  const stage = (async () => {
    if (reduce) return;
    try {
      const { Scene } = await import('./scene.js');
      const s = new Scene($('gl'), { mobile });
      await s.loadLogo('/assets/logo.png');
      scene = s; buildTargets();
      scene.onLand = () => sound.shimmer(active === 1 ? 6 : 4);
    } catch (e) { scene = null; }
  })().then(tick);
  const data = Promise.race([load(false), new Promise(r => setTimeout(r, 4500))]).then(tick);
  await Promise.all([fonts, stage, data]);
  if (!scene) document.body.classList.add('static');
  if (scene) buildTargets();

  // coming through a train door: skip the gate; sound wakes on the first tap or key if it was on
  let fromHub = false;
  try { fromHub = Date.now() - Number(sessionStorage.getItem('spirit-door') || 0) < 15000; sessionStorage.removeItem('spirit-door'); } catch (e) {}
  const ready = () => {
    if (!scene) { enter(false); return; }
    if (fromHub) {
      let wantSound = false; try { wantSound = sessionStorage.getItem('spirit-sound') === '1'; } catch (e) {}
      enter(false);
      if (wantSound) {
        $('sound-label').textContent = 'Tap for sound';
        const wake = () => { removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); setSound(true); };
        addEventListener('pointerdown', wake); addEventListener('keydown', wake);
      }
      return;
    }
    $('gate').classList.add('ready');
    $('enter-sound').focus({ preventScroll: true });
  };
  setTimeout(ready, 450);
}
let entering = false;
function enter(withSound) {
  if (entering) return; entering = true;
  if (withSound) setSound(true);
  document.body.classList.add('has-cursor');
  const loader = $('loader');
  if (scene) {
    // opening shot: the camera starts up close in the dark, ice dust rushes in from far away,
    // the block crystallizes from its core outward, then the camera pulls back to reveal it
    scene.setInstant(scene.tunnelTarget());
    scene.setCam(.6, -.3, 3.2, 0, .5, -2); scene.snapCam();
    loader.classList.add('out'); setTimeout(() => loader.remove(), 2100);
    document.body.classList.remove('pre');
    sound.impact();
    active = -1; setSection(currentSection(), true);
    scene.morphTo(targetFor(active), { duration: 3.6, scatter: .35, order: 'radial' });
    setTimeout(() => { entered = true; }, 900); // hold the close-up for a beat before the pull-back
    setTimeout(() => { scene.flash(.035); sound.shimmer(6); }, 1500);
    scramble($('hero-title'), TITLE, { duration: 1400, delay: 1500 });
  } else {
    loader.remove(); document.body.classList.remove('pre'); entered = true; setSection(currentSection(), true);
    seen.add(1); seen.add(2); flipIn($('st-title')); flipIn($('rs-title')); sizeResults();
  }
}
$('enter-sound').addEventListener('click', () => enter(true));
$('enter-quiet').addEventListener('click', () => enter(false));

let rT;
addEventListener('resize', () => {
  clearTimeout(rT);
  rT = setTimeout(() => { if (!scene) return; scene.resize(); buildTargets(); if (entered && active >= 0) scene.morphTo(targetFor(active), { duration: .9, scatter: .3 }); }, 220);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
setInterval(() => { if (!document.hidden) load(true); }, Math.max(15, CONFIG.refreshSeconds) * 1000);

boot();
requestAnimationFrame(loop);
