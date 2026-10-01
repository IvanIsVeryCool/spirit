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

  // results
  const body = $('res-body');
  if (!entries.length) {
    body.innerHTML = `<p class="empty">${state.error ? 'Results couldn’t load. Refresh the page to try again.' : state.loaded ? 'No events scored yet.' : 'Loading results…'}</p>`;
  } else {
    body.innerHTML = '<ol class="res-list">' + newestFirst(entries).map(e => {
      const d = e.t ? new Date(e.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const pts = GRADES.map(g => ({ g, p: Number(e.points[g.id] || 0) })).filter(x => x.p).sort((a, b) => b.p - a.p);
      const key = e.row + '|' + e.challenge;
      return `<li class="res${revealed.has(key) ? '' : ' pending'}${fresh.includes(key) ? ' fresh' : ''}" data-key="${esc(key)}"><span class="when mono">${d}</span><span class="what" data-text="${esc(e.challenge)}">${esc(e.challenge)}</span><span class="pts">${pts.map((x, i) => `<span class="chip${i === 0 && x.p > 0 ? ' top' : ''}" style="--c:var(--${x.g.id})"><i>${yy(x.g.year)}</i>${x.p > 0 ? '+' : '−'}${fmt(Math.abs(x.p))}</span>`).join('')}</span></li>`;
    }).join('') + '</ol>';
    observeResults();
  }
  buildLabels();
}

/* results rows reveal one by one as they scroll in */
const revealed = new Set();
let resIO = null;
function observeResults() {
  if (document.body.classList.contains('static') || !('IntersectionObserver' in window)) {
    document.querySelectorAll('.res.pending').forEach(el => { el.classList.remove('pending'); revealed.add(el.dataset.key); });
    return;
  }
  resIO && resIO.disconnect();
  let stagger = 0, last = 0;
  resIO = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target; resIO.unobserve(el);
    const now = performance.now(); if (now - last > 400) stagger = 0; last = now;
    const d = stagger++ * 90;
    setTimeout(() => { el.classList.remove('pending'); revealed.add(el.dataset.key); scramble(el.querySelector('.what'), el.querySelector('.what').dataset.text, { duration: 700 }); sound.blip(1 + Math.random() * .25); }, d);
  }), { threshold: .2, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.res.pending').forEach(el => resIO.observe(el));
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
  targets.logo = scene.logoTarget(mobile ? 1.15 : 1.0);
  targets.endLogo = scene.logoTarget(mobile ? 1.6 : 1.5);
  targets.pillars = scene.pillarsTarget(rows);
  targets.ring = scene.ringTarget();
  targets.words = {};
}
function wordTarget(w) { if (!targets.words[w]) targets.words[w] = scene.textTarget(w, mobile ? 1.7 : 1.6); return targets.words[w]; }
const CAMS = [[0, 0, 12, 0], [0, .35, 11.2, .15], [0, -.2, 12.6, -.1], [0, .2, 12, .25]];
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
  if (scene && entered) {
    scene.morphTo(targetFor(i), { duration: i === 1 ? 2.1 : 1.8, scatter: prev === -1 ? 1.6 : 1.1 });
    scene.setCamera(...CAMS[i]);
    sound.whoosh(1.3, i > prev);
  }
  if (!seen.has(i) && entered) {
    seen.add(i);
    if (i === 1) { scramble($('st-title'), 'The Race', { duration: 800 }); countLabels(true); }
    if (i === 2) scramble($('rs-title'), 'Every Event', { duration: 800 });
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
addEventListener('pointermove', e => {
  mx = e.clientX; my = e.clientY;
  if (scene && e.pointerType === 'mouse') scene.setPointer((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1, true);
}, { passive: true });
document.documentElement.addEventListener('mouseleave', () => scene && scene.setPointer(0, 0, false));
document.addEventListener('pointerover', e => {
  const t = e.target.closest('a,button,.res');
  if (t && !t.contains(e.relatedTarget)) { cursor.classList.add('hover'); if (entered) sound.blip(t.classList.contains('res') ? .9 : 1); }
});
document.addEventListener('pointerout', e => { const t = e.target.closest('a,button,.res'); if (t && !t.contains(e.relatedTarget)) cursor.classList.remove('hover'); });

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
let lastY = scrollY, vel = 0;
function loop() {
  const y = scrollY; vel += ((y - lastY) - vel) * .2; lastY = y;
  const s = currentSection(); if (s !== active) setSection(s);
  const max = document.documentElement.scrollHeight - innerHeight;
  $('progress').style.transform = `scaleX(${max > 0 ? y / max : 0})`;
  sound.setEnergy(Math.min(1, Math.abs(vel) / 45));
  if (scene) {
    // inside the standings, scrolling slowly turns the crystals
    let spin = 0;
    if (active === 1) { const r = secs[1].getBoundingClientRect(); spin = ((-r.top) / Math.max(1, r.height - innerHeight) - .5) * .5; }
    scene.render(vel, spin);
    if (active === 1) rows.forEach(x => {
      const L = labels[x.id]; if (!L) return;
      const a = scene.project(x.id), b = scene.project(x.id + '-base');
      if (a) L.top.style.transform = `translate(${a.x}px,${a.y}px) translate(-50%,-100%)`;
      if (b) L.base.style.transform = `translate(${b.x}px,${b.y}px) translate(-50%,0)`;
    });
  }
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
      await s.loadLogo('assets/logo.png');
      scene = s; buildTargets();
      scene.onLand = () => sound.shimmer(active === 1 ? 6 : 4);
    } catch (e) { scene = null; }
  })().then(tick);
  const data = Promise.race([load(false), new Promise(r => setTimeout(r, 4500))]).then(tick);
  await Promise.all([fonts, stage, data]);
  if (!scene) document.body.classList.add('static');
  if (scene) buildTargets();

  const ready = () => {
    if (!scene) { enter(false); return; }
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
    // hand off: particles start exactly where the loader logo sits, then grow into the full logo
    const lr = loader.querySelector('.logo-img').getBoundingClientRect();
    scene.camera.position.set(0, 0, 12);
    scene.setInstant(scene.logoAtRect(lr));
    loader.classList.add('out'); setTimeout(() => loader.remove(), 2100);
    document.body.classList.remove('pre');
    sound.impact();
    active = -1; setSection(currentSection(), true); entered = true;
    scene.setCamera(...CAMS[active]);
    setTimeout(() => scene.morphTo(targetFor(active), { duration: 2.6, scatter: .45 }), 250);
    scramble($('hero-title'), TITLE, { duration: 1400, delay: 1250 });
  } else {
    loader.remove(); document.body.classList.remove('pre'); entered = true; setSection(currentSection(), true);
    seen.add(1); seen.add(2);
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
