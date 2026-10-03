import * as THREE from 'three';
import { limbGeometry, aimBasis, library } from './people.js';
import { READ_SEAT, SCREEN } from './interior.js';
import { EVENTS, NEWSLETTER } from './doors.js';

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
// the logo (white on clear) in a colour of our choice
function tinted(img, col, size) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  if (img) { x.drawImage(img, 0, 0, size, size); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, size, size); }
  return c;
}

// The newsletter as pages (canvases): a masthead and the lead story on the front, then the stories flowed through
// the columns, with the standings and the next events as boxes. Desktop: two columns a page, read as spreads;
// phones: one tall single-column page at a time, the type bigger.
export function typeset({ mobile, news, standings, events, logo }) {
  const S = mobile
    ? { W: 1024, H: 1700, M: 64, cols: 1, G: 0, body: 41, lh: 57, head: 60, hlh: 64, lead: 84, llh: 86, kick: 23, ksp: 4 }
    : { W: 1024, H: 1400, M: 58, cols: 2, G: 36, body: 27.5, lh: 38.5, head: 42, hlh: 46, lead: 66, llh: 70, kick: 17, ksp: 3 };
  const cw = (S.W - 2 * S.M - (S.cols - 1) * S.G) / S.cols, bottom = S.H - S.M - (mobile ? 70 : 64), pages = []; // a deeper bottom margin, where your hands hold it
  const mark = tinted(logo, RED, 128);
  let x, col = 0, y = 0, top = 0;
  const colX = () => S.M + col * (cw + S.G);
  const newPage = () => {
    const c = document.createElement('canvas'); c.width = S.W; c.height = S.H; x = c.getContext('2d'); newsprint(x, S.W, S.H, 11 + pages.length * 37);
    pages.push(c); col = 0; x.textBaseline = 'alphabetic';
    top = pages.length === 1 ? masthead() : running(); y = top;
    // rules between the columns
    x.fillStyle = 'rgba(29,28,32,.22)'; for (let k = 1; k < S.cols; k++) x.fillRect(S.M + k * (cw + S.G) - S.G / 2, top, 1.5, bottom - top);
  };
  const masthead = () => {
    let yy = S.M;
    x.fillStyle = MUTE; x.font = `700 ${mobile ? 21 : 16}px ${SANS}`;
    spaced(x, 'NUEVA SCHOOL', S.M, yy + 14, 3); spaced(x, `ISSUE ${news.issue}`, S.W - S.M, yy + 14, 3, 'right');
    yy += 26;
    let fs = mobile ? 136 : 118; x.font = `800 ${fs}px ${SERIF}`; const room = S.W - 2 * S.M - (mobile ? 0 : 220), tw = x.measureText('The Spirit Line').width; if (tw > room) { fs *= room / tw; x.font = `800 ${fs}px ${SERIF}`; }
    x.fillStyle = INK; x.textAlign = 'center'; x.fillText('The Spirit Line', S.W / 2, yy + fs * .8);
    if (!mobile) { const ic = 74; x.drawImage(mark, S.M + 8, yy + fs * .42 - ic / 2, ic, ic); x.drawImage(mark, S.W - S.M - 8 - ic, yy + fs * .42 - ic / 2, ic, ic); } // the logo in each ear
    yy += fs * 1.22;
    x.font = `800 ${mobile ? 22 : 17}px ${SANS}`; x.fillStyle = RED;
    spaced(x, 'WEEKLY NEWSLETTER OF THE NUEVA SPIRIT CABINET', S.W / 2, yy, mobile ? 2.4 : 3.2, 'center');
    yy += mobile ? 24 : 20;
    x.fillStyle = INK; x.fillRect(S.M, yy, S.W - 2 * S.M, 4); x.fillRect(S.M, yy + 8, S.W - 2 * S.M, 1.5);
    x.font = `700 ${mobile ? 22 : 17}px ${SANS}`; x.fillStyle = INK;
    spaced(x, news.week.toUpperCase(), S.M, yy + (mobile ? 42 : 36), 1.6); spaced(x, 'ALL ABOARD', S.W - S.M, yy + (mobile ? 42 : 36), 2.4, 'right');
    yy += mobile ? 58 : 50; x.fillRect(S.M, yy, S.W - 2 * S.M, 1.5);
    yy += mobile ? 34 : 28;
    // the lead story's headline runs across the page
    const lead = news.stories[0];
    if (lead) {
      if (lead.kicker) { x.font = `800 ${S.kick}px ${SANS}`; x.fillStyle = RED; spaced(x, lead.kicker.toUpperCase(), S.M, yy + S.kick, S.ksp); yy += S.kick + 14; }
      x.font = `700 ${S.lead}px ${SERIF}`; x.fillStyle = INK;
      wrap(x, lead.head, () => S.W - 2 * S.M).forEach(l => { x.textAlign = 'left'; x.fillText(l.words.join(' '), S.M, yy + S.lead * .82); yy += S.llh; });
      yy += mobile ? 16 : 12;
    }
    return yy;
  };
  const running = () => {
    x.font = `800 ${mobile ? 21 : 16}px ${SANS}`; x.fillStyle = INK;
    spaced(x, 'THE SPIRIT LINE', S.M, S.M + 14, 3);
    x.font = `700 ${mobile ? 21 : 16}px ${SANS}`; x.fillStyle = MUTE;
    if (!mobile) spaced(x, news.week.toUpperCase(), S.W / 2, S.M + 14, 2, 'center');
    spaced(x, String(pages.length), S.W - S.M, S.M + 14, 2, 'right');
    x.fillStyle = INK; x.fillRect(S.M, S.M + 28, S.W - 2 * S.M, 2);
    return S.M + 56;
  };
  const nextCol = () => { col++; if (col >= S.cols) newPage(); else y = top; };
  const need = h => { if (y + h > bottom) nextCol(); };
  const para = (text, { first = false, cap = false } = {}) => {
    x.font = `400 ${S.body}px ${SERIF}`;
    let body = text, capCh = '', capW = 0, capLines = 0;
    if (cap && text.length > 40) {
      capCh = text[0]; body = text.slice(1); capLines = 3;
      x.font = `700 ${S.lh * 3.15}px ${SERIF}`; capW = x.measureText(capCh).width + 10; x.font = `400 ${S.body}px ${SERIF}`;
    }
    const indent = first || cap ? 0 : S.body * 1.2;
    const lines = wrap(x, body, i => cw - (i < capLines ? capW : 0) - (i === 0 ? indent : 0));
    lines.forEach((l, i) => {
      need(S.lh);
      if (i === 0 && capCh) { x.font = `700 ${S.lh * 3.15}px ${SERIF}`; x.fillStyle = RED; x.textAlign = 'left'; x.fillText(capCh, colX() - 2, y + S.lh * 2.78); }
      x.font = `400 ${S.body}px ${SERIF}`; x.fillStyle = INK;
      const off = (i < capLines ? capW : 0) + (i === 0 ? indent : 0);
      drawLine(x, l, colX() + off, y + S.lh * .74, cw - off, true); y += S.lh;
    });
    y += S.lh * .25;
  };
  const headline = (st) => {
    x.font = `700 ${S.head}px ${SERIF}`; const lines = wrap(x, st.head, () => cw), h = (st.kicker ? S.kick + 12 : 0) + lines.length * S.hlh + 10;
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

  // house adverts for the rest of the line, where a column has room to spare
  const ADS = [
    { bg: RED, fg: '#fff', kick: 'Nueva Spirit', head: 'Every event counts', line: 'All aboard the Spirit Line.', logo: true },
    { bg: '#1c2a66', fg: '#fff', kick: 'Car 1', head: 'Photo Gallery', line: 'Pictures from every spirit event.' },
    { bg: '#ead9b8', fg: INK, kick: 'Car 4', head: 'Meet the Cabinet', line: 'Walk to the back of the car. The cab door is open.' },
    { bg: INK, fg: '#fff', kick: 'On the platform', head: 'The Leaderboard', line: 'Ask the officer for the latest standings.' }
  ];
  let adN = 0;
  const ad = (ax, ay, aw, ah) => {
    const A = ADS[adN++ % ADS.length];
    const tall = ah > 640; let k = Math.min(1.25, Math.max(.75, aw / 440)) * (mobile ? 1.35 : 1) * (tall ? 1.3 : 1), lines, sub, ih;
    for (let n = 0; n < 6; n++) { // as big as the space allows
      x.font = `700 ${40 * k}px ${SERIF}`; lines = wrap(x, A.head, () => aw - 60);
      x.font = `italic 400 ${22 * k}px ${SERIF}`; sub = wrap(x, A.line, () => aw - 70);
      ih = (A.logo || tall ? 110 * k : 0) + 30 * k + lines.length * 46 * k + 16 * k + sub.length * 30 * k;
      if (ih <= ah - 50) break; k *= Math.max(.6, (ah - 50) / ih);
    }
    x.fillStyle = A.bg; x.fillRect(ax, ay, aw, ah);
    if (A.bg === '#ead9b8') { x.strokeStyle = INK; x.lineWidth = 3; x.strokeRect(ax + 10, ay + 10, aw - 20, ah - 20); }
    let yy = ay + (ah - ih) / 2;
    if (A.logo || tall) { x.drawImage(tinted(logo, A.bg === '#ead9b8' ? RED : A.fg, 256), ax + aw / 2 - 45 * k, yy, 90 * k, 90 * k); yy += 110 * k; }
    x.fillStyle = A.fg; x.globalAlpha = .75; x.font = `800 ${15 * k}px ${SANS}`; spaced(x, A.kick.toUpperCase(), ax + aw / 2, yy + 15 * k, 3 * k, 'center'); x.globalAlpha = 1; yy += 30 * k;
    x.font = `700 ${40 * k}px ${SERIF}`; x.textAlign = 'center'; lines.forEach(l => { yy += 46 * k; x.fillText(l.words.join(' '), ax + aw / 2, yy - 10 * k); });
    yy += 16 * k; x.font = `italic 400 ${22 * k}px ${SERIF}`; sub.forEach(l => { yy += 30 * k; x.fillText(l.words.join(' '), ax + aw / 2, yy - 6 * k); }); x.textAlign = 'left';
  };
  const fill = () => {
    if (bottom - y > 240) ad(colX(), y + 12, cw, bottom - y - 12);
    for (let c = col + 1; c < S.cols; c++) { col = c; ad(colX(), top, cw, bottom - top); }
    y = bottom;
  };

  newPage();
  const [lead, ...rest] = news.stories, story = st => { headline(st); st.body.forEach((p, j) => para(p, { first: j === 0 })); };
  if (lead) lead.body.forEach((p, k) => para(p, { first: k === 0, cap: k === 0 }));
  if (mobile) { standingsBox(); rest.forEach((st, k) => { story(st); if (k === 0) eventsBox(); }); if (!rest.length) eventsBox(); fill(); }
  else { // the stories on the front; the standings and the next stops inside
    rest.forEach(story);
    if (pages.length === 1) { fill(); newPage(); }
    standingsBox(); eventsBox(); fill();
    if (pages.length % 2) { newPage(); ad(S.M, top + 10, S.W - 2 * S.M, bottom - top - 10); } // spreads need an even count
  }
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
// a page (or half a page): x from x0 to x0 + w, y from y0 to y0 + h, its texture's v from v0 to v1; bowed a touch
function sheet(w, h, x0, y0, v0 = 0, v1 = 1, flipU = false, segs = 14) {
  const g = new THREE.PlaneGeometry(w, h, segs, 1); g.translate(x0 + w / 2, y0 + h / 2, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { uv.setY(i, v0 + (v1 - v0) * uv.getY(i)); if (flipU) uv.setX(i, 1 - uv.getX(i)); }
  return g;
}
export class Reader {
  constructor(st) {
    this.st = st; const mob = this.mobile = st.mobile;
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
      this.leftFront = two(this.left, sheet(pw, ph, -pw, -ph / 2), pm())[0];
      this.rightFront = two(this.right, sheet(pw, ph, 0, -ph / 2), pm())[0];
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
    if (!this.mobile) { this.left.rotation.y = .09; this.right.rotation.y = (Math.PI - .03) * (1 - o) - .09 * o; this.right.position.z = -.004 * (1 - o); P.position.x += pw / 2 * (1 - o); }
    else { this.bottom.rotation.x = (Math.PI - .04) * (1 - o) + .02 * o; this.bottom.position.z = -.004 * (1 - o); this.top.rotation.x = -.02 * o; P.position.y -= ph / 4 * (1 - o); }
    // a page turning over: across the spine toward you (or round the left edge, on a phone), curling as it goes
    const T = this.turn;
    if (T) {
      const p = clamp01((performance.now() - T.t0) / T.dur), k = ease(p), a = this.mobile ? (T.d > 0 ? -k * Math.PI : -(1 - k) * Math.PI) : (T.d > 0 ? -.09 - k * (Math.PI - .18) : -(Math.PI - .09) + k * (Math.PI - .18));
      this.leaf.rotation.y = a;
      const curl = Math.sin(Math.PI * p) * .07 * (T.d > 0 ? 1 : -1), pos = this.leafGeo.attributes.position, b = this.leafBase;
      for (let i = 0; i < pos.count; i++) { const xx = b[i * 3] / pw; pos.setZ(i, -curl * xx * xx); }
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
      gl = inP(this.left, V(-pw + .006, -ph / 2 + .028, .01));
      const spine = V(-.014, -ph / 2 + .028, .03).applyMatrix4(P.matrix), edge = inP(this.right, V(pw - .006, -ph / 2 + .028, .01));
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
export class NextStops {
  constructor(st) {
    this.st = st; this.events = EVENTS; this.k = 0; this.from = 0; this.t0 = -9; this.live = false; this.key = '';
    const c = this.canvas = document.createElement('canvas'); c.width = 1280; c.height = 720; this.x = c.getContext('2d');
    this.tex = tex(c, 8);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(.86, .86, .86) }); this.mat.toneMapped = false;
    this.mark = st.logo ? tinted(st.logo, '#ffffff', 128) : null;
    this.draw(1);
  }
  go(k) { const n = this.events.length; if (!n) return; k = ((k % n) + n) % n; if (k === this.k) return; this.from = this.k; this.k = k; this.t0 = performance.now() / 1000; }
  // per frame while you're looking at it: the change of page slides, the current stop's ring pulses
  update() {
    let now = performance.now() / 1000; if (now - this.t0 > 6.5 && this.events.length > 1) { this.go(this.k + 1); this.onAuto && this.onAuto(); } // the display moves on by itself, like the real ones
    const p = clamp01((now - this.t0) / .45), key = p < 1 ? 'slide' + p.toFixed(2) : 'pulse' + Math.floor(now * 6);
    if (key !== this.key) { this.key = key; this.draw(p, now); }
  }
  draw(p = 1, now = 0) {
    const x = this.x, W = 1280, H = 720, ev = this.events, n = ev.length, k = this.k;
    const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d1433'); bg.addColorStop(1, '#141d45'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    // the top bar: the line's name in its red, the time
    x.fillStyle = '#0a0f28'; x.fillRect(0, 0, W, 92); x.fillStyle = '#c9272c'; x.fillRect(0, 0, 430, 92);
    if (this.mark) x.drawImage(this.mark, 30, 18, 56, 56);
    x.fillStyle = '#fff'; x.font = `900 36px ${SANS}`; x.textBaseline = 'alphabetic'; spaced(x, 'SPIRIT LINE', 104, 59, 5);
    const tm = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    x.font = `700 38px ${SANS}`; x.fillStyle = '#fff'; x.textAlign = 'right'; x.fillText(tm, W - 40, 60); x.textAlign = 'left';
    if (!n) { x.font = `800 60px ${SANS}`; x.fillStyle = '#fff'; x.fillText('No events yet', 70, 330); this.tex.needsUpdate = true; return; }
    // the stop: a label, the event's name, when and where. A change of page slides the old one out and the new one in
    const card = (i, off, alpha) => {
      if (alpha <= 0) return; const e = ev[i]; x.save(); x.globalAlpha = alpha; x.translate(off, 0);
      x.font = `800 32px ${SANS}`; x.fillStyle = '#ffad1f'; spaced(x, i === 0 ? 'NEXT STOP' : `STOP ${i + 1}`, 70, 170, 7);
      let fs = 136; x.font = `900 ${fs}px ${SANS}`; try { x.fontStretch = 'expanded'; } catch (er) {}
      const nw = x.measureText(e.name.toUpperCase()).width; if (nw > W - 140) { fs *= (W - 140) / nw; x.font = `900 ${fs}px ${SANS}`; }
      x.fillStyle = '#fff'; x.fillText(e.name.toUpperCase(), 66, 170 + 30 + fs * .8); try { x.fontStretch = 'normal'; } catch (er) {}
      const when = [e.date, e.time].filter(Boolean).join('  ·  ') || 'Date to be announced';
      x.font = `700 46px ${SANS}`; x.fillStyle = '#ffd27a'; x.fillText(when, 70, 400);
      const sub = [e.place, e.note].filter(Boolean).join('  ·  ');
      if (sub) { x.font = `500 36px ${TEXT}`; x.fillStyle = '#c3c8e6'; x.fillText(sub, 70, 456); }
      x.restore();
    };
    const sp = ease(p), dir = this.k >= this.from ? 1 : -1;
    if (p < 1) card(this.from, -dir * 90 * sp, 1 - sp);
    card(k, dir * 90 * (1 - sp), sp);
    // the route along the bottom: every event a stop, the current one ringed
    const y0 = 590, xa = 110, xb = W - 110, xs = i => n === 1 ? (xa + xb) / 2 : xa + (xb - xa) * i / (n - 1);
    x.lineCap = 'round'; x.strokeStyle = '#3a4676'; x.lineWidth = 10; x.beginPath(); x.moveTo(xa - 40, y0); x.lineTo(xb + 40, y0); x.stroke();
    x.strokeStyle = '#ffad1f'; x.beginPath(); x.moveTo(xa - 40, y0); x.lineTo(xs(k), y0); x.stroke();
    const pulse = (now * 1.4) % 1;
    for (let i = 0; i < n; i++) {
      const cx = xs(i), on = i === k;
      if (on) { x.beginPath(); x.arc(cx, y0, 24 + pulse * 26, 0, Math.PI * 2); x.strokeStyle = `rgba(255,173,31,${.55 * (1 - pulse)})`; x.lineWidth = 5; x.stroke(); }
      x.beginPath(); x.arc(cx, y0, on ? 22 : 14, 0, Math.PI * 2); x.fillStyle = on ? '#ffad1f' : i < k ? '#ffad1f' : '#fff'; x.fill();
      x.lineWidth = 6; x.strokeStyle = '#0d1433'; x.stroke();
      x.font = `${on ? 700 : 600} 25px ${TEXT}`; x.fillStyle = on ? '#ffd27a' : '#dfe3f5'; x.textAlign = 'center';
      const lines = wrap(x, ev[i].name, () => Math.min(230, (xb - xa) / Math.max(1, n - 1) - 16));
      lines.slice(0, 2).forEach((l, j) => x.fillText(l.words.join(' '), cx, y0 + 62 + j * 30));
      x.textAlign = 'left';
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
  const pages = typeset({ mobile: st.mobile, news: NEWSLETTER, standings, events: EVENTS, logo: st.logo });
  const T = base(st, i, cb), L = T.L, R = READ_SEAT;
  T.walk = new THREE.CatmullRomCurve3([T.v0, L(.42, 1.61, -.42), L(1.0, 1.56, -.7), L(1.55, 1.49, -.44), L(2.47, 1.48, -.32)]);
  T.walkLen = T.walk.getLength();
  T.bay = L(2.42, 1.48, .1); T.seat = L(R.x + .1, 1.27, R.z); T.win = L(2.75, 1.38, 1.4); T.across = L(3.8, 1.2, R.z);
  const a = st.camera.aspect; T.fovIn = Math.min(80, Math.max(52, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(36)) / a))));
  const rd = st.reader; rd.setPages(pages); rd.state.up = 0; rd.state.open = 0; rd.g.visible = false;
  const cam = st.camera, f0 = cam.fov; cam.fov = T.fovIn; cam.updateProjectionMatrix(); rd.frame(cam); cam.fov = f0; cam.updateProjectionMatrix();
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
  const end = T.walk.getPointAt(1), d = end.distanceTo(T.target), a = st.camera.aspect;
  T.fovIn = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max((S.h / 2 + .05) / (d * .72), (S.w / 2) / (d * .86 * a))));
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
