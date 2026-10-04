import { esc } from './data.js';
import { initBoard, renderAll, load, closeDetail, setShown } from './board.js';
import { StationAudio } from '/hub/audio.js';
import { flap, pad } from '/hub/flap.js';

window.__spiritBooted = true;
const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const audio = new StationAudio();

initBoard({ mobile, audio });

/* ---------- sound: on unless you've turned it off; browsers hold it until the first tap or key ---------- */
let fromHub = false, soundPref = true;
try { fromHub = Date.now() - Number(sessionStorage.getItem('spirit-door') || 0) < 15000; sessionStorage.removeItem('spirit-door'); } catch (e) {}
try { soundPref = localStorage.getItem('spirit-sound') !== 'off'; } catch (e) {}
function setSound(on, remember) {
  audio.setEnabled(on);
  $('sound-btn').classList.toggle('on', on); $('sound-btn').setAttribute('aria-pressed', String(on));
  soundLabel();
  if (remember) try { if (on) localStorage.removeItem('spirit-sound'); else localStorage.setItem('spirit-sound', 'off'); } catch (e) {}
  if (hum) hum.set(on && ride && ride.state === 'ride' ? ride.speed : 0);
}
// browsers keep audio paused on a new page until the first click, tap or key; until then the button says so,
// and the first press anywhere (the button included) starts it
const held = () => audio.enabled && (!audio.ctx || audio.ctx.state !== 'running');
function soundLabel() { $('sound-label').textContent = !audio.enabled ? 'Sound off' : held() ? 'Tap for sound' : 'Sound on'; }
let wokeAt = 0;
const unlock = () => { if (!audio.enabled || !audio.ctx || audio.ctx.state === 'running') return; wokeAt = performance.now(); audio.ctx.resume().then(() => { audio.setEnabled(true); soundLabel(); }); };
['pointerdown', 'keydown', 'touchend'].forEach(ev => addEventListener(ev, unlock, { capture: true, passive: true }));
$('sound-btn').addEventListener('click', () => {
  if (audio.enabled && performance.now() - wokeAt < 1000) { soundLabel(); audio.tick(); return; } // this press just woke the sound up
  setSound(!audio.enabled, true); audio.tick();
});
setInterval(soundLabel, 1000);

/* ---------- the board (board.js) ---------- */
let boardShown = false;

/* ---------- the ride ---------- */
let ride = null, Ride = null, STOPS = [], hum = null, pins = [], altPins = [], nextShown = -1, NAME_W = 13;
function routeUI() {
  const line = $('r-line');
  STOPS.forEach((n, i) => { const s = document.createElement('div'); s.className = 'r-stop'; s.innerHTML = `<i></i><span>${n}</span>`; line.appendChild(s); });
  const pin = (n, cls) => { const p = document.createElement('div'); p.className = cls; p.innerHTML = `<span>${esc(n)}</span>`; $('pins').appendChild(p); return p; };
  pins = STOPS.map(n => pin(n, 'pin'));
  altPins = ride.alts.map(a => pin(a.name, 'pin alt')); // the other cars' branches, seen as the line fans out
  NAME_W = Math.max(...STOPS.map(n => n.length));
}
function setNext(i, here) {
  const key = i + (here ? 'h' : ''); if (key === nextShown) return; nextShown = key;
  $('r-lbl').textContent = here ? (i === STOPS.length - 1 ? 'Arriving' : 'This stop') : 'Next stop';
  if (flap($('r-next'), pad(STOPS[i].toUpperCase(), NAME_W))) audio.clatter(.6);
  $('r-sr').textContent = `${$('r-lbl').textContent}: ${STOPS[i]}`;
}
function layoutBoard() {
  if (!ride) return;
  const mob = innerWidth <= 760, w = mob ? innerWidth - 20 : Math.min(1080, innerWidth * .9), h = mob ? innerHeight * .78 : Math.min(innerHeight * .78, w / 1.25);
  ride.fill = h / innerHeight; ride.setBillboard(w / h);
}
function placeBoard() {
  const r = ride.panelRect(), b = $('bboard').style;
  b.left = r.l + 'px'; b.top = r.t + 'px'; b.width = (r.r - r.l) + 'px'; b.height = (r.b - r.t) + 'px';
}
function showBoard() {
  if (boardShown) return; boardShown = true; setShown(true);
  document.body.classList.remove('riding'); document.body.classList.add('boarded');
  if (ride) placeBoard();
  setTimeout(() => { renderAll({ flipFresh: true }); audio.clatter(1.4); }, 350);
}
function updateRideUI() {
  if (!ride || ride.state === 'board' || !pins.length) return;
  const last = STOPS.length - 1, a = ride.stopS(ride.leg), b = ride.stopS(Math.min(last, ride.leg + 1));
  const f = ride.leg >= last ? last : ride.leg + Math.max(0, Math.min(1, (ride.sFront - a) / Math.max(1, b - a)));
  const line = $('r-line'), stops = [...line.querySelectorAll('.r-stop')];
  if (stops.length > 1) {
    const x0 = stops[0].offsetLeft + 8, x1 = stops[last].offsetLeft + 8, x = x0 + (x1 - x0) * f / last;
    $('r-fill').style.left = x0 + 'px'; $('r-fill').style.width = (x - x0) + 'px'; $('r-train').style.left = x + 'px';
    const reached = Math.floor(f + .001), target = ride.dwell > 0 || ride.state !== 'ride' ? reached : Math.min(last, reached + 1);
    stops.forEach((s, i) => { s.classList.toggle('past', i < target); s.classList.toggle('next', i === target); });
  }
  // a name pin over a station, hidden when it would sit under the top bar
  const pinAt = (p, v, on) => { const q = on && ride.project(v); if (q && q.y > 100) { p.style.transform = `translate(${q.x}px,${q.y}px) translate(-50%,-100%)`; p.classList.add('show'); } else p.classList.remove('show'); };
  ride.alts.forEach((a, i) => pinAt(altPins[i], a.label, ride.state === 'ride' && ride.leg === last - 1));
  ride.stops.forEach((s, i) => pinAt(pins[i], s.label, ride.state === 'ride' && i >= Math.floor(f) && i <= Math.floor(f) + 1));
}

let last = performance.now();
function loop() {
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  if (ride) {
    ride.update(dt); ride.render();
    if (hum) hum.set(audio.enabled && ride.state === 'ride' ? ride.speed : 0);
    updateRideUI();
    if (boardShown) placeBoard();
  }
  requestAnimationFrame(loop);
}

/* ---------- boot ---------- */
async function boot() {
  renderAll();
  const bar = $('cv-bar'); let done = 0; const total = 3;
  const progress = () => { done++; bar.style.transform = `scaleX(${done / total})`; bar.style.transition = 'transform .5s ease'; };
  const fonts = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2500))]).then(progress);
  const data = Promise.race([load(false), new Promise(r => setTimeout(r, 4500))]).then(progress);
  const stage = (async () => {
    if (reduce) return;
    try {
      ({ Ride } = await import('./ride.js')); await Ride.load(); // the town buildings
      const logo = new Image(); logo.src = '/assets/logo.png'; await logo.decode().catch(() => {});
      ride = new Ride($('gl'), { mobile, logo: logo.naturalWidth ? logo : null, title: 'Spirit Points' }); // the first branch; the officer on the platform sends you here
      STOPS = ride.names; if (location.hash === '#debug') window.__ride = ride;
      layoutBoard(); await new Promise(r => setTimeout(r, 30)); await ride.warm();
    } catch (e) { console.warn(e); ride = null; }
  })().then(progress);
  await Promise.all([fonts, stage, data]);
  if (soundPref || fromHub) setSound(true);
  document.body.classList.remove('pre');
  if (!ride) { document.body.classList.add('static'); $('cover').classList.add('out'); boardShown = true; setShown(true); renderAll({ flipFresh: true }); return; }
  routeUI();
  // ride the first time this visit, and every time you come through a train door; a reload goes straight to the board
  let rode = false; try { rode = !!sessionStorage.getItem('spirit-rode'); sessionStorage.setItem('spirit-rode', '1'); } catch (e) {}
  setTimeout(() => $('cover').classList.add('out'), 150);
  if (rode && !fromHub) { ride.jumpToBoard(); showBoard(); return; }
  document.body.classList.add('riding'); setNext(1); hum = audio.ride();
  ride.start({
    stop: i => { setNext(i, true); audio.chime(); },
    depart: i => setNext(i + 1),
    arrive: skipped => { setNext(STOPS.length - 1, true); if (!skipped) audio.doors(4); if (hum) { hum.stop(); hum = null; } },
    board: showBoard
  });
}
$('skip').addEventListener('click', () => { if (ride) { ride.skip(); audio.tick(); } });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('detail').hidden) closeDetail(); else if (ride && ride.state === 'ride') ride.skip(); }
});
let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (!ride) return; ride.resize(); layoutBoard(); if (ride.state === 'board') ride.jumpToBoard(); }, 150); });

boot();
requestAnimationFrame(loop);
