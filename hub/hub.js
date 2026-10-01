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
$('tk-name').textContent = `${SITE.school} Spirit Line`;

/* ---------- the ticket ---------- */
const now = new Date(), departs = new Date(now.getTime() + 60000);
const T = {
  date: now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  time: departs.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  serial: 'NSL ' + String(now.getFullYear()).slice(2) + String(Math.floor(Math.random() * 1e6)).padStart(6, '0'),
  stamp: now.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase() + ' ' + now.getFullYear() + ' \u00b7 ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
};
$('tk-date').textContent = T.date; $('tk-time').textContent = T.time; $('tk-serial').textContent = T.serial; $('stamp-date').textContent = T.stamp;
const bars = []; { let seed = 7; for (let i = 0; i < 38; i++) { seed = (seed * 9301 + 49297) % 233280; bars.push(1 + Math.floor(seed / 233280 * 3.4)); } }
$('barcode').innerHTML = bars.map(w => `<i style="width:${w}px"></i>`).join('');
(() => { // paper grain
  const c = document.createElement('canvas'); c.width = c.height = 140; const x = c.getContext('2d'), d = x.createImageData(140, 140);
  for (let i = 0; i < d.data.length; i += 4) { const v = 120 + Math.random() * 100; d.data[i] = v; d.data[i + 1] = v * .96; d.data[i + 2] = v * .88; d.data[i + 3] = Math.random() * 26; }
  x.putImageData(d, 0, 0); document.documentElement.style.setProperty('--grain-img', `url(${c.toDataURL()})`);
})();
// the ticket tilts toward the pointer and its foil sticker shimmers
$('loader').addEventListener('pointermove', e => {
  if (reduce) return;
  const r = $('ticket').getBoundingClientRect(), nx = (e.clientX - (r.left + r.width / 2)) / innerWidth, ny = (e.clientY - (r.top + r.height / 2)) / innerHeight;
  const tk = $('ticket').style;
  tk.setProperty('--ry', (nx * 14).toFixed(2) + 'deg'); tk.setProperty('--rx', (-ny * 12).toFixed(2) + 'deg');
  tk.setProperty('--hx', (50 + nx * 120).toFixed(1) + '%'); tk.setProperty('--hy', (50 + ny * 120).toFixed(1) + '%');
});
// the same ticket, drawn for your hands in the 3D scene: validated and punched
function ticketCanvas() {
  const c = document.createElement('canvas'); c.width = 720; c.height = 312; const x = c.getContext('2d'), W = c.width, H = c.height;
  x.fillStyle = '#f6f0e5'; x.beginPath(); x.roundRect(0, 0, W, H, 18); x.fill();
  x.strokeStyle = 'rgba(201,39,44,.06)'; x.lineWidth = 1; for (let i = -H; i < W; i += 9) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + H * .6, H); x.stroke(); }
  x.fillStyle = '#c9272c'; x.beginPath(); x.roundRect(0, 0, 540, 48, [18, 0, 0, 0]); x.fill();
  x.fillStyle = '#fff'; x.font = '900 24px Archivo, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText(`${SITE.school.toUpperCase()} SPIRIT LINE`, 22, 25);
  x.font = '700 14px "Public Sans", Arial, sans-serif'; x.fillText('SINGLE RIDE', 430, 25);
  x.fillStyle = '#5b5e68'; x.font = '700 13px "Public Sans", Arial, sans-serif'; x.fillText('FROM', 22, 78); x.fillText('TO', 330, 78);
  x.fillStyle = '#16181f'; x.font = '900 34px Archivo, Arial, sans-serif'; x.fillText('CAMPUS', 22, 108); x.fillText('SPIRIT CABINET', 330, 108);
  x.strokeStyle = '#16181f'; x.lineWidth = 3; x.setLineDash([6, 5]); x.beginPath(); x.moveTo(190, 104); x.lineTo(316, 104); x.stroke(); x.setLineDash([]);
  x.strokeStyle = 'rgba(22,24,31,.25)'; x.setLineDash([5, 5]); x.lineWidth = 2; x.beginPath(); x.moveTo(22, 140); x.lineTo(518, 140); x.moveTo(22, 206); x.lineTo(518, 206); x.stroke(); x.setLineDash([]);
  [['DATE', T.date], ['DEPARTS', T.time], ['PLATFORM', '1'], ['CLASS', 'ALL GRADES']].forEach(([k, v], i) => {
    x.fillStyle = '#5b5e68'; x.font = '700 12px "Public Sans", Arial, sans-serif'; x.fillText(k, 22 + i * 126, 160);
    x.fillStyle = '#16181f'; x.font = '700 19px "Public Sans", Arial, sans-serif'; x.fillText(v, 22 + i * 126, 186);
  });
  x.fillStyle = '#7a7568'; x.font = '500 12px "Public Sans", Arial, sans-serif'; x.fillText('Valid for one ride on the day of issue. Go Nueva.', 22, 232);
  x.strokeStyle = 'rgba(22,24,31,.3)'; x.setLineDash([7, 6]); x.beginPath(); x.moveTo(552, 8); x.lineTo(552, H - 8); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#c9272c'; x.font = '900 22px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.fillText('ADMIT', 636, 58); x.fillText('ONE', 636, 84); x.textAlign = 'left';
  let bx = 576; x.fillStyle = '#16181f'; bars.forEach((w, i) => { if (i % 2 === 0) x.fillRect(bx, 150, w * 1.6, 90); bx += w * 1.6 + 1.6; });
  x.font = '400 14px DotGothic16, monospace'; x.fillText(T.serial, 578, 262);
  // validation stamp
  x.save(); x.translate(400, 250); x.rotate(-.24); x.strokeStyle = 'rgba(201,39,44,.85)'; x.lineWidth = 4; x.strokeRect(-104, -30, 208, 60); x.lineWidth = 1.5; x.strokeRect(-97, -23, 194, 46);
  x.fillStyle = 'rgba(201,39,44,.85)'; x.font = '900 28px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.fillText('VALIDATED', 0, -2); x.font = '400 12px DotGothic16, monospace'; x.fillText(T.stamp, 0, 18); x.restore();
  // punch hole
  x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(690, 30, 13, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over';
  return c;
}

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
  if (!entered || boarding || introPlaying) return;
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
  const bar = $('load-bar'), dot = $('mini-train'), pct = $('load-pct');
  let done = 0; const total = 2, shown = { v: 0 };
  const anim = () => {
    shown.v += ((done / total) * 100 - shown.v) * .1;
    bar.style.transform = `scaleX(${shown.v / 100})`; dot.style.left = `calc(6px + (100% - 12px) * ${shown.v / 100})`; pct.textContent = Math.round(shown.v) + '%';
    if (shown.v < 99.5) requestAnimationFrame(anim); else { pct.textContent = '100%'; bar.style.transform = 'scaleX(1)'; dot.style.left = 'calc(100% - 6px)'; }
  };
  requestAnimationFrame(anim);
  const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]).then(() => done++);
  const stage = (async () => {
    if (reduce) return;
    try {
      const { Station } = await import('./station.js');
      const logo = new Image(); logo.src = '/assets/logo.png'; await logo.decode().catch(() => {});
      station = new Station($('station'), { mobile, doors: DOORS, logo: logo.naturalWidth ? logo : null }); if (location.hash === '#debug') window.__st = station; station.render();
    }
    catch (e) { console.warn(e); station = null; }
  })().then(() => done++);
  await Promise.all([fonts, stage]);
  if (station) station.redrawSigns(); // once the LED font has loaded
  $('load-state').textContent = 'Ready to board \u00b7 your train is on time';
  if (!station) { document.body.classList.add('static'); enter(false); return; }
  setTimeout(() => { $('gate').classList.add('ready'); $('enter-sound').focus({ preventScroll: true }); }, 350);
}
let introPlaying = false;
function enter(withSound) {
  if (entered) return; entered = true;
  if (withSound) setSound(true);
  const loader = $('loader'), tk = $('ticket');
  tk.classList.add('punched'); audio.punch();
  setTimeout(() => { tk.classList.add('stamped'); audio.punch(); }, 280);
  setTimeout(() => loader.classList.add('out'), 700);
  setTimeout(() => loader.remove(), 2900);
  if (!station) { document.body.classList.remove('pre'); $('board').classList.add('show'); doorsOpen = true; renderBoard(); return; }
  let seenIntro = false; try { seenIntro = sessionStorage.getItem('spirit-hub-intro') === '1'; sessionStorage.setItem('spirit-hub-intro', '1'); } catch (e) {}
  document.body.classList.remove('pre');
  if (seenIntro || reduce) { // a quicker arrival on repeat visits
    setTimeout(() => $('board').classList.add('show'), 1300);
    setTimeout(() => { station.arrive(6, arrived); audio.arrive(6); }, 700);
    return;
  }
  // first visit: you're sitting on the bench, ticket in hand, and the train pulls in
  introPlaying = true; document.body.classList.add('intro');
  station.startIntro(ticketCanvas(), {
    sit: () => audio.sit(), paper: () => audio.paper(), bells: () => audio.bells(8.5),
    arrive: skipped => { if (!skipped) audio.arrive(6, { bells: false }); },
    stop: arrived, stand: () => audio.stand(), end: endIntro
  });
}
function endIntro() {
  if (!introPlaying) return; introPlaying = false;
  document.body.classList.remove('intro');
  setTimeout(() => $('board').classList.add('show'), 600);
}
$('skip').addEventListener('click', () => { if (station && introPlaying) station.skipIntro(); });
addEventListener('keydown', e => { if (introPlaying && (e.key === 'Escape' || e.key === ' ')) { e.preventDefault(); station.skipIntro(); } });
$('enter-sound').addEventListener('click', () => enter(true));
$('enter-quiet').addEventListener('click', () => enter(false));

addEventListener('resize', () => { if (station) station.resize(); });
addEventListener('pageshow', e => {
  if (e.persisted) { boarding = false; document.body.classList.remove('boarding'); $('flash').classList.remove('on'); if (station) { station.flight = null; station.doors.forEach(d => { d.target = doorsOpen ? 1 : 0; }); } }
});

boot();
requestAnimationFrame(loop);
