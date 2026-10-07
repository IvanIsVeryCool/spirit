import { DOORS, SITE, CABINET, EVENTS, NEWSLETTER } from './doors.js';
import { StationAudio } from './audio.js';
import { flap, pad, blank } from './flap.js';
import { CONFIG, ranked, fetchScores, fmt } from '/points/js/data.js';

window.__hubBooted = true;
const $ = id => document.getElementById(id);
// focus moves to the next control only for people using the keyboard: for a mouse or a finger, a focus ring
// appearing on its own (on load, say) just looks like a glitch
let keyNav = false;
addEventListener('keydown', e => { if (e.key === 'Tab' || e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow')) keyNav = true; }, { capture: true });
addEventListener('pointerdown', () => { keyNav = false; }, { capture: true });
const softFocus = el => { if (el && keyNav) el.focus({ preventScroll: true }); };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
const audio = new StationAudio();
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
  x.fillStyle = '#c9272c'; x.font = '900 19px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.fillText('SINGLE', 636, 58); x.fillText('JOURNEY', 636, 84); x.textAlign = 'left';
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
let song = null, introPlaying = false; // the headphone song; the opening playing

/* departure board: split-flap letters (flap.js) that clatter round to their new value */
const DEST_W = Math.max(...DOORS.map(d => d.title.length));
// the timetable's departure times, set once when you arrive
const TIMES = DOORS.map((d, i) => { const t = new Date(Date.now() + (4 + i * 7) * 60000); return pad(t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[AP]M/, '').padStart(5, ' '), 5); });
function statusOf(d) { return d.href || d.scene ? (doorsOpen ? 'BOARDING' : 'ARRIVING') : 'SOON'; }
function renderBoard(fresh) {
  const rows = $('rows');
  if (!rows.children.length) rows.innerHTML = DOORS.map((d, i) => `<button class="row" type="button" data-i="${i}"><span class="tm flap" aria-hidden="true"></span><span class="d flap" aria-hidden="true"></span><span class="c flap" aria-hidden="true"></span><span class="s flap" aria-hidden="true"></span></button>`).join('');
  let changed = 0;
  DOORS.forEach((d, i) => {
    const r = rows.children[i], st = statusOf(d);
    r.setAttribute('aria-label', `Car ${no(i)}: ${d.title}, ${d.href || d.scene ? 'open' : 'coming soon'}`);
    r.classList.toggle('on', i === focus && mobile && doorsOpen);
    if (fresh) r.querySelectorAll('.flap').forEach(blank);
    const delay = i * 90;
    changed += flap(r.querySelector('.tm'), TIMES[i], delay) + flap(r.querySelector('.d'), pad(d.title.toUpperCase(), DEST_W), delay) + flap(r.querySelector('.c'), no(i), delay) + flap(r.querySelector('.s'), pad(st, 8), delay);
    r.querySelector('.s').className = 's flap ' + (d.href || d.scene ? (doorsOpen ? 'live' : 'due') : 'soon');
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
  document.querySelectorAll('#rows .row').forEach((r, k) => r.classList.toggle('on', mobile && doorsOpen && k === focus));
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
  if (d.scene && station) { if (!doorsOpen) return; if (d.scene === 'cabinet') visitCabinet(i); else visitScene(i); return; }
  if (d.scene === 'gallery') { location.href = '/gallery/'; return; } // the static version (no 3D): the gallery's own page
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
  softFocus(n.querySelector('.n-close'));
  audio.chime();
}
// Meet the Cabinet: walk through the last car to the cab, where the cabinet are; their names float above them
let visiting = false;
function visitCabinet(i) {
  boarding = true; visiting = true; audio.beep(); audio.board(); document.body.classList.add('boarding');
  const tags = $('crew-tags'); [...tags.children].forEach(t => widths.delete(t)); tags.innerHTML = '';
  CABINET.forEach(m => { const t = document.createElement('div'); t.className = 'tag'; t.innerHTML = `<b></b><span></span>`; t.querySelector('b').textContent = m.name; t.querySelector('span').textContent = m.role || ''; tags.appendChild(t); });
  $('crew').hidden = false;
  station.visit(i, {
    door: () => audio.cabDoor(),
    arrive: () => { document.body.classList.add('visiting'); [...tags.children].forEach((t, k) => setTimeout(() => t.classList.add('on'), 250 + k * 120)); softFocus($('crew-back')); }
  });
}
function placeTags() {
  if (!visiting || !station) return;
  const pos = station.crewTags(), tags = $('crew-tags').children;
  // kept on screen; where neighbours would overlap (a narrow phone), every other one sits a row higher
  const w = [...tags].map(widthOf), crowded = pos.some((p, k) => k && Math.abs(p.x - pos[k - 1].x) < (w[k] + w[k - 1]) / 2 + 6);
  pos.forEach((p, k) => {
    const t = tags[k]; if (!t) return;
    const x = Math.min(innerWidth - w[k] / 2 - 8, Math.max(w[k] / 2 + 8, p.x)), y = p.y - (crowded && k % 2 ? t.offsetHeight + 10 : 0);
    t.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`; t.style.visibility = p.on ? '' : 'hidden';
  });
}
function leaveCabinet() {
  if (!visiting) return; visiting = false; sceneKind = ''; audio.tick(); closeGallery();
  $('flash').classList.add('on'); document.body.classList.remove('visiting');
  [...$('crew-tags').children].forEach(t => t.classList.remove('on'));
  setTimeout(() => {
    station.endVisit(); $('crew').hidden = true; $('scene-ui').hidden = true;
    $('flash').classList.remove('on'); document.body.classList.remove('boarding'); boarding = false;
  }, 550);
}
// Weekly Newsletter (sit down and read it) and Events (the next-stops screen): visits inside the train, like the cab
let sceneKind = '', sceneKey = '';
function visitScene(i) {
  const kind = DOORS[i].scene;
  boarding = true; visiting = true; sceneKind = kind; sceneKey = ''; audio.beep(); audio.board(); document.body.classList.add('boarding');
  const ui = $('scene-ui'); ui.hidden = kind === 'gallery'; $('sc-text').textContent = '';
  if (kind === 'gallery') loadGallery(); // the photos start loading as you board
  const standings = standingsNow();
  station.visit(i, {
    sit: () => audio.sit(), paper: () => audio.paper(),
    arrive: () => {
      if (kind === 'gallery') { openGallery(); return; }
      document.body.classList.add('visiting'); syncScene(true);
      if (kind === 'events') audio.chime();
      else $('sc-text').textContent = NEWSLETTER.stories.map(st => `${st.head}. ${st.body.join(' ')}`).join(' ');
      softFocus($('sc-back'));
    }
  }, { standings });
  if (station.stops) station.stops.onAuto = () => syncScene();
}
// the page count between the arrows, and (for the events) the stop read out to screen readers
function syncScene() {
  if (!visiting || !sceneKind || sceneKind === 'cabinet' || !station) return;
  const L = station.sceneLabel(); if (!L) return;
  const key = L.at + '/' + L.count; if (key === sceneKey) return; sceneKey = key;
  $('sc-count').textContent = `${L.at + 1} / ${L.count}`;
  $('sc-nav').hidden = L.count < 2;
  const wraps = sceneKind === 'events';
  $('sc-prev').disabled = !wraps && L.at <= 0; $('sc-next').disabled = !wraps && L.at >= L.count - 1;
  if (sceneKind === 'events') { const e = EVENTS[L.at]; if (e) $('sc-text').textContent = `${L.at === 0 ? 'Next stop' : 'Stop ' + (L.at + 1)}: ${e.name}. ${[e.date, e.time].filter(Boolean).join(', ') || 'Date to be announced'}. ${[e.place, e.note].filter(Boolean).join('. ')}`; }
}
function sceneStep(d) {
  if (!visiting || !document.body.classList.contains('visiting') || !sceneKind || sceneKind === 'cabinet' || sceneKind === 'gallery') return false;
  if (station.sceneStep(d)) { if (sceneKind === 'newsletter') audio.paper(); else audio.tick(); syncScene(); }
  return true;
}
$('sc-prev').addEventListener('click', () => sceneStep(-1));
$('sc-next').addEventListener('click', () => sceneStep(1));
$('sc-back').addEventListener('click', leaveCabinet);
// Photo Gallery: it opens over the inside of car 1, no new page (the gallery itself is /gallery/js/gallery.js, shared with /gallery/)
let gallery = null, lightboxUp = false, galleryStill = false, stillT = 0; // galleryStill: the 3D pauses behind the open gallery (it's blurred out anyway, and that blur over a live canvas is costly)
addEventListener('keydown', e => { lightboxUp = !!(e.key === 'Escape' && $('lb') && $('lb').classList.contains('open')); }, { capture: true }); // read before the lightbox closes itself
const loadGallery = () => gallery || (gallery = import('/gallery/js/gallery.js').catch(e => { console.warn(e); return null; }));
function openGallery() {
  const g = $('gallery'); g.hidden = false; $('gal-scroll').scrollTop = 0; document.body.classList.add('visiting');
  loadGallery().then(m => { if (m) m.reveal(); });
  requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add('open')));
  setTimeout(() => softFocus($('gal-back')), 100);
  clearTimeout(stillT); stillT = setTimeout(() => { if (g.classList.contains('open')) galleryStill = true; }, 750);
}
function closeGallery() {
  const g = $('gallery'); if (g.hidden) return;
  clearTimeout(stillT); galleryStill = false;
  if (gallery) gallery.then(m => m && m.lightboxOpen() && m.closeLightbox());
  g.classList.remove('open'); setTimeout(() => { if (!g.classList.contains('open')) g.hidden = true; }, 600);
}
$('gal-back').addEventListener('click', leaveCabinet);
$('crew-back').addEventListener('click', leaveCabinet);
/* the officer: a label over his head; click it (or him) and the camera goes over to him and he gives you the standings */
const SCORES_KEY = 'spirit-cache-' + CONFIG.sheetId;
let scores = []; try { const c = JSON.parse(localStorage.getItem(SCORES_KEY) || 'null'); if (c && c.entries) scores = c.entries; } catch (e) {}
const refreshScores = () => fetchScores().then(es => { scores = es; try { localStorage.setItem(SCORES_KEY, JSON.stringify({ entries: es, at: Date.now() })); } catch (e) {} return true; }).catch(() => false);
const standingsNow = () => scores.length ? ranked(scores).slice().sort((a, b) => a.rank - b.rank || a.order - b.order) : [];
const standingsText = rows => rows.length ? 'Spirit Points standings: ' + rows.map(r => `${r.rank}. ${r.name}, ${fmt(r.pts)} points`).join('; ') + '.' : 'No scores yet.';
refreshScores();
// he holds up a sign with the standings (drawn from the scores as you walk over); then the full leaderboard, or back
let talking = false;
function talkToCop() {
  if (!station || !station.cop || boarding || !entered || introPlaying || !$('notice').hidden) return;
  boarding = true; talking = true; document.body.classList.add('boarding'); audio.beep();
  const rows = standingsNow();
  station.drawCopSign(rows); station.talkToCop();
  $('talk-text').textContent = standingsText(rows);
  // and check the sheet again while he walks over: the page may have been open a while
  refreshScores().then(ok => { if (!ok || !talking) return; const fresh = standingsNow(); station.drawCopSign(fresh); $('talk-text').textContent = standingsText(fresh); });
  const t = $('talk'); t.hidden = false; t.classList.remove('open');
  setTimeout(() => { if (!talking) return; audio.paper(); }, 1100); // the board comes up
  setTimeout(() => { if (!talking) return; requestAnimationFrame(() => t.classList.add('open')); softFocus($('talk-full')); }, 1900);
}
function leaveCop() {
  if (!talking) return; talking = false; audio.tick();
  if (onBoard) { onBoard = false; document.body.classList.remove('onboard'); const bb = $('bboard'); bb.classList.remove('on'); bb.setAttribute('aria-hidden', 'true'); if (lb) lb.then(m => { if (m) { m.setShown(false); m.closeDetail(); } }); }
  const t = $('talk'); t.classList.remove('open'); setTimeout(() => { t.hidden = true; }, 500);
  station.endCop();
  setTimeout(() => { boarding = false; document.body.classList.remove('boarding'); }, 700);
}
$('cop-tag').addEventListener('click', talkToCop);
$('talk-back').addEventListener('click', leaveCop);
// "Full leaderboard": he points to the billboard past the end of the train, the camera pans over, and the full
// Spirit Points board (points/js/board.js, the same one /points/ uses) opens on its face
let lb = null, onBoard = false;
const loadBoard = () => lb || (lb = import('/points/js/board.js').then(m => { m.initBoard({ mobile, audio }); m.load(false); return m; }).catch(e => { console.warn(e); lb = null; return null; }));
function layoutBoard() {
  const mob = innerWidth <= 760, w = mob ? innerWidth - 20 : Math.min(1080, innerWidth * .9), h = mob ? innerHeight * .8 : Math.min(innerHeight * .78, w / 1.25);
  station.setBoardShape(w / h, h / innerHeight);
}
function placeBillboard() {
  if (!onBoard || !station) return;
  const r = station.boardRect(), b = $('bboard').style;
  b.left = r.l + 'px'; b.top = r.t + 'px'; b.width = (r.r - r.l) + 'px'; b.height = (r.b - r.t) + 'px';
}
$('talk-full').addEventListener('click', e => {
  e.preventDefault();
  if (!station) { try { sessionStorage.setItem('spirit-rode', '1'); } catch (x) {} location.href = '/points/'; return; } // the static version
  if (!talking || onBoard) return;
  onBoard = true; loadBoard(); layoutBoard(); audio.tick(); $('talk').classList.remove('open'); setTimeout(() => { if (onBoard) $('talk').hidden = true; }, 500);
  station.copToBoard({
    arrive: () => {
      if (!onBoard) return; placeBillboard();
      const bb = $('bboard'); bb.classList.add('on'); bb.setAttribute('aria-hidden', 'false'); document.body.classList.add('onboard');
      loadBoard().then(m => { if (!m || !onBoard) return; m.setShown(true); m.renderAll({ flipFresh: true }); audio.clatter(1.4); });
      softFocus($('board-back'));
    }
  });
});
$('bb-back').addEventListener('click', leaveCop); $('board-back').addEventListener('click', leaveCop);
// labels placed over the 3D every frame: their widths are measured once (and again on resize), not every frame,
// so the loop never forces a layout
const widths = new Map(), widthOf = el => { let w = widths.get(el); if (w === undefined) { w = el.offsetWidth; widths.set(el, w); } return w; };
addEventListener('resize', () => widths.clear());
let copShown = null;
function placeCopTag() {
  const tag = $('cop-tag'); if (!station || !station.cop) return;
  const p = station.copTag(), show = p.on && entered && !boarding && !introPlaying && document.body.classList.contains('entered');
  if (show !== copShown) { copShown = show; tag.classList.toggle('on', show); }
  if (show) { const w = widthOf(tag), x = Math.min(innerWidth - w / 2 - 10, Math.max(w / 2 + 10, p.x)); tag.style.transform = `translate(${x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`; } // kept on screen
}
// the sound button rides just above the headphone listener's head while he's in view; otherwise it's back in its corner
let soundFloat = false;
function placeSound() {
  const b = $('sound-btn'), p = station && station.listenerTag ? station.listenerTag() : { on: false };
  const float = p.on && entered && !boarding && !introPlaying && document.body.classList.contains('entered') && !document.body.classList.contains('intro');
  if (float !== soundFloat) { soundFloat = float; b.classList.toggle('float', float); if (!float) b.style.transform = ''; if (b.animate) b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' }); }
  if (float) { const w = widthOf(b), x = Math.min(innerWidth - w / 2 - 10, Math.max(w / 2 + 10, p.x)); b.style.transform = `translate(${x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`; }
}
function closeNotice() { const n = $('notice'); if (n.hidden) return; n.classList.remove('open'); setTimeout(() => { n.hidden = true; }, 450); audio.tick(); }
$('notice').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeNotice(); });
$('rows').addEventListener('click', e => { const b = e.target.closest('.row'); if (b) choose(Number(b.dataset.i)); });
$('rows').addEventListener('pointerover', e => { const b = e.target.closest('.row'); if (b && !mobile) setHover(Number(b.dataset.i)); });
$('rows').addEventListener('pointerleave', () => { if (!mobile) setHover(-1); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (lightboxUp) return; // a photo is open: Escape closes that first (gallery.js)
    if (onBoard && !$('detail').hidden) { lb && lb.then(m => m && m.closeDetail()); return; } // an event's breakdown, then the board
    closeNotice(); leaveCabinet(); leaveCop();
  }
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && sceneStep(e.key === 'ArrowRight' ? 1 : -1)) { e.preventDefault(); return; }
  if (!doorsOpen || boarding || !$('notice').hidden || !station) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { setFocus(focus + (e.key === 'ArrowRight' ? 1 : -1)); if (!mobile) setHover(focus); }
});

/* pointer on the 3D scene: hover doors, click to board, swipe between cars on phones */
let mx = innerWidth / 2, my = innerHeight / 2, downX = null, overUI = false;
const ndc = (x, y) => [(x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1];
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; overUI = e.target !== $('station'); if (station) station.setPointer(...ndc(mx, my)); }, { passive: true });
$('station').addEventListener('pointerdown', e => { downX = e.clientX; });
$('station').addEventListener('pointerup', e => {
  if (visiting && sceneKind && sceneKind !== 'cabinet') { // in the newsletter or at the screen: a tap or a swipe left goes on, a swipe right goes back
    const dx = downX === null ? 0 : e.clientX - downX; downX = null; sceneStep(dx > 40 ? -1 : 1); return;
  }
  if (!entered || boarding || introPlaying) return;
  if (!doorsOpen) { skipArrival(); return; }
  if (mobile && downX !== null && Math.abs(e.clientX - downX) > 40) { setFocus(focus + (e.clientX < downX ? 1 : -1)); audio.tick(); downX = null; return; }
  downX = null;
  if (station && station.pickCop(...ndc(e.clientX, e.clientY))) { talkToCop(); return; }
  const i = station ? station.pick(...ndc(e.clientX, e.clientY)) : -1;
  if (i >= 0) choose(i);
});

/* sound toggle: on unless you've turned it off yourself */
let soundPref = true; try { soundPref = localStorage.getItem('spirit-sound') !== 'off'; } catch (e) {}
function setSound(on, remember) {
  audio.setEnabled(on); if (on) ambientSong();
  if (remember) try { if (on) localStorage.removeItem('spirit-sound'); else localStorage.setItem('spirit-sound', 'off'); } catch (e) {}
  $('sound-btn').classList.toggle('on', on); $('sound-btn').setAttribute('aria-pressed', String(on));
  soundLabel();
}
// After a reload, browsers keep audio paused until the first click, tap or key press on the page.
// Until then the button says so; the first press anywhere (the button included) starts the sound.
const held = () => audio.enabled && (!audio.ctx || audio.ctx.state !== 'running');
function soundLabel() {
  const l = $('sound-label'), text = !audio.enabled ? 'Sound off' : held() ? 'Tap for sound' : 'Sound on';
  if (l.textContent !== text) { l.textContent = text; widths.delete($('sound-btn')); } // its width changes with the words
}
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
// quiet while the tab is in the background (the song and the station don't play to an empty room), back on return
document.addEventListener('visibilitychange', () => { if (!audio.ctx) return; if (document.hidden) audio.ctx.suspend(); else if (audio.enabled) audio.ctx.resume(); });
// Coming back the same day: start the sound right away, under the loading screen. Browsers that allow it play now;
// the rest hold it until a press, so the loader then waits for one tap ("Tap to board") and you arrive with sound.
if (!firstToday && !reduce && soundPref) setSound(true);

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
  if (station && !galleryStill) {
    if (doorsOpen && !mobile && !boarding && $('notice').hidden && !overUI) setHover(station.pick(...ndc(mx, my)));
    station.render(); placeTags(); placeCopTag(); placeSound(); syncScene(); placeBillboard();
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
  const want = document.fonts ? Promise.all(['400 30px Newsreader', '700 30px Newsreader', '800 30px Newsreader', 'italic 400 30px Newsreader', '900 30px Archivo', '600 30px "Public Sans"'].map(f => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready) : Promise.resolve(); // the newspaper's type too (nothing on the page uses it)
  const fonts = Promise.race([want, new Promise(r => setTimeout(r, 2500))]).then(() => done++);
  const stage = (async () => {
    if (reduce) return;
    try {
      const [{ Station }, { loadPeople }, { loadCity }] = await Promise.all([import('./station.js'), import('./people.js'), import('./city.js')]);
      await Promise.all([loadPeople(), loadCity(), audio.loadTrack('/assets/audio/headphones.mp3', '/assets/audio/headphones_loop.mp3')]); // the Mini Characters before the scene that uses them; your headphone song if there is one
      const logo = new Image(); logo.src = '/assets/logo.png'; await logo.decode().catch(() => {});
      station = new Station($('station'), { mobile, doors: DOORS, logo: logo.naturalWidth ? logo : null }); if (location.hash === '#debug') { window.__st = station; window.__audio = audio; } station.onFlyby = (dur, mid) => audio.plane(dur, mid); station.render();
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
  $('tk-status').classList.add('done'); $('load-label').textContent = 'Ready to board';
  if (!station) { document.body.classList.add('static'); enter(false); return; }
  if (!firstToday && !reduce) { setTimeout(() => (soundPref && held() ? tapToBoard() : quickEnter()), 350); return; }
  setTimeout(() => { $('gate').classList.add('ready'); softFocus($('enter-sound')); }, 350);
}
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
  station.park(); arrived(); ambientSong();
  setTimeout(() => showBoard(), 700);
}
function tapToBoard() {
  const loader = $('loader'); loader.classList.add('tap'); softFocus($('ql-tap'));
  const go = () => { loader.removeEventListener('click', go); removeEventListener('keydown', go); quickEnter(); };
  loader.addEventListener('click', go); addEventListener('keydown', go); // the press itself starts the sound (unlockAudio)
}
// you're sitting on the bench, ticket in hand, and the train pulls in
function playIntro() {
  if (song) song.stop(.6); song = null; // the opening starts its own when you press play
  audio.beginScene();
  introPlaying = true; document.body.classList.add('intro');
  station.startIntro(ticketCanvas(), {
    // your headphones: you press play on your cassette player, the song plays while you're in your own head,
    // and fades as the view pulls out
    press: () => audio.cassette(), start: () => { if (song) song.stop(.3); song = audio.ctx ? audio.music() : null; },
    leave: () => { if (song) song.duck(1.6); }, // it doesn't stop: it carries on faintly, leaking from the headphones on the bench
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
function skipIntro() { if (!station || !introPlaying) return; if (song) song.duck(.6); audio.endScene(.4); station.skipIntro(); ambientSong(); }
// the song in the background on the platform: faint, from the listener's headphones (on later visits, after a skip, or once sound comes on)
function ambientSong() { if (!song && audio.ctx && document.body.classList.contains('entered') && !introPlaying && station) song = audio.music({ background: true }); } // not before the opening (you start it there)
$('skip').addEventListener('click', skipIntro);
addEventListener('keydown', e => { if (introPlaying && (e.key === 'Escape' || e.key === ' ')) { e.preventDefault(); skipIntro(); } });
$('enter-sound').addEventListener('click', () => enter(true));
$('enter-quiet').addEventListener('click', () => enter(false));

addEventListener('resize', () => { if (!station) return; station.resize(); if (onBoard) { layoutBoard(); station.reframeBoard(); } });
addEventListener('pageshow', e => {
  if (e.persisted) { boarding = false; document.body.classList.remove('boarding'); $('flash').classList.remove('on'); if (station) { station.flight = null; station.doors.forEach(d => { d.target = doorsOpen ? 1 : 0; }); } }
});

boot();
requestAnimationFrame(loop);
