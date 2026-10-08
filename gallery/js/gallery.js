// The photo gallery: prints in a masonry, album filters, and a lightbox (zooms from the print you tap;
// arrows, swipe, keyboard). The photos are listed in /gallery/photos.js. Shared by the platform (it opens over the
// inside of car 1, index.html #gallery) and the stand-alone /gallery/ page: both have the same markup and ids.
import { PHOTOS } from '/gallery/photos.js';

const $ = id => document.getElementById(id);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const src = p => (/[/:]/.test(p.file) ? p.file : '/assets/gallery/' + p.file);
const fmtDate = d => { if (!d) return ''; const t = new Date(d + 'T12:00:00'); return isNaN(t) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

/* the prints */
// the photos listed in photos.js, then the approved submissions (from the site's Worker) after them
const ALL = PHOTOS.map(p => ({ ...p })), grid = $('grid'), cards = [];
function addCard(p) {
  const i = cards.length, b = document.createElement('button'); b.type = 'button'; b.className = 'ph'; b.dataset.i = i;
  const img = new Image(); img.alt = p.caption || 'Photo'; img.decoding = 'async'; if (i > 5) img.loading = 'lazy';
  if (p.w && p.h) { img.width = p.w; img.height = p.h; }
  const show = () => setTimeout(() => b.classList.add('in'), reduce ? 0 : Math.min(i, 8) * 70);
  img.onload = show; img.onerror = () => { b.hidden = true; };
  img.src = src(p); const f = document.createElement('span'); f.className = 'frame'; f.appendChild(img); b.appendChild(f);
  if (p.caption) { const c = document.createElement('span'); c.className = 'cap'; c.textContent = p.caption; b.appendChild(c); }
  b.setAttribute('aria-label', (p.caption || 'Photo') + (p.date ? ', ' + fmtDate(p.date) : ''));
  b.addEventListener('click', () => open(i));
  grid.appendChild(b); cards.push(b); return b;
}
ALL.forEach(addCard);
$('empty').hidden = ALL.length > 0;

/* albums: a filter button for each, when there's more than one */
let album = '';
function buildAlbums() {
  const albums = [...new Set(ALL.map(p => p.album).filter(Boolean))], bar = $('albums'); bar.innerHTML = '';
  bar.hidden = albums.length < 2; if (bar.hidden) return;
  if (album && !albums.includes(album)) album = '';
  ['', ...albums].forEach(a => {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.setAttribute('aria-pressed', String(a === album));
    c.innerHTML = '<span></span><i></i>'; c.querySelector('span').textContent = a || 'All';
    c.querySelector('i').textContent = a ? ALL.filter(p => p.album === a).length : ALL.length;
    c.addEventListener('click', () => {
      album = a; bar.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      cards.forEach((b, i) => { const on = !a || ALL[i].album === a; b.hidden = !on; if (on && !reduce) { b.classList.remove('in'); requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('in'))); } });
    });
    bar.appendChild(c);
  });
}
buildAlbums();
const visible = () => ALL.map((_, i) => i).filter(i => !cards[i].hidden);
// the approved submissions (none if the Worker isn't there, as on a plain static server)
fetch('/api/photos').then(r => r.ok ? r.json() : []).then(list => {
  if (!Array.isArray(list) || !list.length) return;
  list.forEach(q => { const p = { file: '/api/photos/' + q.id, caption: q.caption, album: q.album || 'From the school', date: q.date, by: q.by, w: q.w, h: q.h }; ALL.push(p); const b = addCard(p); if (album && p.album !== album) b.hidden = true; });
  $('empty').hidden = true; buildAlbums();
}).catch(() => {});

/* the lightbox */
const lb = $('lb'), img = $('lb-img');
let cur = -1, lastFocus = null;
function fill(i) {
  const p = ALL[i], list = visible(), k = list.indexOf(i);
  cur = i; img.src = src(p); img.alt = p.caption || 'Photo';
  $('lb-cap').textContent = p.caption || '';
  $('lb-meta').textContent = [p.album, p.by && 'Photo: ' + p.by, fmtDate(p.date), `${k + 1} / ${list.length}`].filter(Boolean).join('  ·  ');
  $('lb-prev').disabled = k <= 0; $('lb-next').disabled = k >= list.length - 1;
  [list[k - 1], list[k + 1]].forEach(j => { if (j !== undefined) new Image().src = src(ALL[j]); }); // the neighbours, ready to go
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


// for the platform: is a photo open (Escape closes it first), close it, and the prints coming in again on each visit
export const lightboxOpen = () => cur >= 0;
export const closeLightbox = () => close();
export function reveal() {
  if (reduce) return;
  cards.forEach((b, i) => { if (b.hidden) return; b.classList.remove('in'); setTimeout(() => b.classList.add('in'), 120 + Math.min(i, 8) * 70); });
}

/* sending a photo in: it goes to the Spirit Cabinet for review, and appears here once it's approved */
// (the photo is shrunk to 2000 px and re-saved as a JPEG in the browser first: quicker to send, and that drops its
// hidden details, like where it was taken)
let sub = null, subFrom = null;
const ERR = {
  'too-many': 'That’s a lot of photos at once. Try again in an hour.', full: 'Lots of photos are waiting for review right now. Try again later.',
  'too-big': 'That photo is too big to send.', 'not-a-photo': 'That file isn’t a photo we can use. Try a JPG or PNG.', consent: 'Tick the box to say it’s OK to post.',
  'not-set-up': 'Photo submissions aren’t open yet.', offline: 'Couldn’t reach the site. Check your connection and try again.'
};
function buildSub() {
  sub = document.createElement('div'); sub.className = 'sub'; sub.id = 'sub'; sub.setAttribute('role', 'dialog'); sub.setAttribute('aria-modal', 'true'); sub.setAttribute('aria-labelledby', 'sub-title'); sub.setAttribute('aria-hidden', 'true');
  sub.innerHTML = `<form class="sub-card" id="sub-form" novalidate>
    <div class="sub-body">
      <h2 id="sub-title">Submit a photo</h2>
      <p class="sub-note">The Spirit Cabinet looks at every photo before it goes up.</p>
      <label class="sub-drop" id="sub-drop"><input type="file" accept="image/*" id="sub-file"><span class="sub-pick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>Choose a photo</span><img id="sub-prev" alt=""></label>
      <label class="sub-field"><span>Caption</span><input id="sub-cap" maxlength="140" autocomplete="off"></label>
      <div class="sub-row"><label class="sub-field"><span>Event</span><input id="sub-album" maxlength="40" list="sub-albums" autocomplete="off"></label><label class="sub-field"><span>Your name <i>Optional</i></span><input id="sub-name" maxlength="50" autocomplete="name"></label></div>
      <datalist id="sub-albums"></datalist>
      <label class="sub-check"><input type="checkbox" id="sub-ok"><span>I took this photo or have permission to share it, and the people in it are fine with it being posted.</span></label>
      <p class="sub-msg" id="sub-msg" role="status"></p>
      <div class="sub-btns"><button type="button" class="sub-btn" id="sub-cancel">Cancel</button><button type="submit" class="sub-btn primary" id="sub-send">Send for review</button></div>
    </div>
    <div class="sub-done"><h2>Thanks</h2><p class="sub-note">Your photo is with the Spirit Cabinet. It’ll appear in the gallery once it’s approved.</p><div class="sub-btns"><button type="button" class="sub-btn" id="sub-more">Send another</button><button type="button" class="sub-btn primary" id="sub-close">Done</button></div></div>
  </form>`;
  document.body.appendChild(sub);
  const f = id => sub.querySelector('#' + id), msg = t => { f('sub-msg').textContent = t || ''; };
  let picked = null;
  f('sub-file').addEventListener('change', async e => {
    const file = e.target.files[0]; msg(''); if (!file) return;
    try { picked = await shrink(file); f('sub-prev').src = URL.createObjectURL(picked.blob); f('sub-drop').classList.add('has'); }
    catch (er) { picked = null; f('sub-drop').classList.remove('has'); msg(ERR['not-a-photo']); }
  });
  ['sub-ok', 'sub-cap', 'sub-album', 'sub-name'].forEach(id => f(id).addEventListener('input', () => msg(''))); // an old message goes once you change something
  f('sub-cancel').addEventListener('click', closeSub); f('sub-close').addEventListener('click', closeSub);
  f('sub-more').addEventListener('click', () => { resetSub(); f('sub-file').focus(); });
  sub.addEventListener('pointerdown', e => { if (e.target === sub) closeSub(); });
  sub.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeSub(); }
    else if (e.key === 'Tab') { // focus stays in the form
      const els = [...sub.querySelectorAll('input,button')].filter(el => el.offsetParent && !el.disabled), a = els.indexOf(document.activeElement), n = e.shiftKey ? a - 1 : a + 1;
      if (n < 0 || n >= els.length) { e.preventDefault(); els[(n + els.length) % els.length].focus(); }
    }
  });
  f('sub-form').addEventListener('submit', async e => {
    e.preventDefault(); if (sub.classList.contains('busy')) return;
    if (!picked) { msg('Choose a photo first.'); return; }
    if (!f('sub-ok').checked) { msg(ERR.consent); return; }
    const fd = new FormData(); fd.append('photo', picked.blob, 'photo.jpg'); fd.append('w', picked.w); fd.append('h', picked.h); fd.append('consent', 'yes');
    fd.append('caption', f('sub-cap').value); fd.append('album', f('sub-album').value); fd.append('name', f('sub-name').value);
    sub.classList.add('busy'); f('sub-send').textContent = 'Sending'; msg('');
    try {
      const r = await fetch('/api/photos', { method: 'POST', body: fd }); let j = {}; try { j = await r.json(); } catch (er) {}
      if (r.ok) { sub.classList.add('sent'); f('sub-close').focus(); }
      else msg(ERR[j.error] || (r.status === 404 || r.status === 501 || r.status === 405 ? ERR['not-set-up'] : 'Something went wrong. Try again.'));
    } catch (er) { msg(ERR.offline); }
    sub.classList.remove('busy'); f('sub-send').textContent = 'Send for review';
  });
  sub.resetPicked = () => { picked = null; };
}
async function shrink(file) {
  let src = null;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, 2000 / Math.max(src.width, src.height)), w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .86)); if (!blob) throw new Error('encode');
  return { blob, w, h };
}
function resetSub() {
  sub.classList.remove('sent', 'busy'); sub.querySelector('#sub-form').reset(); sub.resetPicked(); sub.querySelector('#sub-drop').classList.remove('has'); sub.querySelector('#sub-msg').textContent = '';
}
function openSub() {
  if (!sub) buildSub(); subFrom = document.activeElement; if (sub.classList.contains('sent')) resetSub();
  sub.querySelector('#sub-albums').innerHTML = [...new Set(ALL.map(p => p.album).filter(Boolean))].map(a => `<option value="${a.replace(/"/g, '&quot;')}">`).join('');
  sub.classList.add('open'); sub.setAttribute('aria-hidden', 'false');
  setTimeout(() => sub.querySelector('#sub-file').focus({ preventScroll: true }), 50);
}
function closeSub() { if (!sub) return; sub.classList.remove('open'); sub.setAttribute('aria-hidden', 'true'); if (subFrom) subFrom.focus({ preventScroll: true }); }
if ($('gal-submit')) $('gal-submit').addEventListener('click', openSub);
export const submitOpen = () => !!(sub && sub.classList.contains('open'));
