import { DOORS, SITE } from './doors.js';
import { StationAudio } from './audio.js';
import { flap, pad, blank } from './flap.js';

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
// The ticket and the opening play on your first visit each day; after that you go straight to the platform
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })();
let firstToday = true; try { firstToday = localStorage.getItem('spirit-hub-day') !== today; } catch (e) {}
if (!firstToday && !reduce) $('loader').classList.add('quick');
let station = null, entered = false, doorsOpen = false, focus = 0, hover = -1, boarding = false;

/* departure board: split-flap letters (flap.js) that clatter round to their new value */
const DEST_W = Math.max(...DOORS.map(d => d.title.length));
// the timetable's departure times, set once when you arrive
const TIMES = DOORS.map((d, i) => { const t = new Date(Date.now() + (4 + i * 7) * 60000); return pad(t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[AP]M/, '').padStart(5, ' '), 5); });
function statusOf(d) { return d.href ? (doorsOpen ? 'BOARDING' : 'ARRIVING') : 'SOON'; }
function renderBoard(fresh) {
  const rows = $('rows');
  if (!rows.children.length) rows.innerHTML = DOORS.map((d, i) => `<button class="row" type="button" data-i="${i}"><span class="tm flap" aria-hidden="true"></span><span class="d flap" aria-hidden="true"></span><span class="c flap" aria-hidden="true"></span><span class="s flap" aria-hidden="true"></span></button>`).join('');
  let changed = 0;
  DOORS.forEach((d, i) => {
    const r = rows.children[i], st = statusOf(d);
    r.setAttribute('aria-label', `Car ${no(i)}: ${d.title}, ${d.href ? 'open' : 'coming soon'}`);
    r.classList.toggle('on', i === focus && mobile && doorsOpen);
    if (fresh) r.querySelectorAll('.flap').forEach(blank);
    const delay = i * 90;
    changed += flap(r.querySelector('.tm'), TIMES[i], delay) + flap(r.querySelector('.d'), pad(d.title.toUpperCase(), DEST_W), delay) + flap(r.querySelector('.c'), no(i), delay) + flap(r.querySelector('.s'), pad(st, 8), delay);
    r.querySelector('.s').className = 's flap ' + (d.href ? (doorsOpen ? 'live' : 'due') : 'soon');
  });
  if (changed && $('board').classList.contains('show')) audio.clatter();
}
// the board slides in and its letters flip round from blank
function showBoard() { const b = $('board'); if (b.classList.contains('show')) return; b.classList.add('show'); setTimeout(() => renderBoard(true), 250); }
function tickClock() { flap($('clock'), pad(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/, '').padStart(5, ' '), 5)); }
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
    setTimeout(() => $('flash').classList.add('on'), 1500);
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

/* sound toggle: on unless you've turned it off yourself */
let soundPref = true; try { soundPref = localStorage.getItem('spirit-sound') !== 'off'; } catch (e) {}
function setSound(on, remember) {
  audio.setEnabled(on);
  if (remember) try { if (on) localStorage.removeItem('spirit-sound'); else localStorage.setItem('spirit-sound', 'off'); } catch (e) {}
  $('sound-btn').classList.toggle('on', on); $('sound-btn').setAttribute('aria-pressed', String(on));
  soundLabel();
}
// After a reload, browsers keep audio paused until the first click, tap or key press on the page.
// Until then the button says so; the first press anywhere (the button included) starts the sound.
const held = () => audio.enabled && (!audio.ctx || audio.ctx.state !== 'running');
function soundLabel() { $('sound-label').textContent = !audio.enabled ? 'Sound off' : held() ? 'Tap for sound' : 'Sound on'; }
let wokeAt = 0;
const unlockAudio = () => {
  if (!audio.enabled || !audio.ctx || audio.ctx.state === 'running') return;
  wokeAt = performance.now(); audio.ctx.resume().then(() => { audio.setEnabled(true); soundLabel(); });
};
['pointerdown', 'keydown', 'touchend'].forEach(ev => addEventListener(ev, unlockAudio, { capture: true, passive: true }));
$('sound-btn').addEventListener('click', () => {
  if (audio.enabled && performance.now() - wokeAt < 1000) { soundLabel(); audio.tick(); return; } // this press just woke the sound up
  setSound(!audio.enabled, true); audio.tick();
});
setInterval(soundLabel, 1000); // the browser can also resume or suspend on its own

/* arrival */
function arrived() {
  if (doorsOpen) return;
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
  const bar = $('load-bar'), dot = $('mini-train'), pct = $('load-pct'), ql = $('ql-bar');
  let done = 0; const total = 3, shown = { v: 0 };
  const anim = () => {
    shown.v += ((done / total) * 100 - shown.v) * .1;
    bar.style.transform = `scaleX(${shown.v / 100})`; ql.style.transform = `scaleX(${shown.v / 100})`; dot.style.left = `calc((100% - 58px) * ${shown.v / 100})`; pct.textContent = Math.round(shown.v) + '%';
    if (shown.v < 99.5) requestAnimationFrame(anim); else { pct.textContent = '100%'; bar.style.transform = 'scaleX(1)'; dot.style.left = 'calc(100% - 58px)'; }
  };
  requestAnimationFrame(anim);
  const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]).then(() => done++);
  const stage = (async () => {
    if (reduce) return;
    try {
      const [{ Station }, { loadPeople }, { loadCity }] = await Promise.all([import('./station.js'), import('./people.js'), import('./city.js')]);
      await Promise.all([loadPeople(), loadCity()]); // the Mini Characters, before the scene that uses them is built
      const logo = new Image(); logo.src = '/assets/logo.png'; await logo.decode().catch(() => {});
      station = new Station($('station'), { mobile, doors: DOORS, logo: logo.naturalWidth ? logo : null }); if (location.hash === '#debug') { window.__st = station; window.__audio = audio; } station.render();
    }
    catch (e) { console.warn(e); station = null; }
  })().then(() => done++);
  await Promise.all([fonts, stage]);
  if (station) station.redrawSigns(); // once the LED font has loaded
  if (station) { // get everything onto the graphics card now, so the train doesn't stutter as it pulls in
    await new Promise(r => setTimeout(r, 50));
    try { await station.warm(ticketCanvas()); } catch (e) { console.warn(e); }
  }
  done++;
  $('tk-status').classList.add('done');
  if (!station) { document.body.classList.add('static'); enter(false); return; }
  if (!firstToday && !reduce) { setTimeout(quickEnter, 350); return; }
  setTimeout(() => { $('gate').classList.add('ready'); $('enter-sound').focus({ preventScroll: true }); }, 350);
}
let introPlaying = false;
function enter(withSound) {
  if (entered) return; entered = true;
  try { localStorage.setItem('spirit-hub-day', today); } catch (e) {}
  if (withSound) setSound(true);
  const loader = $('loader'), tk = $('ticket');
  tk.classList.add('punched'); audio.punch();
  setTimeout(() => { tk.classList.add('stamped'); audio.punch(); }, 280);
  setTimeout(() => loader.classList.add('out'), 700);
  setTimeout(() => loader.remove(), 2900);
  if (!station) { document.body.classList.remove('pre'); showBoard(); doorsOpen = true; renderBoard(); return; }
  document.body.classList.remove('pre');
  if (reduce) { // reduced motion: just the quick arrival
    setTimeout(() => showBoard(), 1300);
    setTimeout(() => { station.arrive(6, arrived); audio.arrive(6); }, 700);
    return;
  }
  playIntro();
}
// already been here today: the train is waiting at the platform
function quickEnter() {
  if (entered) return; entered = true;
  const loader = $('loader');
  loader.classList.add('out'); setTimeout(() => loader.remove(), 2900);
  document.body.classList.remove('pre'); document.body.classList.add('entered');
  if (soundPref) setSound(true);
  if (!station) { showBoard(); doorsOpen = true; renderBoard(); return; }
  station.park(); arrived();
  setTimeout(() => showBoard(), 700);
}
// you're sitting on the bench, ticket in hand, and the train pulls in
let song = null;
function playIntro() {
  audio.beginScene();
  introPlaying = true; document.body.classList.add('intro');
  station.startIntro(ticketCanvas(), {
    // your headphones: a song plays while you're in your own head, and fades as the view pulls out
    start: () => { song = audio.music(); }, leave: () => { if (song) song.stop(1.4); song = null; },
    sit: () => audio.sit(), paper: () => audio.paper(), bells: () => audio.bells(8.5),
    arrive: skipped => { if (!skipped) audio.arrive(6, { bells: false }); },
    stop: arrived, end: endIntro
  });
}
function endIntro() {
  if (!introPlaying) return; introPlaying = false;
  audio.endScene(2.5); // everything has played out by now; just let the reverb tails go
  document.body.classList.add('entered');
  document.body.classList.remove('intro');
  setTimeout(() => showBoard(), 600);
}
// watch the opening again, any time
$('replay-btn').addEventListener('click', () => {
  if (!station || introPlaying || boarding || reduce || !$('notice').hidden) return;
  doorsOpen = false; hover = -1; station.setHover(-1); renderBoard();
  $('board').classList.remove('show'); audio.tick();
  playIntro();
});
// skipping cuts the opening's sounds too (bells, horn and the arrival are scheduled ahead), with a short fade
function skipIntro() { if (!station || !introPlaying) return; if (song) song.stop(.4); song = null; audio.endScene(.4); station.skipIntro(); }
$('skip').addEventListener('click', skipIntro);
addEventListener('keydown', e => { if (introPlaying && (e.key === 'Escape' || e.key === ' ')) { e.preventDefault(); skipIntro(); } });
$('enter-sound').addEventListener('click', () => enter(true));
$('enter-quiet').addEventListener('click', () => enter(false));

addEventListener('resize', () => { if (station) station.resize(); });
addEventListener('pageshow', e => {
  if (e.persisted) { boarding = false; document.body.classList.remove('boarding'); $('flash').classList.remove('on'); if (station) { station.flight = null; station.doors.forEach(d => { d.target = doorsOpen ? 1 : 0; }); } }
});

boot();
requestAnimationFrame(loop);
