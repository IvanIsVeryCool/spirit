// The photo gallery: prints in a masonry, album filters, and a lightbox (zooms from the print you tap;
// arrows, swipe, keyboard). The photos are listed in /gallery/photos.js.
import { PHOTOS } from '/gallery/photos.js';

const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const src = p => (/[/:]/.test(p.file) ? p.file : '/assets/gallery/' + p.file);
const fmtDate = d => { if (!d) return ''; const t = new Date(d + 'T12:00:00'); return isNaN(t) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

/* the prints */
const grid = $('grid'), cards = PHOTOS.map((p, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ph'; b.dataset.i = i;
  const img = new Image(); img.alt = p.caption || 'Photo'; img.decoding = 'async'; if (i > 5) img.loading = 'lazy';
  if (p.w && p.h) { img.width = p.w; img.height = p.h; }
  const show = () => setTimeout(() => b.classList.add('in'), reduce ? 0 : Math.min(i, 8) * 70);
  img.onload = show; img.onerror = () => { b.hidden = true; };
  img.src = src(p); b.appendChild(img);
  if (p.caption) { const c = document.createElement('span'); c.className = 'cap'; c.textContent = p.caption; b.appendChild(c); }
  b.setAttribute('aria-label', (p.caption || 'Photo') + (p.date ? ', ' + fmtDate(p.date) : ''));
  b.addEventListener('click', () => open(i));
  grid.appendChild(b); return b;
});
$('empty').hidden = PHOTOS.length > 0;

/* albums: a filter button for each, when there's more than one */
const albums = [...new Set(PHOTOS.map(p => p.album).filter(Boolean))];
let album = '';
if (albums.length > 1) {
  const bar = $('albums'); bar.hidden = false;
  ['', ...albums].forEach(a => {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.setAttribute('aria-pressed', String(a === album));
    c.innerHTML = '<span></span><i></i>'; c.querySelector('span').textContent = a || 'All';
    c.querySelector('i').textContent = a ? PHOTOS.filter(p => p.album === a).length : PHOTOS.length;
    c.addEventListener('click', () => {
      album = a; bar.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      cards.forEach((b, i) => { const on = !a || PHOTOS[i].album === a; b.hidden = !on; if (on && !reduce) { b.classList.remove('in'); requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('in'))); } });
    });
    bar.appendChild(c);
  });
}
const visible = () => PHOTOS.map((_, i) => i).filter(i => !cards[i].hidden);

/* the lightbox */
const lb = $('lb'), img = $('lb-img');
let cur = -1, lastFocus = null;
function fill(i) {
  const p = PHOTOS[i], list = visible(), k = list.indexOf(i);
  cur = i; img.src = src(p); img.alt = p.caption || 'Photo';
  $('lb-cap').textContent = p.caption || '';
  $('lb-meta').textContent = [p.album, fmtDate(p.date), `${k + 1} / ${list.length}`].filter(Boolean).join('  ·  ');
  $('lb-prev').disabled = k <= 0; $('lb-next').disabled = k >= list.length - 1;
  [list[k - 1], list[k + 1]].forEach(j => { if (j !== undefined) new Image().src = src(PHOTOS[j]); }); // the neighbours, ready to go
}
// FLIP: the photo grows out of its print
function fromRect(r) {
  const f = img.getBoundingClientRect(); if (!f.width) return '';
  return `translate(${r.left - f.left}px, ${r.top - f.top}px) scale(${r.width / f.width}, ${r.height / f.height})`;
}
function open(i) {
  lastFocus = document.activeElement; fill(i);
  lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden';
  const go = () => {
    if (reduce) return;
    const t = cards[i].querySelector('img').getBoundingClientRect();
    img.style.transition = 'none'; img.style.transform = fromRect(t);
    requestAnimationFrame(() => requestAnimationFrame(() => { img.style.transition = 'transform .55s var(--ease)'; img.style.transform = ''; }));
  };
  if (img.complete && img.naturalWidth) go(); else img.onload = () => { img.onload = null; go(); };
  $('lb-close').focus({ preventScroll: true });
}
function close() {
  if (cur < 0) return;
  const card = cards[cur].querySelector('img'), r = card.getBoundingClientRect();
  if (!reduce && r.bottom > 0 && r.top < innerHeight) { img.style.transition = 'transform .45s var(--ease)'; img.style.transform = fromRect(r); }
  lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true'); document.documentElement.style.overflow = '';
  setTimeout(() => { img.style.transition = 'none'; img.style.transform = ''; }, 450);
  if (lastFocus) lastFocus.focus({ preventScroll: true }); cur = -1;
}
// to the next or previous photo: the current one slides out, the next slides in from the other side
function step(d) {
  const list = visible(), k = list.indexOf(cur), j = list[k + d]; if (j === undefined) { nudge(d); return; }
  if (reduce) { fill(j); return; }
  img.style.transition = 'transform .22s ease-in, opacity .22s ease-in'; img.style.transform = `translateX(${-d * 60}px)`; img.style.opacity = '0';
  setTimeout(() => {
    fill(j); img.style.transition = 'none'; img.style.transform = `translateX(${d * 60}px)`;
    const inn = () => requestAnimationFrame(() => { img.style.transition = 'transform .45s var(--ease), opacity .3s ease'; img.style.transform = ''; img.style.opacity = '1'; });
    if (img.complete) inn(); else img.onload = () => { img.onload = null; inn(); };
  }, 220);
}
function nudge(d) { if (reduce) return; img.style.transition = 'transform .14s ease-out'; img.style.transform = `translateX(${-d * 14}px)`; setTimeout(() => { img.style.transition = 'transform .4s var(--ease)'; img.style.transform = ''; }, 140); }
$('lb-close').addEventListener('click', close);
$('lb-prev').addEventListener('click', () => step(-1));
$('lb-next').addEventListener('click', () => step(1));
addEventListener('keydown', e => {
  if (cur < 0) return;
  if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'Tab') { // keep focus in the lightbox
    const f = [...lb.querySelectorAll('button')].filter(b => !b.disabled && b.offsetParent);
    const a = f.indexOf(document.activeElement), n = e.shiftKey ? a - 1 : a + 1;
    if (n < 0 || n >= f.length) { e.preventDefault(); f[(n + f.length) % f.length].focus(); }
  }
});
// swipe on the photo (and a tap on the dark around it closes)
let drag = null;
$('lb-stage').addEventListener('pointerdown', e => { if (e.target.closest('.lb-btn')) return; drag = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, on: e.target === img }; });
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return; drag.dx = e.clientX - drag.x;
  if (Math.abs(drag.dx) > 6) { img.style.transition = 'none'; img.style.transform = `translateX(${drag.dx}px)`; }
});
addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null;
  if (Math.abs(d.dx) > 60) step(d.dx < 0 ? 1 : -1);
  else if (Math.abs(d.dx) > 6) { img.style.transition = 'transform .4s var(--ease)'; img.style.transform = ''; }
  else if (!d.on && Math.abs(e.clientY - d.y) < 6) close();
});

/* in from the light of the train door */
const out = () => $('cover').classList.add('out');
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 700))]).then(() => setTimeout(out, reduce ? 0 : 180));
