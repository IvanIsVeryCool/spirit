import * as THREE from 'three';
import { limbGeometry, aimBasis, library } from './people.js';
import { READ_SEAT, SCREEN } from './interior.js';
import { EVENTS, NEWSLETTER, CABINET, DOORS } from './doors.js';

// Two of the cars are visits inside the train, like Meet the Cabinet:
// - Weekly Newsletter: you walk down to the lower deck, sit down, and pull out the newsletter, a newspaper
//   (typeset on canvases from NEWSLETTER in doors.js, with the live standings and the next events), and read it;
//   your hands hold it, it unfolds, and the pages turn.
// - Events: you step in and look up at the car's next-stops screen, where the stops are the events (EVENTS).

const SERIF = '"Newsreader", Georgia, "Times New Roman", serif';
const SANS = '"Archivo", "Arial Narrow", Arial, sans-serif';
const TEXT = '"Public Sans", Arial, sans-serif';
const INK = '#1d1c20', NEWS = '#f3eee2', RED = '#b3252a', MUTE = '#6d675c';
const CLASS_COL = { sr: '#d2433b', jr: '#e0a12e', so: '#2f9c7e', fr: '#4f7fd2' };
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = v => Math.max(0, Math.min(1, v));
const seg = (e, a, b) => clamp01((e - a) / (b - a));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ARM = .5; // your arms, a little smaller than in the opening: the newspaper is bigger than the ticket

/* ---------------- typesetting ---------------- */
function newsprint(x, w, h, seed) {
  x.fillStyle = NEWS; x.fillRect(0, 0, w, h);
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < w * h / 300; i++) { x.fillStyle = r() < .5 ? `rgba(95,82,60,${.04 + r() * .06})` : `rgba(255,255,250,${.15 + r() * .2})`; x.fillRect(r() * w, r() * h, 1 + r() * 1.6, 1 + r() * 1.6); }
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .78);
  g.addColorStop(0, 'rgba(130,105,60,0)'); g.addColorStop(1, 'rgba(130,105,60,.13)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
}
// text with letter spacing, drawn a character at a time (canvas letterSpacing isn't everywhere yet)
function spaced(x, t, px, y, sp, align = 'left') {
  x.textAlign = 'left'; const ws = [...t].map(c => x.measureText(c).width), tot = ws.reduce((a, b) => a + b, 0) + sp * (ws.length - 1);
  let cx = align === 'center' ? px - tot / 2 : align === 'right' ? px - tot : px;
  [...t].forEach((c, i) => { x.fillText(c, cx, y); cx += ws[i] + sp; }); return tot;
}
function wrap(x, text, widthAt) {
  const words = String(text).split(/\s+/).filter(Boolean), sp = x.measureText(' ').width, lines = []; let cur = [], cw = 0;
  for (const wd of words) {
    const ww = x.measureText(wd).width;
    if (cur.length && cw + sp + ww > widthAt(lines.length)) { lines.push({ words: cur, w: cw }); cur = [wd]; cw = ww; } else { cw += (cur.length ? sp : 0) + ww; cur.push(wd); }
  }
  if (cur.length) lines.push({ words: cur, w: cw, last: true });
  return lines;
}
function drawLine(x, line, px, y, width, justify) {
  x.textAlign = 'left';
  const ws = line.words.map(w => x.measureText(w).width), gap = line.words.length > 1 ? (width - ws.reduce((a, b) => a + b, 0)) / (line.words.length - 1) : 0;
  if (!justify || line.last || line.words.length < 2 || gap > x.measureText(' ').width * 2.4) { x.fillText(line.words.join(' '), px, y); return; }
  let cx = px; line.words.forEach((w, i) => { x.fillText(w, cx, y); cx += ws[i] + gap; });
}
// The same, but breaking the lines where the edge comes out most even over the whole paragraph (as a typesetter
// would, instead of filling each line and leaving the next one short), and no lone short word on the last line.
// The columns are set ragged right: they're too narrow to justify well without hyphens
function fit(x, text, widthAt) {
  const words = String(text).split(/\s+/).filter(Boolean), N = words.length; if (!N) return [];
  const ws = words.map(w => x.measureText(w).width), sp = x.measureText(' ').width, K = 3; // lines from the 4th on are all the same width
  const INF = 1e30, cost = [], pi = [], pl = [];
  for (let i = 0; i <= N; i++) { cost.push(new Float64Array(K + 1).fill(INF)); pi.push(new Int32Array(K + 1)); pl.push(new Int8Array(K + 1)); }
  cost[0][0] = 0;
  for (let i = 0; i < N; i++) for (let l = 0; l <= K; l++) {
    if (cost[i][l] >= INF) continue;
    const avail = widthAt(l); let nat = -sp;
    for (let j = i + 1; j <= N; j++) {
      nat += sp + ws[j - 1]; const gaps = j - i - 1, single = j === i + 1;
      if (!single && nat > avail) break;
      let d;
      if (single && nat > avail) d = 1e8; // one word too long for the line: it has to go somewhere
      else if (j === N) d = nat < avail * .3 && i > 0 ? 4e4 : 0; // the last line may be short, but not a word or two
      else d = ((avail - nat) / avail * 100) ** 2;
      const nl = Math.min(l + 1, K), c = cost[i][l] + d;
      if (c < cost[j][nl]) { cost[j][nl] = c; pi[j][nl] = i; pl[j][nl] = l; }
    }
  }
  let l = 0; for (let k = 1; k <= K; k++) if (cost[N][k] < cost[N][l]) l = k;
  const lines = []; let j = N;
  while (j > 0) { const i = pi[j][l], w = words.slice(i, j); lines.unshift({ words: w, w: ws.slice(i, j).reduce((a, b) => a + b, 0) + sp * (w.length - 1), last: j === N }); l = pl[j][l]; j = i; }
  return lines;
}
// a headline's lines made even: the narrowest measure that still takes no more lines (no lone word on the last one)
function balanced(x, text, maxW) {
  const n = wrap(x, text, () => maxW).length; if (n < 2) return wrap(x, text, () => maxW);
  let lo = maxW * .45, hi = maxW;
  for (let k = 0; k < 12; k++) { const mid = (lo + hi) / 2; if (wrap(x, text, () => mid).length > n) lo = mid; else hi = mid; }
  return wrap(x, text, () => hi);
}
// the logo (white on clear) in a colour of our choice
function tinted(img, col, size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  if (img) { x.drawImage(img, 0, 0, size, size); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, size, size); }
  return c;
}

// The paper's photos: a story's `photo` (from assets/gallery/), and the ones in the house promotions. Loaded a little
// after the station (so they don't hold up its loading), or when you board if that's sooner; the pages are set when you
// board, and set again if a photo comes in before you've sat down to read (one that never loads is just left out).
const PROMOS = [
  { car: 'gallery', head: 'Photo Gallery', line: 'Pictures from every spirit event.', photo: 'spirit-line-banner.jpg' },
  { car: 'cabinet', head: 'Meet the Cabinet', line: 'Walk to the back of the car. The cab door is open.', photo: 'spirit-line-cab.jpg' },
  { car: 'events', head: 'The Next Stops', line: 'Every event coming up, on the screen in the car.', photo: 'spirit-line-doors.jpg' },
  { car: null, head: 'The Leaderboard', line: 'Ask the officer on the platform for the standings.', photo: 'spirit-line-platform.jpg' }
];
const PHOTO = {}, LOADING = {};
export function preloadNews() {
  const files = [...NEWSLETTER.stories.map(s => s.photo), ...PROMOS.map(p => p.photo)].filter(Boolean);
  return Promise.all(files.map(f => LOADING[f] || (LOADING[f] = new Promise(res => {
    PHOTO[f] = null; const i = new Image(); i.decoding = 'async';
    i.onload = () => { PHOTO[f] = i; res(); }; i.onerror = () => res(); i.src = '/assets/gallery/' + f;
  }))));
}
const photosIn = () => Object.values(PHOTO).filter(Boolean).length;

// The newsletter as pages (canvases). The front: the nameplate, the lead story's headline across the page over its
// photo, then the stories flowed through the columns. Inside: the standings, the next stops, a guide to the train and
// the cabinet, with house promotions in whatever room is left. Desktop: two columns a page, read as spreads;
// phones: one tall single-column page at a time, the type bigger.
export function typeset({ mobile, news, standings, events, logo, cabinet = CABINET, doors = DOORS, here = 'newsletter' }) {
  const S = mobile
    ? { W: 1024, H: 1700, M: 64, cols: 1, G: 0, body: 41, lh: 57, head: 60, hlh: 64, lead: 84, llh: 88, kick: 23, ksp: 4, cap: 26, clh: 35 }
    : { W: 1024, H: 1400, M: 58, cols: 2, G: 36, body: 27.5, lh: 38.5, head: 42, hlh: 46, lead: 64, llh: 68, kick: 17, ksp: 3, cap: 18.5, clh: 25 };
  const cw = (S.W - 2 * S.M - (S.cols - 1) * S.G) / S.cols, bottom = S.H - S.M - (mobile ? 70 : 64), pages = []; // a deeper bottom margin, where your hands hold it
  const mark = tinted(logo, RED, 128), full = S.W - 2 * S.M;
  let x, col = 0, y = 0, top = 0;
  const colX = () => S.M + col * (cw + S.G);
  const newPage = () => {
    const c = document.createElement('canvas'); c.width = S.W; c.height = S.H; x = c.getContext('2d'); newsprint(x, S.W, S.H, 11 + pages.length * 37);
    pages.push(c); col = 0; x.textBaseline = 'alphabetic';
    top = pages.length === 1 ? masthead() : running(); y = top;
    // rules between the columns
    x.fillStyle = 'rgba(29,28,32,.22)'; for (let k = 1; k < S.cols; k++) x.fillRect(S.M + k * (cw + S.G) - S.G / 2, top, 1.5, bottom - top);
  };
  // a photo, cropped to fill its frame and printed: the paper's tone multiplied in, the colour a little muted
  const photo = (img, px, py, w, h) => {
    const r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, px, py, w, h);
    x.save(); x.globalCompositeOperation = 'multiply'; x.fillStyle = NEWS; x.fillRect(px, py, w, h);
    x.globalCompositeOperation = 'saturation'; x.globalAlpha = .2; x.fillStyle = '#808080'; x.fillRect(px, py, w, h); x.restore();
    x.strokeStyle = 'rgba(29,28,32,.35)'; x.lineWidth = 1; x.strokeRect(px + .5, py + .5, w - 1, h - 1);
  };
  const caption = (text, px, py, w) => {
    x.font = `500 ${S.cap}px ${TEXT}`; x.fillStyle = '#4b473f'; x.textAlign = 'left';
    const lines = wrap(x, text, () => w); lines.forEach((l, k) => x.fillText(l.words.join(' '), px, py + S.cap + k * S.clh));
    return S.cap * .3 + lines.length * S.clh;
  };
  const masthead = () => {
    let yy = S.M;
    x.fillStyle = MUTE; x.font = `700 ${mobile ? 20 : 15}px ${SANS}`;
    spaced(x, 'NUEVA SCHOOL  ·  SPIRIT CABINET', S.W / 2, yy + 12, 3.4, 'center');
    yy += mobile ? 22 : 16;
    let fs = mobile ? 150 : 124; x.font = `800 ${fs}px ${SERIF}`; const tw = x.measureText('The Spirit Line').width; if (tw > full * .94) { fs *= full * .94 / tw; x.font = `800 ${fs}px ${SERIF}`; }
    x.fillStyle = INK; x.textAlign = 'center'; x.fillText('The Spirit Line', S.W / 2, yy + fs * .8); x.textAlign = 'left';
    yy += fs * 1.0;
    x.fillRect(S.M, yy, full, 4); x.fillRect(S.M, yy + 8, full, 1.5);
    // the dateline: the week, the logo, the issue
    const dl = yy + 8 + (mobile ? 42 : 34), ic = mobile ? 34 : 28;
    x.font = `700 ${mobile ? 21 : 16}px ${SANS}`; x.fillStyle = INK;
    spaced(x, news.week.toUpperCase(), S.M, dl, 1.8); spaced(x, `ISSUE ${news.issue}`, S.W - S.M, dl, 2.4, 'right');
    x.drawImage(mark, S.W / 2 - ic / 2, dl - ic * .78, ic, ic);
    yy = dl + (mobile ? 20 : 16); x.fillRect(S.M, yy, full, 1.5);
    yy += mobile ? 40 : 32;
    // the lead story's headline runs across the page, over its photo
    const lead = news.stories[0];
    if (lead) {
      if (lead.kicker) { x.font = `800 ${S.kick}px ${SANS}`; x.fillStyle = RED; spaced(x, lead.kicker.toUpperCase(), S.M, yy + S.kick, S.ksp); yy += S.kick + 14; }
      x.font = `700 ${S.lead}px ${SERIF}`; x.fillStyle = INK;
      balanced(x, lead.head, full).forEach(l => { x.textAlign = 'left'; x.fillText(l.words.join(' '), S.M, yy + S.lead * .82); yy += S.llh; });
      yy += mobile ? 18 : 14;
      const img = lead.photo && PHOTO[lead.photo];
      if (img) {
        const ph = Math.round(full * (mobile ? .6 : .46)); photo(img, S.M, yy, full, ph); yy += ph + 10;
        if (lead.caption) yy += caption(lead.caption, S.M, yy, full);
        yy += mobile ? 26 : 20;
      }
    }
    return yy;
  };
  const running = () => {
    x.font = `800 ${mobile ? 21 : 16}px ${SANS}`; x.fillStyle = INK;
    spaced(x, 'THE SPIRIT LINE', S.M, S.M + 14, 3);
    x.font = `700 ${mobile ? 21 : 16}px ${SANS}`; x.fillStyle = MUTE;
    if (!mobile) spaced(x, news.week.toUpperCase(), S.W / 2, S.M + 14, 2, 'center');
    spaced(x, String(pages.length), S.W - S.M, S.M + 14, 2, 'right');
    x.fillStyle = INK; x.fillRect(S.M, S.M + 28, full, 2);
    return S.M + 56;
  };
  const nextCol = () => { col++; if (col >= S.cols) newPage(); else y = top; };
  // when something that doesn't split (a box, a headline and its first lines) won't fit, the room it leaves goes to a promotion
  const need = h => { if (y + h > bottom) { promoIn(); nextCol(); } };
  const para = (text, { first = false, cap = false } = {}) => {
    x.font = `400 ${S.body}px ${SERIF}`;
    let body = text, capCh = '', capW = 0, capLines = 0;
    if (cap && text.length > 40) {
      capCh = text[0]; body = text.slice(1); capLines = 3;
      x.font = `700 ${S.lh * 3.15}px ${SERIF}`; capW = x.measureText(capCh).width + 10; x.font = `400 ${S.body}px ${SERIF}`;
    }
    const indent = first || cap ? 0 : S.body * 1.2;
    const lines = fit(x, body, i => cw - (i < capLines ? capW : 0) - (i === 0 ? indent : 0));
    lines.forEach((l, i) => {
      need(S.lh);
      if (i === 0 && capCh) { x.font = `700 ${S.lh * 3.15}px ${SERIF}`; x.fillStyle = RED; x.textAlign = 'left'; x.fillText(capCh, colX() - 2, y + S.lh * 2.78); }
      x.font = `400 ${S.body}px ${SERIF}`; x.fillStyle = INK;
      const off = (i < capLines ? capW : 0) + (i === 0 ? indent : 0);
      drawLine(x, l, colX() + off, y + S.lh * .74, cw - off, false); y += S.lh;
    });
    y += S.lh * .25;
  };
  const headline = (st) => {
    x.font = `700 ${S.head}px ${SERIF}`; const lines = balanced(x, st.head, cw), h = (st.kicker ? S.kick + 12 : 0) + lines.length * S.hlh + 10;
    if (y > top + 2) { need(h + 30 + 2 * S.lh); if (y > top + 2) { x.fillStyle = 'rgba(29,28,32,.35)'; x.fillRect(colX(), y + 8, cw, 1.5); y += 30; } }
    else need(h + 2 * S.lh);
    if (st.kicker) { x.font = `800 ${S.kick}px ${SANS}`; x.fillStyle = RED; spaced(x, st.kicker.toUpperCase(), colX(), y + S.kick, S.ksp); y += S.kick + 12; }
    x.font = `700 ${S.head}px ${SERIF}`; x.fillStyle = INK; lines.forEach(l => { x.textAlign = 'left'; x.fillText(l.words.join(' '), colX(), y + S.head * .84); y += S.hlh; });
    y += 10;
  };
  // a box that doesn't split: a heavy rule, a red label, its rows
  const box = (label, rows, rowH, drawRow) => {
    const h = 26 + S.kick + 14 + rows * rowH + 14;
    if (y > top + 2) { need(h + 26); if (y > top + 2) y += 26; } else need(h);
    x.fillStyle = INK; x.fillRect(colX(), y, cw, 4); y += 26;
    x.font = `800 ${S.kick}px ${SANS}`; x.fillStyle = RED; spaced(x, label.toUpperCase(), colX(), y + S.kick * .8, S.ksp); y += S.kick + 14;
    for (let k = 0; k < rows; k++) { drawRow(k, colX(), y, cw, rowH); y += rowH; }
    x.fillStyle = 'rgba(29,28,32,.35)'; x.fillRect(colX(), y + 6, cw, 1.5); y += 14 + S.lh * .4;
  };
  const standingsBox = () => {
    const rowH = mobile ? 70 : 50, n = standings.length, max = Math.max(1, ...standings.map(s => s.pts));
    box('Spirit Points', Math.max(1, n), rowH, (k, bx, by, bw) => {
      if (!n) { x.font = `italic 400 ${S.body}px ${SERIF}`; x.fillStyle = MUTE; x.textAlign = 'left'; x.fillText('Standings appear after the first event.', bx, by + S.lh * .8); return; }
      const s = standings[k], base = by + rowH * .56;
      x.font = `800 ${S.body * 1.05}px ${SANS}`; x.fillStyle = k === 0 ? RED : INK; x.textAlign = 'left'; x.fillText(String(s.rank), bx, base);
      x.font = `600 ${S.body * 1.05}px ${SERIF}`; x.fillStyle = INK; x.fillText(s.name, bx + S.body * 1.4, base);
      x.font = `800 ${S.body * 1.05}px ${SANS}`; x.textAlign = 'right'; x.fillText(s.pts.toLocaleString('en-US'), bx + bw, base); x.textAlign = 'left';
      x.fillStyle = 'rgba(29,28,32,.1)'; x.fillRect(bx + S.body * 1.4, base + 9, bw - S.body * 1.4, 5);
      x.fillStyle = CLASS_COL[s.id] || INK; x.fillRect(bx + S.body * 1.4, base + 9, (bw - S.body * 1.4) * s.pts / max, 5);
    });
  };
  const eventsBox = () => {
    const rowH = mobile ? 70 : 48, n = Math.min(events.length, 6);
    if (!n) return;
    box('Next stops', n, rowH, (k, bx, by, bw) => {
      const e = events[k], cy = by + rowH / 2, dx = bx + 12;
      x.fillStyle = INK; if (k < n - 1) x.fillRect(dx - 2, cy, 4, rowH); // the line between the stops
      x.beginPath(); x.arc(dx, cy, k ? 8 : 11, 0, Math.PI * 2); x.fillStyle = k ? NEWS : RED; x.fill(); x.lineWidth = 4; x.strokeStyle = k ? INK : RED; x.stroke();
      x.font = `${k ? 600 : 700} ${S.body * 1.05}px ${SERIF}`; x.fillStyle = INK; x.textAlign = 'left'; x.fillText(e.name, dx + 26, cy + S.body * .36);
      x.font = `700 ${S.kick}px ${SANS}`; x.fillStyle = MUTE; spaced(x, (e.date || 'TBA').toUpperCase(), bx + bw, cy + S.kick * .36, 1.5, 'right');
    });
  };
  // the train, car by car (this one marked), and who's on the cabinet
  const guideBox = () => {
    const rowH = mobile ? 66 : 46;
    box('On this train', doors.length, rowH, (k, bx, by, bw) => {
      const d = doors[k], base = by + rowH * .62;
      x.font = `800 ${S.kick * 1.1}px ${SANS}`; x.fillStyle = MUTE; x.textAlign = 'left'; spaced(x, 'CAR ' + (k + 1), bx, base, 1.5);
      x.font = `600 ${S.body * 1.05}px ${SERIF}`; x.fillStyle = INK; x.fillText(d.title, bx + S.kick * 5.4, base);
      const tw = x.measureText(d.title).width;
      if (d.id === here) { x.font = `800 ${S.kick * .95}px ${SANS}`; x.fillStyle = RED; const lab = bx + S.kick * 5.4 + tw + S.kick * 12 < bx + bw ? 'YOU ARE HERE' : 'HERE'; spaced(x, lab, bx + bw, base, 1.6, 'right'); }
    });
  };
  const cabinetBox = () => {
    if (!cabinet.length) return;
    const rowH = mobile ? 62 : 44;
    box('The Cabinet', cabinet.length, rowH, (k, bx, by, bw) => {
      const m = cabinet[k], base = by + rowH * .62;
      x.font = `600 ${S.body * 1.05}px ${SERIF}`; x.fillStyle = INK; x.textAlign = 'left'; x.fillText(m.name, bx, base);
      if (m.role) { x.font = `700 ${S.kick}px ${SANS}`; x.fillStyle = MUTE; spaced(x, m.role.toUpperCase(), bx + bw, base, 1.5, 'right'); }
      if (k < cabinet.length - 1) { x.fillStyle = 'rgba(29,28,32,.12)'; x.fillRect(bx, by + rowH - 1, bw, 1); }
    });
  };

  // house promotions for the rest of the line, in the room left at the foot of a column: a photo, a red kicker, a head
  let pN = 0;
  const promoText = (A, w) => {
    x.font = `700 ${S.head}px ${SERIF}`; const hl = balanced(x, A.head, w);
    x.font = `italic 400 ${S.body}px ${SERIF}`; const ln = wrap(x, A.line, () => w);
    return { hl, ln, h: S.kick + 14 + hl.length * S.hlh + 6 + ln.length * S.lh };
  };
  const promo = (px, py, w, h, A, t) => {
    const img = A.photo && PHOTO[A.photo];
    x.fillStyle = INK; x.fillRect(px, py, w, 4); let yy = py + 24;
    const room = h - 24 - t.h;
    if (img && room > 120) { const ph = Math.min(room - 22, w * .9); photo(img, px, yy, w, ph); yy += ph + 22; }
    const ci = doors.findIndex(d => d.id === A.car);
    x.font = `800 ${S.kick}px ${SANS}`; x.fillStyle = RED; spaced(x, ci < 0 ? 'ON THE PLATFORM' : 'CAR ' + (ci + 1), px, yy + S.kick, S.ksp); yy += S.kick + 14;
    x.font = `700 ${S.head}px ${SERIF}`; x.fillStyle = INK; t.hl.forEach(l => { x.textAlign = 'left'; x.fillText(l.words.join(' '), px, yy + S.head * .84); yy += S.hlh; });
    yy += 6; x.font = `italic 400 ${S.body}px ${SERIF}`; x.fillStyle = '#3c3933'; t.ln.forEach(l => { x.fillText(l.words.join(' '), px, yy + S.lh * .74); yy += S.lh; });
  };
  const promos = PROMOS.filter(A => A.car !== here && (!A.car || doors.some(d => d.id === A.car)));
  // one promotion in the room left in this column (with its photo if there's room for one; the last one takes what's
  // left); false if there isn't room even for its words
  const promoIn = () => {
    const gap = y > top + 2 ? 30 : 0, room = bottom - y - gap, A = promos[pN % promos.length]; if (!A) return false;
    const t = promoText(A, cw), img = A.photo && PHOTO[A.photo], text = 24 + t.h + 10, min = text + 160, max = text + 22 + cw * .72;
    if (room < text) return false;
    const h = !img || room < min ? text : room < min + max + 30 ? Math.min(room, text + 22 + cw * .9) : max;
    promo(colX(), y + gap, cw, h, A, t); pN++; y += gap + h; return true;
  };
  const fill = () => {
    for (;;) {
      if (promoIn()) continue;
      if (col + 1 < S.cols) { col++; y = top; continue; }
      break;
    }
    y = bottom;
  };

  newPage();
  const [lead, ...rest] = news.stories, story = st => { headline(st); st.body.forEach((p, j) => para(p, { first: j === 0 })); };
  if (lead) lead.body.forEach((p, k) => para(p, { first: k === 0, cap: k === 0 }));
  if (mobile) { standingsBox(); rest.forEach((st, k) => { story(st); if (k === 0) eventsBox(); }); if (!rest.length) eventsBox(); guideBox(); cabinetBox(); fill(); }
  else { // the stories on the front; the standings, the next stops, the guide and the cabinet inside
    rest.forEach(story);
    if (pages.length === 1) { fill(); newPage(); }
    standingsBox(); eventsBox(); guideBox(); cabinetBox(); fill();
    if (pages.length % 2) { newPage(); fill(); } // spreads need an even count
  }
  // the fold: the gutter between a spread's pages, or the crease across a phone's page, shaded as the paper bends
  pages.forEach((c, i) => {
    const g = c.getContext('2d'), W = S.W, H = S.H;
    if (mobile) {
      const gr = g.createLinearGradient(0, H / 2 - 46, 0, H / 2 + 46);
      gr.addColorStop(0, 'rgba(80,62,35,0)'); gr.addColorStop(.5, 'rgba(80,62,35,.08)'); gr.addColorStop(.53, 'rgba(255,252,240,.05)'); gr.addColorStop(1, 'rgba(80,62,35,0)');
      g.fillStyle = gr; g.fillRect(0, H / 2 - 46, W, 92);
    } else {
      const inner = i % 2 === 0 ? W : 0, gr = g.createLinearGradient(inner, 0, inner + (i % 2 === 0 ? -110 : 110), 0);
      gr.addColorStop(0, 'rgba(70,54,30,.2)'); gr.addColorStop(.25, 'rgba(70,54,30,.07)'); gr.addColorStop(1, 'rgba(70,54,30,0)');
      g.fillStyle = gr; g.fillRect(i % 2 === 0 ? W - 110 : 0, 0, 110, H);
    }
  });
  return pages;
}
// the back of the paper: newsprint with the columns of the other side showing through, faintly
function backside(mobile) {
  const c = document.createElement('canvas'); c.width = 512; c.height = mobile ? 850 : 700; const x = c.getContext('2d'), w = c.width, h = c.height;
  newsprint(x, w, h, 5);
  let s = 3; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  x.fillStyle = 'rgba(40,36,30,.07)';
  const cols = mobile ? 1 : 2, cw = (w - 60 - (cols - 1) * 18) / cols;
  for (let k = 0; k < cols; k++) for (let yy = 40; yy < h - 30; yy += 12) if (r() > .06) x.fillRect(30 + k * (cw + 18), yy, cw * (r() < .15 ? .3 + r() * .6 : 1), 5);
  return c;
}

/* ---------------- the newspaper in your hands ---------------- */
const tex = (canvas, aniso) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; };
// a page (or half a page): x from x0 to x0 + w, y from y0 to y0 + h, its texture's v from v0 to v1; `bow` curves it
// toward you away from the spine (x = 0), as a spread does when it's held open by its outer edges
const BOW = .022, bowZ = (xx, pw) => BOW * (1 - (1 - Math.min(1, Math.abs(xx) / pw)) ** 2);
function sheet(w, h, x0, y0, v0 = 0, v1 = 1, flipU = false, segs = 14, bow = 0) {
  const g = new THREE.PlaneGeometry(w, h, segs, 1); g.translate(x0 + w / 2, y0 + h / 2, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { uv.setY(i, v0 + (v1 - v0) * uv.getY(i)); if (flipU) uv.setX(i, 1 - uv.getX(i)); }
  if (bow) { const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setZ(i, bowZ(pos.getX(i), bow)); g.computeBoundingSphere(); }
  return g;
}
export class Reader {
  constructor(st) {
    this.st = st; const mob = this.mobile = st.mobile;
    setTimeout(preloadNews, 9000); // the paper's photos, once the station has loaded
    const g = this.g = new THREE.Group(); g.visible = false; st.scene.add(g);
    const pw = this.pw = .3, ph = this.ph = mob ? .5 : .41, aniso = this.aniso = st.renderer.capabilities.getMaxAnisotropy();
    const paperMat = () => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(.8, .79, .77) }); m.toneMapped = false; return m; }; // newsprint under the car's lights; kept under the bloom threshold
    this.backMat = paperMat(); this.backMat.map = this.blank = tex(backside(mob), 4); this.backMat.side = THREE.BackSide;
    const paper = this.paper = new THREE.Group(); g.add(paper);
    const two = (parent, geo, mat) => { const f = new THREE.Mesh(geo, mat); parent.add(f, new THREE.Mesh(geo, this.backMat)); return [f]; }; // a page and its back
    this.mats = [];
    const pm = () => { const m = paperMat(); m.map = this.blank; this.mats.push(m); return m; }; // every page starts blank (the same shader as with its print)
    if (!mob) { // a spread: the left page, the right page hinged at the spine, and a leaf that turns over it
      this.left = new THREE.Group(); this.right = new THREE.Group(); paper.add(this.left, this.right);
      this.leftFront = two(this.left, sheet(pw, ph, -pw, -ph / 2, 0, 1, false, 18, pw), pm())[0];
      this.rightFront = two(this.right, sheet(pw, ph, 0, -ph / 2, 0, 1, false, 18, pw), pm())[0];
    } else { // one tall page, folded across the middle: the top half, the bottom half hinged under it
      this.top = new THREE.Group(); this.bottom = new THREE.Group(); paper.add(this.top, this.bottom);
      const m = pm();
      this.topFront = two(this.top, sheet(pw, ph / 2, -pw / 2, 0, .5, 1), m)[0];
      this.bottomFront = two(this.bottom, sheet(pw, ph / 2, -pw / 2, -ph / 2, 0, .5), m)[0];
    }
    // the turning leaf: its front, and (on a spread) the next left page on its back, sharing one set of vertices
    this.leaf = new THREE.Group(); paper.add(this.leaf); this.leaf.visible = false;
    const lh = ph, ly = -lh / 2;
    this.leafGeo = sheet(pw, lh, 0, ly, 0, 1, false, 18); this.leafBackGeo = sheet(pw, lh, 0, ly, 0, 1, true, 18);
    this.leafBackGeo.setAttribute('position', this.leafGeo.attributes.position);
    this.leafBase = this.leafGeo.attributes.position.array.slice();
    this.leafFront = new THREE.Mesh(this.leafGeo, pm()); this.leaf.add(this.leafFront);
    const lb = mob ? this.backMat : (() => { const m = pm(); m.side = THREE.BackSide; return m; })();
    this.leafBack = new THREE.Mesh(this.leafBackGeo, lb); this.leaf.add(this.leafBack);
    if (mob) this.leaf.position.x = -pw / 2;
    // your hands, from your own Mini Character, as in the opening
    const armMat = library().material.clone(); armMat.emissiveMap = armMat.map; armMat.emissive = new THREE.Color(.3, .26, .24);
    this.arms = [-1, 1].map(sd => {
      const { geometry, tip } = limbGeometry(0, sd < 0 ? 'arm-right' : 'arm-left'), m = new THREE.Mesh(geometry, armMat);
      m.scale.setScalar(ARM); g.add(m); return { m, tip, sd };
    });
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 5; } });
    this.pages = []; this.texs = []; this.at = 0; this.turn = null; this.state = { up: 0, open: 0 };
  }
  // fill it with pages (canvases), back to the first
  setPages(pages) {
    this.texs.forEach(t => t && t.dispose()); this.pages = pages; this.texs = pages.map(() => null); this.at = 0; this.turn = null; this.leaf.visible = false;
    this._show(0);
  }
  _t(i) { if (i < 0 || i >= this.pages.length) return null; return this.texs[i] || (this.texs[i] = tex(this.pages[i], this.aniso)); }
  _set(mesh, i) { const m = mesh.material, t = this._t(i) || this.blank; if (m.map !== t) m.map = t; }
  _show(at) { // what's on the open pages at position `at` (a spread on desktop, a page on phones)
    if (this.mobile) { this._set(this.topFront, at); }
    else { this._set(this.leftFront, at * 2); this._set(this.rightFront, at * 2 + 1); }
  }
  get count() { return this.mobile ? this.pages.length : Math.ceil(this.pages.length / 2); }
  // turn a page (d = 1 forward, -1 back); false if there's nowhere to go
  step(d) {
    if (this.turn) return false;
    const to = this.at + d; if (to < 0 || to >= this.count) return false;
    const T = this.turn = { d, from: this.at, to, t0: performance.now() };
    if (this.mobile) {
      if (d > 0) { this._set(this.leafFront, this.at); this._show(to); }
      else { this._set(this.leafFront, to); }
    } else if (d > 0) { this._set(this.leafFront, this.at * 2 + 1); this._set(this.leafBack, to * 2); this._set(this.rightFront, to * 2 + 1); }
    else { this._set(this.leafFront, to * 2 + 1); this._set(this.leafBack, this.at * 2); this._set(this.leftFront, to * 2); }
    this.leaf.visible = true; this.at = to; T.dur = 720; return true;
  }
  // where the paper is held, in front of the eyes: framed by the view, a little high so the buttons below don't cover it
  frame(cam) {
    const hf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), wSp = this.mobile ? this.pw : this.pw * 2;
    const d = Math.max(this.ph / (2 * hf * .8), wSp / (2 * hf * cam.aspect * .93));
    this.read = { p: V(0, d * hf * (this.mobile ? .1 : .07), -d), r: -.05 };
    this.lap = { p: V(.02, -d * hf * 1.75, -d * .78), r: -1.05 };
  }
  // per frame, after the camera has its pose: follow the camera; up (0 on your lap, 1 reading), open (0 folded, 1 open)
  update(cam, t) {
    const g = this.g; g.position.copy(cam.position); g.quaternion.copy(cam.quaternion);
    const { up, open } = this.state, R = this.read, L = this.lap, P = this.paper, pw = this.pw, ph = this.ph;
    const u = ease(up), o = ease(open);
    P.position.lerpVectors(L.p, R.p, u); P.position.z += Math.sin(u * Math.PI) * .06; // it comes up toward you in an arc
    P.rotation.set(L.r + (R.r - L.r) * u + Math.sin(t * .9) * .008 * u, Math.sin(t * .6) * .012 * u, Math.sin(u * Math.PI) * .06 + Math.sin(t * .7) * .006 * u);
    // folded, it's centred in your hands; open, the spread (or the full page) is
    // (folded, the hidden half sits a hair behind, so the two don't fight over the same depth)
    // (the spread's curve comes in as it opens: folded, the halves lie flat together)
    if (!this.mobile) { this.left.rotation.y = .09; this.right.rotation.y = (Math.PI - .03) * (1 - o) - .09 * o; this.right.position.z = -.004 * (1 - o); P.position.x += pw / 2 * (1 - o); this.left.scale.z = this.right.scale.z = Math.max(.001, o); }
    else { this.bottom.rotation.x = (Math.PI - .04) * (1 - o) + .02 * o; this.bottom.position.z = -.004 * (1 - o); this.top.rotation.x = -.02 * o; P.position.y -= ph / 4 * (1 - o); }
    // a page turning over: across the spine toward you (or round the left edge, on a phone), curling as it goes
    const T = this.turn;
    if (T) {
      const p = clamp01((performance.now() - T.t0) / T.dur), k = ease(p), a = this.mobile ? (T.d > 0 ? -k * Math.PI : -(1 - k) * Math.PI) : (T.d > 0 ? -.09 - k * (Math.PI - .18) : -(Math.PI - .09) + k * (Math.PI - .18));
      this.leaf.rotation.y = a;
      // (on a spread the leaf keeps the page's curve, which turns over with it: toward you, flat on edge, then toward you again)
      const curl = Math.sin(Math.PI * p) * .07 * (T.d > 0 ? 1 : -1), pos = this.leafGeo.attributes.position, b = this.leafBase, bw = this.mobile ? 0 : Math.cos(a);
      for (let i = 0; i < pos.count; i++) { const xx = b[i * 3] / pw; pos.setZ(i, -curl * xx * xx + (bw && bowZ(b[i * 3], pw) * bw)); }
      pos.needsUpdate = true;
      if (p >= 1) {
        this.turn = null; this.leaf.visible = false;
        if (this.mobile) { if (T.d < 0) this._show(this.at); }
        else this._show(this.at);
      }
    }
    // the hands grip the outer edges, a little below the middle
    P.updateMatrix(); (this.mobile ? [this.top, this.bottom] : [this.left, this.right]).forEach(o2 => o2.updateMatrix());
    const inP = (grp, v) => v.applyMatrix4(grp.matrix).applyMatrix4(P.matrix);
    let gl, gr;
    if (!this.mobile) {
      gl = inP(this.left, V(-pw + .006, -ph / 2 + .028, .01 + BOW));
      const spine = V(-.014, -ph / 2 + .028, .03).applyMatrix4(P.matrix), edge = inP(this.right, V(pw - .006, -ph / 2 + .028, .01 + BOW));
      gr = spine.lerp(edge, clamp01(o * 1.3)); // folded, you hold it by the fold; it opens out in your right hand
    } else { // the lower corners: of the folded paper (the fold), then of the open page
      const kk = clamp01(o * 1.2);
      gl = inP(this.top, V(-pw / 2 + .012, .025, .01)).lerp(inP(this.bottom, V(-pw / 2 + .012, -ph / 2 + .03, .01)), kk);
      gr = inP(this.top, V(pw / 2 - .012, .025, .01)).lerp(inP(this.bottom, V(pw / 2 - .012, -ph / 2 + .03, .01)), kk);
    }
    [gl, gr].forEach((grip, k) => {
      const A = this.arms[k], sh = V(A.sd * .3, -.9, .02), dir = grip.clone().sub(sh).normalize();
      A.m.quaternion.copy(aimBasis(A.tip, V(0, 1, 0), dir, V(0, .3, 1)));
      A.m.position.copy(grip).addScaledVector(dir, -A.tip.length() * ARM);
    });
  }
  dispose() { this.texs.forEach(t => t && t.dispose()); this.texs = []; this.pages = []; this.mats.forEach(m => { m.map = this.blank; }); }
}

/* ---------------- the next-stops screen ---------------- */
// how far off an event is, from its `date` as written ('Fri, Oct 16', 'Oct 16', '2026-10-16'): 'Today', 'Tomorrow',
// 'In 9 days'; '' when it can't tell (no date, 'TBA', more than two months off, or already past)
export function dueIn(date, now = new Date()) {
  if (!date) return '';
  const s = String(date).replace(/^[a-z]{3,9},?\s+/i, '').trim(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = /\d{4}/.test(s) ? new Date(s) : new Date(s + ' ' + now.getFullYear());
  if (isNaN(d)) return '';
  d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (!/\d{4}/.test(s) && d < today - 864e5 * 120) d.setFullYear(d.getFullYear() + 1); // 'Jan 9', read in October, is next year's
  const n = Math.round((d - today) / 864e5);
  return n < 0 || n > 60 ? '' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}
// The screen over the step down, like the passenger displays in a real train: the line's bar and the time across
// the top, the stop you're looking at big on the left (when and where underneath), and the stops in order on the right
export class NextStops {
  constructor(st) {
    this.st = st; this.events = EVENTS; this.k = 0; this.from = 0; this.t0 = -9; this.live = false; this.key = '';
    const c = this.canvas = document.createElement('canvas'); c.width = 1280; c.height = 720; this.x = c.getContext('2d');
    this.tex = tex(c, 8);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(.8, .8, .8) }); this.mat.toneMapped = false; // just under the bloom threshold: crisp type, no glow
    this.mark = st.logo ? tinted(st.logo, '#ffffff', 128) : null;
    this.draw(1);
  }
  go(k) { const n = this.events.length; if (!n) return; k = ((k % n) + n) % n; if (k === this.k) return; this.from = this.k; this.k = k; this.t0 = performance.now() / 1000; }
  // per frame while you're looking at it: it moves on by itself, like the real ones; a change of stop cross-fades
  update() {
    const now = performance.now() / 1000; if (now - this.t0 > 6.5 && this.events.length > 1) { this.go(this.k + 1); this.onAuto && this.onAuto(); }
    const p = clamp01((now - this.t0) / .4), key = p < 1 ? 'slide' + p.toFixed(2) : 'still' + Math.floor(now / 20); // (the clock ticks over)
    if (key !== this.key) { this.key = key; this.draw(p); }
  }
  // (on a phone the screen is about a third of its pixels across, so it uses bigger type and shows fewer stops at once)
  draw(p = 1) {
    const x = this.x, W = 1280, H = 720, ev = this.events, n = ev.length, k = this.k, m = !!(this.st && this.st.mobile);
    const Z = m ? { tb: 104, logo: 62, line: 36, time: 44, lab: 34, name: 150, nmin: 76, dlab: 28, dval: 52, dsm: 44, dgap: 70, note: 44, slab: 28, show: 4, sname: 42, gap: 128, y0: 236 }
      : { tb: 84, logo: 50, line: 27, time: 32, lab: 22, name: 112, nmin: 56, dlab: 18, dval: 34, dsm: 30, dgap: 48, note: 30, slab: 18, show: 6, sname: 28, gap: 104, y0: 204 };
    const PAPER = '#f5f3ef', PANEL = '#e8e5df', LINE = '#c9c4bb', SPIRIT = '#c3242a', GREY = '#77727a';
    x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
    // the top bar: the line in its red, the time
    const TB = Z.tb; x.fillStyle = SPIRIT; x.fillRect(0, 0, W, TB);
    if (this.mark) x.drawImage(this.mark, 34, (TB - Z.logo) / 2, Z.logo, Z.logo);
    const tx = 50 + Z.logo, mid = TB / 2 + Z.line * .36;
    x.fillStyle = '#fff'; x.font = `800 ${Z.line}px ${SANS}`; const nw = spaced(x, 'SPIRIT LINE', tx, mid, Z.line * .13);
    x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(tx + nw + 22, TB / 2 - Z.line * .62, 2, Z.line * 1.25);
    x.fillStyle = 'rgba(255,255,255,.8)'; x.font = `500 ${Z.line}px ${TEXT}`; x.fillText('Events', tx + nw + 46, mid);
    const tm = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    x.fillStyle = '#fff'; x.font = `700 ${Z.time}px ${SANS}`; x.textAlign = 'right'; x.fillText(tm, W - 40, TB / 2 + Z.time * .36); x.textAlign = 'left';
    const PX = 820; // the stops panel
    if (!n) { x.font = `700 ${Z.name * .5}px ${SANS}`; x.fillStyle = INK; x.fillText('No events yet', 64, 330); this.tex.needsUpdate = true; return; }
    // the stop: which one, its name, then when and where in labelled columns
    const card = (i, alpha) => {
      if (alpha <= 0) return; const e = ev[i]; x.save(); x.globalAlpha = alpha;
      const L = 64, R = PX - 56, due = dueIn(e.date);
      let fs = Z.name; x.font = `800 ${fs}px ${SANS}`; let lines = wrap(x, e.name, () => R - L);
      while ((lines.length > 2 || lines.some(l => l.w > R - L)) && fs > Z.nmin) { fs -= 4; x.font = `800 ${fs}px ${SANS}`; lines = wrap(x, e.name, () => R - L); }
      if (lines.length > 2) { lines = lines.slice(0, 2); lines[1].words = [...lines[1].words]; while (lines[1].words.length > 1 && x.measureText(lines[1].words.join(' ') + '…').width > R - L) lines[1].words.pop(); lines[1].words[lines[1].words.length - 1] += '…'; }
      const cols = [['DATE', e.date || 'To be announced'], ['TIME', e.time], ['PLACE', e.place]].filter(c => c[1]);
      // the block (label, name, rule, details, note) centred in the space under the bar
      const hName = lines.length * fs * 1.02, hBlock = Z.lab + 14 + hName + 30 + Z.dgap + Z.dlab + Z.dval * 1.4 + (e.note ? Z.note * 3 : 0);
      let y = TB + Math.max(30, (H - TB - hBlock) / 2) + Z.lab;
      x.font = `800 ${Z.lab}px ${SANS}`; x.fillStyle = SPIRIT; const lw = spaced(x, i === 0 ? 'NEXT STOP' : `STOP ${i + 1}`, L, y, Z.lab * .18);
      if (due) { x.font = `700 ${Z.lab}px ${SANS}`; x.fillStyle = GREY; spaced(x, '·  ' + due.toUpperCase(), L + lw + 16, y, Z.lab * .14); }
      x.font = `800 ${fs}px ${SANS}`; x.fillStyle = INK; y += 14;
      lines.forEach(l => { y += fs * 1.02; x.fillText(l.words.join(' '), L - 4, y - fs * .2); });
      y += 30; x.fillStyle = LINE; x.fillRect(L, y, R - L, 2); y += Z.dgap + Z.dlab * .5;
      let cx = L; const cwid = (R - L) / (m ? Math.min(2, cols.length) : Math.max(2, cols.length));
      cols.slice(0, m ? 2 : 3).forEach(([lab, val], j) => {
        x.font = `700 ${Z.dlab}px ${SANS}`; x.fillStyle = GREY; spaced(x, lab, cx, y, Z.dlab * .16);
        x.font = `600 ${val.length > 16 ? Z.dsm : Z.dval}px ${TEXT}`; x.fillStyle = e.date || j ? INK : GREY;
        let v = val; while (x.measureText(v).width > cwid - 20 && v.length > 4) v = v.slice(0, -2).trimEnd() + '…';
        x.fillText(v, cx, y + Z.dval * 1.4); cx += cwid;
      });
      if (e.note) { const ny = y + Z.dval * 1.4 + Z.note * 2.2; x.fillStyle = SPIRIT; x.fillRect(L, ny - Z.note, 5, Z.note * 1.4); x.font = `600 ${Z.note}px ${TEXT}`; x.fillStyle = INK; x.fillText(e.note, L + 24, ny); }
      x.restore();
    };
    const sp = ease(p), fade = p < 1 && this.from !== k;
    if (fade) card(this.from, 1 - Math.min(1, sp * 2)); // the old stop fades out, then the new one in
    card(k, fade ? Math.max(0, sp * 2 - 1) : 1);
    // the stops, in order down a vertical line; the one shown is marked, a window of them if there are more
    x.fillStyle = PANEL; x.fillRect(PX, TB, W - PX, H - TB);
    x.font = `800 ${Z.slab}px ${SANS}`; x.fillStyle = GREY; spaced(x, 'STOPS', PX + 48, TB + Z.slab * 2.2, Z.slab * .22);
    const show = Math.min(n, Z.show), first = Math.max(0, Math.min(k - 1, n - show)), y0 = Z.y0, gap = show > 1 ? Math.min(Z.gap, (H - 76 - y0) / (show - 1)) : 0, lx = PX + 62;
    x.fillStyle = SPIRIT; if (show > 1) x.fillRect(lx - 3, y0, 6, gap * (show - 1));
    if (first > 0) { x.fillRect(lx - 3, y0 - 40, 6, 40); }
    if (first + show < n) { x.fillRect(lx - 3, y0 + gap * (show - 1), 6, 40); }
    for (let j = 0; j < show; j++) {
      const i = first + j, cy = y0 + gap * j, on = i === k, e = ev[i], sub = !m && e.date;
      if (on) { x.fillStyle = 'rgba(195,36,42,.09)'; x.fillRect(PX, cy - gap / 2 + 4, W - PX, gap - 8); x.fillStyle = SPIRIT; x.fillRect(PX, cy - gap / 2 + 4, 6, gap - 8); }
      x.beginPath(); x.arc(lx, cy, on ? 15 : 11, 0, Math.PI * 2); x.fillStyle = on ? SPIRIT : PAPER; x.fill(); x.lineWidth = 6; x.strokeStyle = SPIRIT; x.stroke();
      if (on) { x.beginPath(); x.arc(lx, cy, 5, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); }
      x.font = `${on ? 700 : 500} ${Z.sname}px ${TEXT}`; x.fillStyle = INK; let nm = e.name;
      while (x.measureText(nm).width > W - lx - 72 && nm.length > 4) nm = nm.slice(0, -2).trimEnd() + '…';
      x.fillText(nm, lx + 34, cy + (sub ? -3 : Z.sname * .36));
      if (sub) { x.font = `600 19px ${TEXT}`; x.fillStyle = GREY; x.fillText(e.date, lx + 34, cy + 25); }
    }
    this.tex.needsUpdate = true;
  }
}

/* ---------------- the visits ---------------- */
// the first 1.9 s of every visit: up to the door and through it into the vestibule, as when boarding
function flyIn(st, T, e) {
  const c = st.camera, p = e / 1.9;
  if (p < .5) { const u = ease(p / .5); c.position.lerpVectors(T.p0, T.p1, u); st.look.lerpVectors(T.l0, T.l1, u); }
  else { const u = ease((p - .5) / .5); c.position.lerpVectors(T.p1, T.v0, u); st.look.copy(T.l1); }
}
function setFov(st, f) { const c = st.camera; if (Math.abs(c.fov - f) > .01) { c.fov = f; c.updateProjectionMatrix(); } }
function base(st, i, cb) {
  const car = st.cars[i], L = (x, y, z) => car.localToWorld(V(x, y, z)), z = 1.45 + .05;
  return { t0: st.clock.elapsedTime, i, cb, L, fired: {}, fov: st.camera.fov, p0: st.camera.position.clone(), l0: st.look.clone(), p1: L(0, 1.75, z + 3.4), l1: L(0, 1.6, -1.4), v0: L(0, 1.62, .35) };
}
const fire = (T, e, k, at, fn) => { if (e >= at && !T.fired[k]) { T.fired[k] = 1; fn && fn(); } };

// Weekly Newsletter: down to the lower deck, into the bay, sit, and read
export function newsVisit(st, i, cb, standings = []) {
  const set = () => typeset({ mobile: st.mobile, news: NEWSLETTER, standings, events: EVENTS, logo: st.logo }), had = photosIn(), pages = set();
  const T = base(st, i, cb), L = T.L, R = READ_SEAT;
  preloadNews().then(() => { if (st.trip === T && !st.reader.g.visible && photosIn() > had) st.reader.setPages(set()); });
  T.walk = new THREE.CatmullRomCurve3([T.v0, L(.42, 1.61, -.42), L(1.0, 1.56, -.7), L(1.55, 1.49, -.44), L(2.47, 1.48, -.32)]);
  T.walkLen = T.walk.getLength();
  T.bay = L(2.42, 1.48, .1); T.seat = L(R.x + .1, 1.27, R.z); T.win = L(2.75, 1.38, 1.4); T.across = L(3.8, 1.2, R.z);
  const rd = st.reader; rd.setPages(pages); rd.state.up = 0; rd.state.open = 0; rd.g.visible = false;
  // the seated view's width, and the reading distance at that width (again if the window changes shape, or a phone turns)
  T.resize = () => {
    const cam = st.camera, f0 = cam.fov;
    T.fovIn = Math.min(80, Math.max(52, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / cam.aspect))));
    cam.fov = T.fovIn; cam.updateProjectionMatrix(); rd.frame(cam); cam.fov = f0; cam.updateProjectionMatrix();
  };
  T.resize();
  T.frame = (t, dt) => {
    const e = t - T.t0, c = st.camera;
    if (e < 1.9) flyIn(st, T, e);
    else if (e < 4.3) { // the step down and along the aisle, looking where you're going; the window bay comes into view
      const u = ease((e - 1.9) / 2.4), p = T.walk.getPointAt(u), ahead = T.walk.getPointAt(Math.min(1, u + .22)).setY(1.42);
      c.position.copy(p); c.position.y += Math.sin(u * T.walkLen * Math.PI * 1.7) * .012 * Math.sin(Math.PI * u);
      st.look.lerpVectors(T.l1, ahead, ease(Math.min(1, (e - 1.9) / .7))).lerp(T.win, ease(seg(u, .7, 1)) * .6);
    } else if (e < 5.2) { // into the bay, turning round to sit
      const v = ease((e - 4.3) / .9); c.position.lerpVectors(T.walk.getPointAt(1), T.bay, v);
      const w = T.win.clone().lerp(T.walk.getPointAt(1).setY(1.42), .4); st.look.copy(w).lerp(T.across, ease(seg(e, 4.55, 5.2)));
    } else if (e < 5.95) { // and down onto the seat, with a little settle
      const s = (e - 5.2) / .75; c.position.lerpVectors(T.bay, T.seat, ease(s)); c.position.y -= Math.sin(Math.PI * Math.min(1, s * 1.15)) * .035; st.look.copy(T.across);
    } else { c.position.copy(T.seat); c.position.y += Math.sin(t * 1.4) * .003; st.look.copy(T.across); }
    setFov(st, T.fov + (T.fovIn - T.fov) * ease(seg(e, 4.6, 6.1)));
    rd.g.visible = e > 5.85;
    rd.state.up = seg(e, 5.95, 6.9); rd.state.open = seg(e, 6.95, 7.65);
    fire(T, e, 'sit', 5.3, () => cb.sit && cb.sit());
    fire(T, e, 'paper', 5.95, () => cb.paper && cb.paper());
    fire(T, e, 'open', 6.95, () => cb.paper && cb.paper());
    fire(T, e, 'arrive', 7.7, () => cb.arrive && cb.arrive());
  };
  T.after = t => rd.update(st.camera, t);
  T.step = d => rd.step(d);
  T.label = () => ({ at: rd.at, count: rd.count });
  T.end = () => { rd.g.visible = false; rd.dispose(); };
  return T;
}
// Events: in through the door, a step back, and up at the next-stops screen
export function eventsVisit(st, i, cb) {
  const T = base(st, i, cb), L = T.L, S = SCREEN, scr = st.stops;
  T.walk = new THREE.CatmullRomCurve3([T.v0, L(-.18, 1.62, .47), L(-.42, 1.62, .52)]);
  T.target = L(S.x - .04, S.y - .045, S.z);
  // a field of view that frames the screen, a little high so the buttons below don't cover it
  const d = T.walk.getPointAt(1).distanceTo(T.target);
  T.resize = () => { T.fovIn = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max((S.h / 2 + .05) / (d * .72), (S.w / 2) / (d * .86 * st.camera.aspect)))); };
  T.resize();
  scr.go(0); scr.from = 0;
  T.frame = (t, dt) => {
    const e = t - T.t0, c = st.camera;
    if (e < 1.9) flyIn(st, T, e);
    else if (e < 3.7) { const u = ease((e - 1.9) / 1.8); c.position.copy(T.walk.getPointAt(u)); c.position.y += Math.sin(u * Math.PI * 2) * .008 * Math.sin(Math.PI * u); st.look.lerpVectors(T.l1, T.target, ease(seg(e, 1.95, 3.4))); }
    else { c.position.copy(T.walk.getPointAt(1)); c.position.y += Math.sin(t * 1.3) * .003; st.look.copy(T.target); }
    setFov(st, T.fov + (T.fovIn - T.fov) * ease(seg(e, 2.3, 3.7)));
    fire(T, e, 'arrive', 3.75, () => { scr.live = true; scr.t0 = performance.now() / 1000; scr.from = 0; cb.arrive && cb.arrive(); });
    if (scr.live) scr.update();
  };
  T.step = d => { const n = scr.events.length; if (!n) return false; scr.go(scr.k + d); return true; };
  T.label = () => ({ at: scr.k, count: scr.events.length });
  T.end = () => { scr.live = false; scr.go(0); scr.k = 0; scr.draw(1); };
  return T;
}

// Photo Gallery: in through the door, and the gallery opens over the car (hub.js); the view drifts a little behind it
export function galleryVisit(st, i, cb) {
  const T = base(st, i, cb), L = T.L;
  T.rest = L(-.25, 1.6, .5); T.target = L(-2.6, 1.45, -.2); // looking down into the lower saloon on the left
  T.frame = (t, dt) => {
    const e = t - T.t0, c = st.camera;
    if (e < 1.9) flyIn(st, T, e);
    else { const u = ease(seg(e, 1.9, 3.4)); c.position.lerpVectors(T.v0, T.rest, u); c.position.y += Math.sin(t * 1.1) * .004; st.look.lerpVectors(T.l1, T.target, u); }
    fire(T, e, 'arrive', 1.75, () => cb.arrive && cb.arrive());
  };
  T.end = () => {};
  return T;
}
