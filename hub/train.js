import * as THREE from 'three';

// Shared dimensions for the train (metres-ish).
export const CAR_L = 8, GAP = .36, W = 2.9, H = 4.05, BASE = .3, FLOOR = .55, DOOR_W = 1.3, DOOR_H = 2.1, NOSE_L = 2.6;
const HW = W / 2, YC = (H + BASE) / 2, HH = (H - BASE) / 2, N_EXP = 8, M = 112;

/* ---------- cross-section ----------
   A superellipse: flat sides and floor, rounded roof edges. The perimeter parameter v runs from
   0 at the bottom centre, up the right (+z, platform) side to 0.5 at the roof, and back down the left. */
export function sectionPoint(theta, hw = HW, yc = YC, hh = HH, n = N_EXP) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return [hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), yc + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}
const thetaOfV = v => v * Math.PI * 2 - Math.PI / 2;
// v on the right-hand side for a given height on the body
export function vOfY(y) {
  const k = Math.max(-1, Math.min(1, (y - YC) / HH)), th = Math.asin(Math.sign(k) * Math.pow(Math.abs(k), N_EXP / 2));
  return (th + Math.PI / 2) / (Math.PI * 2);
}

function ringGeometry(rings) { // rings: [{x, pts:[[z,y]...], u}]
  const pos = [], uv = [], idx = [], R = rings[0].pts.length;
  rings.forEach(r => r.pts.forEach(([z, y], j) => { pos.push(r.x, y, z); uv.push(r.u, j / (R - 1)); }));
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < R - 1; j++) {
    const a = i * R + j, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function ringPts(hw, yc, hh) { const p = []; for (let j = 0; j <= M; j++) p.push(sectionPoint(thetaOfV(j / M), hw, yc, hh)); return p; }

export function bodyGeometry() {
  const p = ringPts(HW, YC, HH), rings = [];
  for (let i = 0; i <= 8; i++) rings.push({ x: -CAR_L / 2 + CAR_L * i / 8, pts: p, u: i / 8 });
  return ringGeometry(rings);
}
export function capGeometry() {
  const sh = new THREE.Shape(); ringPts(HW, YC, HH).forEach(([z, y], j) => j ? sh.lineTo(z, y) : sh.moveTo(z, y));
  return new THREE.ShapeGeometry(sh, 4);
}

// the streamlined nose, lofted forward from the body section to a rounded tip
const TOP = [[0, H], [.28, H - .02], [.46, H - .22], [.62, 3.35], [.78, 2.55], [.88, 2.1], [.95, 1.9], [1, 1.75]];
function lerpTable(t, s) { for (let i = 0; i < t.length - 1; i++) if (s <= t[i + 1][0]) { const k = (s - t[i][0]) / (t[i + 1][0] - t[i][0]), e = k * k * (3 - 2 * k); return t[i][1] + (t[i + 1][1] - t[i][1]) * e; } return t[t.length - 1][1]; }
export function noseFrame(s) {
  const close = s < .78 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((s - .78) / .22, 2)));
  const top = lerpTable(TOP, s), bot = BASE + .03 * s, hw = HW * (1 - .1 * s * s);
  const cy = (top + bot) / 2 * close + 1.2 * (1 - close);
  return { x: -NOSE_L * s, hw: Math.max(.001, hw * (close * .85 + .15 * Math.sqrt(close))), yc: cy, hh: Math.max(.001, (top - bot) / 2 * close) };
}
export function nosePoint(s, theta, out = 0) {
  const f = noseFrame(s), [z, y] = sectionPoint(theta, f.hw + out, f.yc, f.hh + out);
  return new THREE.Vector3(f.x, y, z);
}
export function noseGeometry() {
  const rings = [], N = 46;
  for (let i = 0; i <= N; i++) { const s = 1 - Math.pow(1 - i / N, 1.25), f = noseFrame(s); rings.push({ x: f.x, pts: ringPts(f.hw, f.yc, f.hh), u: s }); }
  const g = ringGeometry(rings);
  // rings run toward -x, so flip the winding to keep faces pointing out
  const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals(); return g;
}

/* ---------- paint ---------- */
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
function noise(x, w, h, alpha, scale = 1) {
  const d = x.getImageData(0, 0, w, h), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const n = (Math.random() - .5) * alpha * 255; a[i] += n; a[i + 1] += n; a[i + 2] += n * scale; }
  x.putImageData(d, 0, 0);
}
export const windowSlots = () => {
  const segL = CAR_L / 2 - DOOR_W / 2 - .12, out = [];
  [-1, 1].forEach(sd => [[1.42, .72], [2.84, .72]].forEach(([y, h]) => [.2, .5, .8].forEach(f => out.push({ x: sd * (DOOR_W / 2 + .12 + (f + (y > 2 ? .03 : 0)) * segL), y, w: segL * .25, h }))));
  return out;
};

// the side of a car: brushed stainless, a red lower band with a white pinstripe, a grey band between
// the decks, window gaskets, panel seams and rivets, and road grime toward the bottom
export function paintBody(logo) {
  const TW = 2048, TH = 1024, X = x => (x + CAR_L / 2) / CAR_L * TW, R = v => (1 - v) * TH;
  const both = (y0, y1, fill, xa = -CAR_L / 2, xb = CAR_L / 2, ctx) => {
    const a = R(vOfY(y1)), b = R(vOfY(y0)); ctx.fillStyle = fill; ctx.fillRect(X(xa), a, X(xb) - X(xa), b - a);
    const a2 = R(1 - vOfY(y0)), b2 = R(1 - vOfY(y1)); ctx.fillRect(X(xa), a2, X(xb) - X(xa), b2 - a2);
  };
  const col = canvas(TW, TH), x = col.getContext('2d');
  const g = x.createLinearGradient(0, R(vOfY(H)), 0, R(vOfY(BASE))); g.addColorStop(0, '#e4e7ec'); g.addColorStop(.5, '#cdd1d7'); g.addColorStop(1, '#b3b8c0');
  x.fillStyle = g; x.fillRect(0, 0, TW, TH);
  for (let i = 0; i < 1400; i++) { x.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(60,66,76,.06)'; x.fillRect(Math.random() * TW, Math.random() * TH, 40 + Math.random() * 260, 1); }
  x.fillStyle = '#8f949c'; x.fillRect(0, R(.5) - 70, TW, 140); // roof
  both(BASE, .78, '#c3262c', undefined, undefined, x);
  both(.8, .84, '#f4f1ea', undefined, undefined, x);
  both(2.0, 2.27, '#5f656e', undefined, undefined, x);
  both(3.55, 3.63, '#c3262c', undefined, undefined, x);
  // window gaskets
  windowSlots().forEach(w => {
    const a = R(vOfY(w.y + w.h / 2 + .045)), b = R(vOfY(w.y - w.h / 2 - .045));
    x.fillStyle = '#121318'; x.beginPath(); x.roundRect(X(w.x - w.w / 2 - .045), a, X(w.w + .09) - X(0), b - a, 14); x.fill();
  });
  // door surround
  { const a = R(vOfY(FLOOR + DOOR_H + .12)), b = R(vOfY(FLOOR)); x.fillStyle = '#9da3ab'; x.fillRect(X(-DOOR_W / 2 - .16), a, X(DOOR_W + .32) - X(0), b - a); }
  // panel seams with rivets
  const seams = [-CAR_L / 2 + .02, CAR_L / 2 - .02, ...[-1, 1].flatMap(sd => [.35, .65].map(f => sd * (DOOR_W / 2 + .12 + f * (CAR_L / 2 - DOOR_W / 2 - .12))))];
  seams.forEach(sx => {
    const a = R(vOfY(3.52)), b = R(vOfY(.86));
    x.fillStyle = 'rgba(70,76,86,.55)'; x.fillRect(X(sx), a, 2, b - a); x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(X(sx) + 2, a, 1, b - a);
    x.fillStyle = 'rgba(80,86,96,.5)'; for (let y = a; y < b; y += 18) { x.beginPath(); x.arc(X(sx) - 5, y, 1.6, 0, 7); x.fill(); x.beginPath(); x.arc(X(sx) + 7, y, 1.6, 0, 7); x.fill(); }
  });
  { const a = R(vOfY(.86)); x.fillStyle = 'rgba(80,86,96,.45)'; for (let px = 6; px < TW; px += 22) { x.beginPath(); x.arc(px, a + 4, 1.6, 0, 7); x.fill(); } }
  // lettering on the band between the decks
  [-1, 1].forEach(sd => {
    const cx = X(sd * (CAR_L / 2 - 1.15)), cy = (R(vOfY(2.27)) + R(vOfY(2.0))) / 2;
    if (logo) x.drawImage(logo, cx - 112, cy - 22, 44, 44);
    x.fillStyle = '#fff'; x.font = '900 34px Archivo, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('NUEVA', cx - 60, cy - 6);
    x.font = '700 15px Archivo, Arial, sans-serif'; x.fillText('SPIRIT LINE', cx - 58, cy + 18);
  });
  // grime: dirt rising from the bottom, streaks under the windows
  const gb = x.createLinearGradient(0, R(vOfY(1.5)), 0, R(vOfY(BASE))); gb.addColorStop(0, 'rgba(70,52,40,0)'); gb.addColorStop(1, 'rgba(70,52,40,.45)');
  x.fillStyle = gb; x.fillRect(0, R(vOfY(1.5)), TW, R(vOfY(BASE)) - R(vOfY(1.5)));
  windowSlots().forEach(w => { if (w.y > 2) return; for (let k = 0; k < 5; k++) { const sx = X(w.x - w.w / 2 + Math.random() * w.w), a = R(vOfY(w.y - w.h / 2 - .05)); const sg = x.createLinearGradient(0, a, 0, a + 120); sg.addColorStop(0, 'rgba(60,50,45,.12)'); sg.addColorStop(1, 'rgba(60,50,45,0)'); x.fillStyle = sg; x.fillRect(sx, a, 3 + Math.random() * 4, 120); } });
  noise(x, TW, TH, .035);
  // roughness (green) and metalness (blue): stainless is metallic, paint is not
  const mr = canvas(512, 256), y = mr.getContext('2d'), sx = 512 / TW, sy = 256 / TH;
  y.fillStyle = 'rgb(0,95,210)'; y.fillRect(0, 0, 512, 256);
  const paintBand = (y0, y1, rgb) => { y.fillStyle = rgb; [[R(vOfY(y1)), R(vOfY(y0))], [R(1 - vOfY(y0)), R(1 - vOfY(y1))]].forEach(([a, b]) => y.fillRect(0, a * sy, 512, (b - a) * sy)); };
  paintBand(BASE, .78, 'rgb(0,70,30)'); paintBand(.8, .84, 'rgb(0,90,20)'); paintBand(2.0, 2.27, 'rgb(0,120,60)'); paintBand(3.55, 3.63, 'rgb(0,70,30)');
  windowSlots().forEach(w => { const a = R(vOfY(w.y + w.h / 2 + .045)) * sy, b = R(vOfY(w.y - w.h / 2 - .045)) * sy; y.fillStyle = 'rgb(0,170,0)'; y.fillRect(X(w.x - w.w / 2 - .045) * sx, a, (X(w.w + .09) - X(0)) * sx, b - a); });
  const gr = y.createLinearGradient(0, R(vOfY(1.2)) * sy, 0, R(vOfY(BASE)) * sy); gr.addColorStop(0, 'rgba(0,95,0,0)'); gr.addColorStop(1, 'rgba(0,200,0,.5)');
  y.fillStyle = gr; y.fillRect(0, R(vOfY(1.2)) * sy, 512, (R(vOfY(BASE)) - R(vOfY(1.2))) * sy);
  return { map: tex(col), mr: tex(mr, false) };
}

// flush, dark-tinted window glass with rounded corners and a glimpse of the lit inside
export function windowTexture() {
  const c = canvas(256, 192), x = c.getContext('2d');
  x.clearRect(0, 0, 256, 192); x.save(); x.beginPath(); x.roundRect(0, 0, 256, 192, 22); x.clip();
  const g = x.createLinearGradient(0, 0, 0, 192); g.addColorStop(0, '#1b1f2a'); g.addColorStop(.6, '#2a2626'); g.addColorStop(1, '#3a2e28');
  x.fillStyle = g; x.fillRect(0, 0, 256, 192);
  x.fillStyle = 'rgba(255,226,180,.35)'; x.fillRect(0, 10, 256, 6);
  x.fillStyle = 'rgba(40,46,62,.95)'; [[14, 92], [92, 96], [170, 92]].forEach(([sx, sy]) => { x.beginPath(); x.roundRect(sx, sy, 70, 90, 12); x.fill(); });
  x.fillStyle = 'rgba(20,16,20,.55)'; x.beginPath(); x.arc(126, 92, 15, 0, 7); x.fill(); x.fillRect(110, 104, 32, 60);
  x.restore(); return tex(c);
}
// what you see through an open door: a warm vestibule with stairs, seats and grab poles
export function interiorTexture() {
  const c = canvas(256, 420), x = c.getContext('2d'), w = 256, h = 420;
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f3ece0'); g.addColorStop(.55, '#d9cdbb'); g.addColorStop(1, '#a89884');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = '#fffaf0'; x.fillRect(16, 6, w - 32, 12);
  const s = x.createLinearGradient(0, 120, 0, 210); s.addColorStop(0, '#8a7bc0'); s.addColorStop(1, '#ffb88a');
  x.fillStyle = '#2f2c30'; x.fillRect(66, 112, 124, 100); x.fillStyle = s; x.fillRect(72, 118, 112, 88);
  for (let i = 0; i < 5; i++) { x.fillStyle = '#8b8f97'; x.fillRect(0, 300 - i * 34, 74 - i * 11, 34); x.fillStyle = '#e8b923'; x.fillRect(0, 300 - i * 34, 74 - i * 11, 4); }
  for (let i = 0; i < 4; i++) { x.fillStyle = '#6a6e76'; x.fillRect(w - 66 + i * 12, 330 + i * 18, 66 - i * 12, 18); x.fillStyle = '#e8b923'; x.fillRect(w - 66 + i * 12, 330 + i * 18, 66 - i * 12, 3); }
  x.fillStyle = '#3b4252'; x.beginPath(); x.roundRect(98, 242, 62, 68, 8); x.fill(); x.fillStyle = '#4a5266'; x.fillRect(102, 248, 54, 9);
  x.fillStyle = '#c3c7ce'; x.fillRect(86, 20, 7, 380); x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(87, 20, 2, 380);
  x.fillStyle = '#56565c'; x.fillRect(0, 384, w, 36); x.fillStyle = '#e8b923'; x.fillRect(0, 404, w, 5);
  const v = x.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 260); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(50,30,15,.4)');
  x.fillStyle = v; x.fillRect(0, 0, w, h);
  return tex(c);
}

// the nose: glossy red paint, a wraparound windshield with a destination display, side cab windows,
// headlight housings, a white pinstripe and the logo; plus a glow map for the lights
export function paintNose(logo, ledDraw) {
  const TW = 1024, TH = 1024, U = s => s * TW, R = v => (1 - v) * TH;
  const c = canvas(TW, TH), x = c.getContext('2d'), e = canvas(TW, TH), ex = e.getContext('2d');
  const gr = x.createLinearGradient(0, 0, TW, 0); gr.addColorStop(0, '#c3262c'); gr.addColorStop(1, '#b51f25');
  x.fillStyle = gr; x.fillRect(0, 0, TW, TH);
  ex.fillStyle = '#000'; ex.fillRect(0, 0, TW, TH);
  // dark skirt along the bottom
  x.fillStyle = '#2a2c31'; x.fillRect(0, R(.05), TW, R(0) - R(.05)); x.fillRect(0, R(1), TW, R(.95) - R(1));
  // pinstripe continuing from the body
  const vp = vOfY(.82); x.fillStyle = '#f4f1ea'; x.fillRect(0, R(vp + .006), U(.8), 8); x.fillRect(0, R(1 - vp + .006), U(.8), 8);
  // windshield
  const ws = (s0, s1, v0, v1, r) => { x.beginPath(); x.roundRect(U(s0), R(v1), U(s1) - U(s0), R(v0) - R(v1), r); };
  x.fillStyle = '#16171c'; ws(.47, .87, .29, .71, 30); x.fill();
  const gl = x.createLinearGradient(U(.5), 0, U(.86), 0); gl.addColorStop(0, '#20283a'); gl.addColorStop(.6, '#0d1018'); gl.addColorStop(1, '#151a26');
  x.fillStyle = gl; ws(.49, .85, .31, .69, 22); x.fill();
  x.save(); ws(.49, .85, .31, .69, 22); x.clip(); x.fillStyle = 'rgba(255,220,200,.12)';
  x.beginPath(); x.moveTo(U(.6), R(.69)); x.lineTo(U(.66), R(.69)); x.lineTo(U(.56), R(.31)); x.lineTo(U(.5), R(.31)); x.fill(); x.restore();
  // destination display at the top of the windshield
  const led = canvas(640, 128); ledDraw(led.getContext('2d'));
  x.drawImage(led, U(.505), R(.6), U(.6) - U(.505), R(.4) - R(.6));
  ex.drawImage(led, U(.505), R(.6), U(.6) - U(.505), R(.4) - R(.6));
  // side cab windows
  x.fillStyle = '#121318'; ws(.2, .42, .16, .25, 14); x.fill(); ws(.2, .42, .75, .84, 14); x.fill();
  x.fillStyle = '#1d2230'; ws(.21, .41, .17, .24, 10); x.fill(); ws(.21, .41, .76, .83, 10); x.fill();
  // headlight housings and lights
  [[.135, .21], [.79, .865]].forEach(([v0, v1]) => {
    x.fillStyle = '#16171c'; ws(.86, .955, v0, v1, 16); x.fill();
    [.885, .925].forEach(s => { [x, ex].forEach((k, i) => { k.fillStyle = i ? '#fff6e2' : '#f2eee4'; k.beginPath(); k.ellipse(U(s), R((v0 + v1) / 2), 13, (R(v0) - R(v1)) * .32, 0, 0, 7); k.fill(); }); });
  });
  [[.24, .27], [.73, .76]].forEach(([v0, v1]) => { [x, ex].forEach(k => { k.fillStyle = '#ffd99a'; k.fillRect(U(.885), R(v1), 26, R(v0) - R(v1)); }); });
  if (logo) { x.save(); x.translate(U(.915), R(.5)); x.rotate(Math.PI / 2); x.drawImage(logo, -46, -46, 92, 92); x.restore(); }
  noise(x, TW, TH, .025);
  // windshield and display are glossy glass; paint gets a clear coat
  const mr = canvas(256, 256), y = mr.getContext('2d'); y.fillStyle = 'rgb(0,90,40)'; y.fillRect(0, 0, 256, 256);
  y.fillStyle = 'rgb(0,10,0)'; y.beginPath(); y.roundRect(U(.47) / 4, R(.71) / 4, (U(.87) - U(.47)) / 4, (R(.29) - R(.71)) / 4, 6); y.fill();
  return { map: tex(c), glow: tex(e), mr: tex(mr, false) };
}
