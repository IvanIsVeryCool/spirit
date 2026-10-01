import { DOORS, SITE } from './doors.js';
import { StationAudio } from './audio.js';

window.__hubBooted = true;
const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const audio = new StationAudio();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const no = i => String(i + 1).padStart(2, '0');

$('brand-name').textContent = SITE.school;
$('tk-name').textContent = `${SITE.school} Spirit`;

/* state */
let station = null, entered = false, doorsOpen = false, focus = 0, hover = -1, boarding = false;

/* departure board */
function statusOf(d) { return d.href ? (doorsOpen ? 'BOARDING' : 'ARRIVING') : 'SOON'; }
function renderBoard() {
  $('rows').innerHTML = DOORS.map((d, i) => `<button class="row${i === focus && mobile && doorsOpen ? ' on' : ''}" type="button" data-i="${i}" aria-label="Car ${no(i)}: ${esc(d.title)}, ${d.href ? 'open' : 'coming soon'}"><span class="c">${no(i)}</span><span class="d">${esc(d.title.toUpperCase())}</span><span class="s${d.href ? (doorsOpen ? ' live' : ' due') : ''}">${statusOf(d)}</span></button>`).join('');
}
function tickClock() { $('clock').textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toUpperCase(); }
tickClock(); setInterval(tickClock, 15000);
renderBoard();

function setFocus(i) {
  focus = (i + DOORS.length) % DOORS.length;
  if (station) station.setFocus(focus);
  document.querySelectorAll('.row').forEach((r, k) => r.classList.toggle('on', mobile && doorsOpen && k === focus));
}
function setHover(i) {
  if (i === hover) return; hover = i;
  if (station) station.setHover(i);
  $('station').classList.toggle('pointer', i >= 0);
  if (i >= 0) audio.tick();
}

/* choosing a car */
function choose(i) {
  if (boarding || !entered) return;
  const d = DOORS[i];
  if (mobile && station && i !== focus) { setFocus(i); audio.tick(); setTimeout(() => choose(i), 800); return; }
  if (d.href) {
    audio.beep();
    if (!station || !doorsOpen) { location.href = d.href; return; }
    boarding = true; audio.board(); document.body.classList.add('boarding');
    try { sessionStorage.setItem('spirit-door', String(Date.now())); } catch (e) {}
    setTimeout(() => $('flash').classList.add('on'), 1150);
    station.board(i, () => { location.href = d.href; });
    return;
  }
  $('n-car').textContent = `Car ${no(i)}`;
  $('n-title').textContent = d.title;
  $('n-text').textContent = `${d.sub ? d.sub + '. ' : ''}This car isn’t in service yet. The Spirit Cabinet is still building it, so check back soon.`;
  const n = $('notice'); n.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('open')));
  n.querySelector('.n-close').focus({ preventScroll: true });
  audio.chime();
}
function closeNotice() { const n = $('notice'); if (n.hidden) return; n.classList.remove('open'); setTimeout(() => { n.hidden = true; }, 450); audio.tick(); }
$('notice').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeNotice(); });
$('rows').addEventListener('click', e => { const b = e.target.closest('.row'); if (b) choose(Number(b.dataset.i)); });
$('rows').addEventListener('pointerover', e => { const b = e.target.closest('.row'); if (b && !mobile) setHover(Number(b.dataset.i)); });
$('rows').addEventListener('pointerleave', () => { if (!mobile) setHover(-1); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') closeNotice();
  if (!doorsOpen || !$('notice').hidden || !station) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { setFocus(focus + (e.key === 'ArrowRight' ? 1 : -1)); if (!mobile) setHover(focus); }
});

/* pointer on the 3D scene: hover doors, click to board, swipe between cars on phones */
let mx = innerWidth / 2, my = innerHeight / 2, downX = null, overUI = false;
const ndc = (x, y) => [(x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1];
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; overUI = e.target !== $('station'); if (station) station.setPointer(...ndc(mx, my)); }, { passive: true });
$('station').addEventListener('pointerdown', e => { downX = e.clientX; });
$('station').addEventListener('pointerup', e => {
  if (!entered || boarding) return;
  if (!doorsOpen) { skipArrival(); return; }
  if (mobile && downX !== null && Math.abs(e.clientX - downX) > 40) { setFocus(focus + (e.clientX < downX ? 1 : -1)); audio.tick(); downX = null; return; }
  downX = null;
  const i = station ? station.pick(...ndc(e.clientX, e.clientY)) : -1;
  if (i >= 0) choose(i);
});

/* sound toggle */
function setSound(on) {
  audio.setEnabled(on);
  $('sound-btn').classList.toggle('on', on); $('sound-btn').setAttribute('aria-pressed', String(on));
  $('sound-label').textContent = on ? 'Sound on' : 'Sound off';
}
$('sound-btn').addEventListener('click', () => { setSound(!audio.enabled); audio.tick(); });

/* arrival */
function arrived() {
  if (doorsOpen) return;
  $('kicker').textContent = 'Platform 1 · Doors open';
  audio.chime();
  setTimeout(() => {
    doorsOpen = true; renderBoard(); setFocus(focus);
    if (station) station.openDoors(); audio.doors(DOORS.length);
  }, 1100);
}
function skipArrival() { if (doorsOpen || !station) return; station.park(); arrived(); }

function loop() {
  if (station) {
    if (doorsOpen && !mobile && !boarding && $('notice').hidden && !overUI) setHover(station.pick(...ndc(mx, my)));
    station.render();
  }
  requestAnimationFrame(loop);
}

/* boot: load, then the ticket gate */
async function boot() {
  const bar = $('load-bar'), dot = $('load-dot'), pct = $('load-pct');
  let done = 0; const total = 2, shown = { v: 0 };
  const anim = () => {
    shown.v += ((done / total) * 100 - shown.v) * .1;
    bar.style.transform = `scaleX(${shown.v / 100})`; dot.style.left = shown.v + '%'; pct.textContent = Math.round(shown.v) + '%';
    if (shown.v < 99.5) requestAnimationFrame(anim); else { pct.textContent = '100%'; bar.style.transform = 'scaleX(1)'; dot.style.left = '100%'; }
  };
  requestAnimationFrame(anim);
  const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]).then(() => done++);
  const stage = (async () => {
    if (reduce) return;
    try {
      const { Station } = await import('./station.js');
      const logo = new Image(); logo.src = '/assets/logo.png'; await logo.decode().catch(() => {});
      station = new Station($('station'), { mobile, doors: DOORS, logo: logo.naturalWidth ? logo : null }); station.render();
    }
    catch (e) { console.warn(e); station = null; }
  })().then(() => done++);
  await Promise.all([fonts, stage]);
  if (station) station.redrawSigns(); // once the LED font has loaded
  $('load-state').textContent = 'Ready to board';
  if (!station) { document.body.classList.add('static'); enter(false); return; }
  setTimeout(() => { $('gate').classList.add('ready'); $('enter-sound').focus({ preventScroll: true }); }, 350);
}
function enter(withSound) {
  if (entered) return; entered = true;
  if (withSound) setSound(true);
  const loader = $('loader');
  $('ticket').classList.add('punched'); audio.punch();
  setTimeout(() => loader.classList.add('out'), 260);
  setTimeout(() => loader.remove(), 2200);
  document.body.classList.remove('pre');
  setTimeout(() => $('board').classList.add('show'), station ? 1300 : 0);
  if (!station) { doorsOpen = true; renderBoard(); return; }
  setTimeout(() => { station.arrive(6, arrived); audio.arrive(6); }, 500);
}
$('enter-sound').addEventListener('click', () => enter(true));
$('enter-quiet').addEventListener('click', () => enter(false));

addEventListener('resize', () => { if (station) station.resize(); });
addEventListener('pageshow', e => {
  if (e.persisted) { boarding = false; document.body.classList.remove('boarding'); $('flash').classList.remove('on'); if (station) { station.flight = null; station.doors.forEach(d => { d.target = doorsOpen ? 1 : 0; }); } }
});

boot();
requestAnimationFrame(loop);
