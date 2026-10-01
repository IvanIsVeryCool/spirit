import { DOORS, SITE } from './doors.js';
import { StationAudio } from './audio.js';

window.__hubBooted = true;
const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const audio = new StationAudio();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const no = i => String(i + 1).padStart(2, '0');

/* film grain */
(() => {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'), d = x.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
})();

$('brand-name').textContent = `${SITE.school} Spirit`;
$('title').textContent = SITE.name;

/* text scramble, used for the platform board */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function scramble(el, text, duration = 700) {
  if (reduce) { el.textContent = text; return; }
  const id = (el._s = (el._s || 0) + 1), t0 = performance.now(), rev = [...text].map((_, i) => (i / text.length) * duration * .6 + Math.random() * duration * .4);
  const f = now => {
    if (el._s !== id) return; const t = now - t0; let out = '', done = true;
    for (let i = 0; i < text.length; i++) { const ch = text[i]; if (ch === ' ' || ch === '·' || t >= rev[i]) out += ch; else { done = false; out += GLYPHS[(Math.random() * GLYPHS.length) | 0]; } }
    el.textContent = out; if (!done) requestAnimationFrame(f); else el.textContent = text;
  };
  requestAnimationFrame(f);
}

/* door labels and the bottom door list */
$('labels').innerHTML = DOORS.map((d, i) => `<button class="dlabel" type="button" data-i="${i}" aria-label="${esc(d.title)}${d.href ? '' : ' (coming soon)'}"><span class="no mono">Car ${no(i)}</span><span class="t">${esc(d.title)}</span><span class="st mono${d.href ? ' live' : ''}">${esc(d.status || (d.href ? 'Open' : 'Coming soon'))}</span><span class="line" aria-hidden="true"></span></button>`).join('');
$('doornav').innerHTML = `<button class="navarrow" type="button" data-step="-1" aria-label="Previous car">←</button>` +
  DOORS.map((d, i) => `<button type="button" data-i="${i}"><b>${no(i)}</b>${esc(d.title)}</button>`).join('') +
  `<button class="navarrow" type="button" data-step="1" aria-label="Next car">→</button>`;
const labelEls = [...document.querySelectorAll('.dlabel')], navEls = [...document.querySelectorAll('.doornav [data-i]')];

/* state */
let station = null, entered = false, doorsOpen = false, focus = 0, hover = -1, boarding = false;
function setFocus(i) {
  focus = (i + DOORS.length) % DOORS.length;
  navEls.forEach((b, k) => b.classList.toggle('on', k === focus));
  if (station) station.setFocus(focus);
  if (mobile) labelEls.forEach((l, k) => l.classList.toggle('dim', k !== focus));
}
function setHover(i) {
  if (i === hover) return; hover = i;
  if (station) station.setHover(i);
  labelEls.forEach((l, k) => l.classList.toggle('hover', k === i));
  navEls.forEach((b, k) => b.classList.toggle('on', k === (i >= 0 ? i : focus)));
  $('cursor').classList.toggle('hover', i >= 0);
  if (i >= 0) audio.blip(.9 + i * .06);
}

/* choosing a door */
function choose(i) {
  if (boarding) return;
  const d = DOORS[i];
  if (mobile && i !== focus && station) { setFocus(i); audio.blip(); return; }
  if (d.href) {
    if (!station || !doorsOpen) { location.href = d.href; return; }
    boarding = true; audio.board();
    try { sessionStorage.setItem('spirit-door', String(Date.now())); } catch (e) {}
    setTimeout(() => $('flash').classList.add('on'), 1050);
    station.board(i, () => { location.href = d.href; });
    return;
  }
  // a car that isn't open yet
  $('soon-no').textContent = `Car ${no(i)} · Coming soon`;
  $('soon-title').textContent = d.title;
  $('soon-text').textContent = `${d.sub ? d.sub + '. ' : ''}This car isn’t open yet. The Spirit Cabinet is still building it, so check back soon.`;
  const s = $('soon'); s.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('open')));
  s.querySelector('.close').focus({ preventScroll: true });
  audio.chime();
}
function closeSoon() { const s = $('soon'); if (s.hidden) return; s.classList.remove('open'); setTimeout(() => { s.hidden = true; }, 500); audio.blip(.8); }
$('soon').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSoon(); });
$('labels').addEventListener('click', e => { const b = e.target.closest('.dlabel'); if (b) choose(Number(b.dataset.i)); });
$('labels').addEventListener('pointerover', e => { const b = e.target.closest('.dlabel'); if (b && !mobile) setHover(Number(b.dataset.i)); });
$('doornav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.step) { setFocus(focus + Number(b.dataset.step)); audio.blip(); return; }
  choose(Number(b.dataset.i));
});
$('doornav').addEventListener('pointerover', e => { const b = e.target.closest('[data-i]'); if (b && !mobile) setHover(Number(b.dataset.i)); });
$('doornav').addEventListener('pointerleave', () => { if (!mobile) setHover(-1); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSoon();
  if (!doorsOpen || !$('soon').hidden) return;
  if (e.key === 'ArrowRight') { setFocus(focus + 1); setHover(mobile ? -1 : focus); }
  if (e.key === 'ArrowLeft') { setFocus(focus - 1); setHover(mobile ? -1 : focus); }
});

/* pointer: hover doors in 3D, click to choose, swipe between cars on phones */
const cursor = $('cursor'), dot = $('cursor-dot');
let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my, downX = null;
addEventListener('pointermove', e => {
  mx = e.clientX; my = e.clientY;
  if (station) station.setPointer((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1);
}, { passive: true });
$('station').addEventListener('pointerdown', e => { downX = e.clientX; });
$('station').addEventListener('pointerup', e => {
  if (!entered) return;
  if (!doorsOpen) { skipArrival(); return; }
  if (mobile && downX !== null && Math.abs(e.clientX - downX) > 40) { setFocus(focus + (e.clientX < downX ? 1 : -1)); audio.blip(); downX = null; return; }
  downX = null;
  const i = station ? station.pick((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1) : -1;
  if (i >= 0) choose(i);
});

/* sound toggle */
function setSound(on) {
  audio.setEnabled(on);
  $('sound-btn').classList.toggle('on', on); $('sound-btn').setAttribute('aria-pressed', String(on));
  $('sound-label').textContent = on ? 'Sound on' : 'Sound off';
  try { sessionStorage.setItem('spirit-sound', on ? '1' : '0'); } catch (e) {}
}
$('sound-btn').addEventListener('click', () => { setSound(!audio.enabled); audio.blip(); });

/* the arrival sequence */
function arrived() {
  if (doorsOpen) return;
  scramble($('kicker'), 'Platform 1 · Doors open');
  audio.chime();
  setTimeout(() => {
    doorsOpen = true;
    if (station) station.openDoors(); audio.doors(DOORS.length);
    $('labels').classList.add('show'); $('doornav').classList.add('show');
    setFocus(focus);
  }, 900);
}
function skipArrival() { if (doorsOpen || !station) return; station.park(); arrived(); }

/* main loop */
function loop() {
  if (station) {
    if (doorsOpen && !mobile && !boarding && $('soon').hidden && !document.querySelector('.dlabel:hover') && !$('doornav').matches(':hover')) {
      setHover(station.pick((mx / innerWidth) * 2 - 1, -(my / innerHeight) * 2 + 1));
    }
    station.render();
    labelEls.forEach((l, i) => { const p = station.project(i); l.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-100%)`; l.style.visibility = p.vis ? '' : 'hidden'; });
  }
  cx += (mx - cx) * .18; cy += (my - cy) * .18;
  cursor.style.transform = `translate(${cx}px,${cy}px)`; dot.style.transform = `translate(${mx}px,${my}px)`;
  requestAnimationFrame(loop);
}

/* boot: load the station, then the enter gate */
async function boot() {
  const bar = $('load-bar'), pct = $('load-pct');
  let done = 0; const total = 2, shown = { v: 0 };
  const anim = () => {
    shown.v += ((done / total) * 100 - shown.v) * .12;
    bar.style.transform = `scaleX(${shown.v / 100})`; pct.textContent = Math.round(shown.v) + '%';
    if (shown.v < 99.5) requestAnimationFrame(anim); else { pct.textContent = '100%'; bar.style.transform = 'scaleX(1)'; }
  };
  requestAnimationFrame(anim);
  scramble($('load-title'), `${SITE.school} Spirit`.toUpperCase(), 900);
  const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]).then(() => done++);
  const stage = (async () => {
    if (reduce) return;
    try { const { Station } = await import('./station.js'); station = new Station($('station'), { mobile, count: DOORS.length }); station.render(); }
    catch (e) { station = null; }
  })().then(() => done++);
  await Promise.all([fonts, stage]);
  if (!station) { document.body.classList.add('static'); enter(false); return; }
  setTimeout(() => { $('gate').classList.add('ready'); $('enter-sound').focus({ preventScroll: true }); }, 450);
}
function enter(withSound) {
  if (entered) return; entered = true;
  if (withSound) setSound(true);
  document.body.classList.add('has-cursor'); document.body.classList.remove('pre');
  const loader = $('loader'); loader.classList.add('out'); setTimeout(() => loader.remove(), 1900);
  if (!station) { doorsOpen = true; $('doornav').classList.add('show'); return; }
  station.arrive(4.6, arrived);
  audio.arrive(4.6);
  scramble($('kicker'), 'Platform 1 · Now arriving');
}
$('enter-sound').addEventListener('click', () => enter(true));
$('enter-quiet').addEventListener('click', () => enter(false));

addEventListener('resize', () => { if (station) station.resize(); });
// coming back with the browser's back button: clear the white-out and settle on the platform
addEventListener('pageshow', e => { if (e.persisted) { boarding = false; $('flash').classList.remove('on'); if (station) { station.flight = null; station.doors.forEach(d => { d.target = doorsOpen ? 1 : 0; }); } } });

boot();
requestAnimationFrame(loop);
