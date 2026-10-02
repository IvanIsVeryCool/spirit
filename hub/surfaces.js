import * as THREE from 'three';

// Procedural surfaces for the station: each is a tileable colour map with a matching normal map (from a height field)
// and, where it matters, a roughness map, so the ground catches the low sun instead of reading as flat paint.
// Made once while the page loads; all seeded, so they come out the same every visit.

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const smooth = t => t * t * (3 - 2 * t);

// tileable value noise, summed over octaves: [period in cells, weight]
function fbm(w, h, octaves) {
  const out = new Float32Array(w * h);
  for (const [p, wt] of octaves) {
    const px = p, py = Math.max(1, Math.round(p * h / w)), g = new Float32Array(px * py);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < h; y++) {
      const fy = y / h * py, y0 = Math.floor(fy), ty = smooth(fy - y0), r0 = (y0 % py) * px, r1 = ((y0 + 1) % py) * px;
      for (let x = 0; x < w; x++) {
        const fx = x / w * px, x0 = Math.floor(fx), tx = smooth(fx - x0), a = x0 % px, b = (x0 + 1) % px;
        const v = (g[r0 + a] * (1 - tx) + g[r0 + b] * tx) * (1 - ty) + (g[r1 + a] * (1 - tx) + g[r1 + b] * tx) * ty;
        out[y * w + x] += v * wt;
      }
    }
  }
  return out;
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function texFrom(w, h, fill, srgb) {
  const c = canvas(w, h), x = c.getContext('2d'), d = x.createImageData(w, h); fill(d.data); x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// a normal map from a height field (wrapping at the edges, so it tiles)
function normals(w, h, H, strength) {
  return texFrom(w, h, a => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = H[y * w + (x + 1) % w] - H[y * w + (x - 1 + w) % w], dy = H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x];
      let nx = -dx * strength, ny = dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y * w + x) * 4; a[o] = (nx * .5 + .5) * 255; a[o + 1] = (ny * .5 + .5) * 255; a[o + 2] = (nz * .5 + .5) * 255; a[o + 3] = 255;
    }
  }, false);
}
const rough = (w, h, R) => texFrom(w, h, a => { for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, R[i] * 255)); a[i * 4] = v; a[i * 4 + 1] = v; a[i * 4 + 2] = v; a[i * 4 + 3] = 255; } }, false);
const colour = (w, h, C) => texFrom(w, h, a => { for (let i = 0; i < w * h; i++) { a[i * 4] = C[i * 3]; a[i * 4 + 1] = C[i * 3 + 1]; a[i * 4 + 2] = C[i * 3 + 2]; a[i * 4 + 3] = 255; } }, true);
const set = (C, i, r, g, b, k) => { C[i * 3] = Math.min(255, r * k); C[i * 3 + 1] = Math.min(255, g * k); C[i * 3 + 2] = Math.min(255, b * k); };
// a wandering hairline (a crack) burnt into colour, height and roughness
function crack(w, h, C, H, len, x, y, k = .72) {
  let a = rnd() * 6.28;
  for (let s = 0; s < len; s++) {
    a += (rnd() - .5) * .7; x = (x + Math.cos(a) + w) % w; y = (y + Math.sin(a) + h) % h;
    const i = (Math.floor(y) * w + Math.floor(x)); C[i * 3] *= k; C[i * 3 + 1] *= k; C[i * 3 + 2] *= k; H[i] -= .25;
  }
}

/* platform paving: 1.2 m concrete slabs, 4 x 4 to a tile (4.8 m) */
export function pavers(n = 1024) {
  const S = n / 4, low = fbm(n, n, [[3, .6], [7, .4]]), mid = fbm(n, n, [[18, .5], [40, .3], [90, .2]]);
  const C = new Uint8ClampedArray(n * n * 3), H = new Float32Array(n * n), R = new Float32Array(n * n);
  const tone = Array.from({ length: 16 }, () => [1 + (rnd() - .5) * .13, (rnd() - .5) * .04]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, sx = x % S, sy = y % S, d = Math.min(sx, sy, S - 1 - sx, S - 1 - sy), [t, hue] = tone[Math.floor(y / S) * 4 + Math.floor(x / S)];
    let k = t * (1 - (low[i] - .5) * .32) * (1 + (mid[i] - .5) * .12), h = .6 + mid[i] * .08, r = .86 + (mid[i] - .5) * .2;
    const sp = rnd(); if (sp < .05) { k *= .82; h += .03; } else if (sp > .965) { k *= 1.12; h += .04; } // aggregate
    if (d < 2) { k *= .5; h = 0; r = 1; } else if (d < 7) { k *= .86 + d * .02; h *= .7 + d * .043; }            // joints, worn edges
    if (low[i] < .38) r -= (.38 - low[i]) * 1.4;                                                                     // foot-polished patches catch the light
    set(C, i, 150 * (1 + hue), 143, 133 * (1 - hue), k); H[i] = h; R[i] = r;
  }
  for (let g = 0; g < 70; g++) { // old gum, flattened into dark spots
    const cx = rnd() * n, cy = rnd() * n, rr = 2 + rnd() * 3.5;
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { if (x * x + y * y > rr * rr) continue; const i = (((Math.floor(cy) + y + n) % n) * n + (Math.floor(cx) + x + n) % n); C[i * 3] *= .62; C[i * 3 + 1] *= .62; C[i * 3 + 2] *= .64; R[i] = .55; H[i] += .02; }
  }
  for (let c = 0; c < 9; c++) crack(n, n, C, H, 80 + rnd() * 160, rnd() * n, rnd() * n);
  return { map: colour(n, n, C), normalMap: normals(n, n, H, 6), roughnessMap: rough(n, n, R), size: 4.8 };
}

/* plain cast concrete (the platform's edge, sleepers, planters) */
export function concrete(n = 256) {
  const f = fbm(n, n, [[4, .5], [12, .3], [40, .2]]), C = new Uint8ClampedArray(n * n * 3), H = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { const sp = rnd(), k = (1 - (f[i] - .5) * .3) * (sp < .06 ? .85 : sp > .97 ? 1.1 : 1); set(C, i, 158, 152, 143, k); H[i] = f[i] * .3 + (sp < .06 ? -.05 : 0); }
  for (let c = 0; c < 2; c++) crack(n, n, C, H, 60, rnd() * n, rnd() * n, .8);
  return { map: colour(n, n, C), normalMap: normals(n, n, H, 3), size: 1.5 };
}

/* track ballast: a bed of angular stones, 2 m to a tile */
export function ballast(n = 512) {
  const c = canvas(n, n), x = c.getContext('2d'), hc = canvas(n, n), hx = hc.getContext('2d');
  x.fillStyle = '#4a433d'; x.fillRect(0, 0, n, n); hx.fillStyle = '#000'; hx.fillRect(0, 0, n, n); hx.globalCompositeOperation = 'lighten';
  const cols = [[96, 89, 82], [112, 104, 95], [80, 75, 70], [126, 116, 104], [101, 92, 84], [88, 84, 80], [118, 108, 98]];
  for (let s = 0; s < 1700; s++) {
    const cx = rnd() * n, cy = rnd() * n, r = 5 + rnd() * 9, rot = rnd() * 6.28, sq = .65 + rnd() * .35, [R, G, B] = cols[Math.floor(rnd() * cols.length)], k = .8 + rnd() * .35;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      const px = cx + ox, py = cy + oy; if (px < -r || px > n + r || py < -r || py > n + r) continue;
      const stone = (ctx, fill) => { ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.scale(1, sq); ctx.beginPath(); for (let v = 0; v < 6; v++) { const a = v / 6 * 6.28, rr = r * (.8 + ((v * 37 + s) % 7) / 20); v ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fillStyle = fill(ctx); ctx.fill(); ctx.restore(); };
      stone(x, ctx => { const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, `rgb(${R * k * 1.18},${G * k * 1.18},${B * k * 1.18})`); g.addColorStop(1, `rgb(${R * k * .62},${G * k * .62},${B * k * .62})`); return g; });
      stone(hx, ctx => { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, '#fff'); g.addColorStop(1, '#111'); return g; });
    }
  }
  const hd = hx.getImageData(0, 0, n, n).data, H = new Float32Array(n * n); for (let i = 0; i < n * n; i++) H[i] = hd[i * 4] / 255;
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  return { map, normalMap: normals(n, n, H, 5), size: 2 };
}

/* the frontage road's asphalt: the full 4.2 m width by 8.4 m, with wheel tracks, cracks, patches and worn edge lines */
export function asphalt(w = 1024, h = 512) {
  const f = fbm(w, h, [[6, .5], [20, .3], [70, .2]]), C = new Uint8ClampedArray(w * h * 3), H = new Float32Array(w * h), R = new Float32Array(w * h);
  const tracks = [.083, .44, .56, .917];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = y / h, sp = rnd();
    let k = (1 - (f[i] - .5) * .35) * (sp < .1 ? 1.35 : sp < .16 ? .8 : 1), r = .9;
    const tr = Math.min(...tracks.map(t => Math.abs(v - t))); if (tr < .04) { k *= .86 + tr * 2; r = .72 + tr * 4; } // polished by tyres
    const edge = Math.min(Math.abs(v - .035), Math.abs(v - .965)); if (edge < .012 && f[i] > .32) { set(C, i, 214, 206, 186, .85 + f[i] * .2); H[i] = .3; R[i] = .8; continue; }
    set(C, i, 58, 58, 64, k); H[i] = sp < .1 ? .12 : 0; R[i] = r;
  }
  for (let p = 0; p < 3; p++) { const px = rnd() * w, py = (.2 + rnd() * .6) * h, pw = 60 + rnd() * 120, ph = 30 + rnd() * 60; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const i = ((Math.floor(py + y) % h) * w + Math.floor(px + x) % w); C[i * 3] *= .8; C[i * 3 + 1] *= .8; C[i * 3 + 2] *= .82; if (y < 2 || x < 2 || y > ph - 3 || x > pw - 3) { H[i] -= .2; C[i * 3] *= .7; C[i * 3 + 1] *= .7; C[i * 3 + 2] *= .7; } } }
  for (let c = 0; c < 14; c++) crack(w, h, C, H, 120 + rnd() * 220, rnd() * w, rnd() * h, .62);
  for (let o = 0; o < 5; o++) { const cx = rnd() * w, cy = (.3 + rnd() * .4) * h, rr = 14 + rnd() * 20; for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) { const d = Math.hypot(x, y * 1.6) / rr; if (d > 1) continue; const i = ((Math.floor(cy + y) + h) % h) * w + (Math.floor(cx + x) + w) % w; const k = 1 - .25 * (1 - d); C[i * 3] *= k; C[i * 3 + 1] *= k; C[i * 3 + 2] *= k; R[i] = Math.min(R[i], .45 + d * .4); } } // oil drips
  return { map: colour(w, h, C), normalMap: normals(w, h, H, 4), roughnessMap: rough(w, h, R), size: 8.4 };
}

/* rough grass and dirt for the ground beyond the station, 6 m to a tile */
export function grass(n = 512) {
  const big = fbm(n, n, [[3, .6], [8, .4]]), mid = fbm(n, n, [[24, .6], [64, .4]]), C = new Uint8ClampedArray(n * n * 3), H = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const dry = Math.max(0, Math.min(.6, (big[i] - .5) * 2)), sp = rnd(), k = (.8 + mid[i] * .3) * (sp < .2 ? .78 : sp > .9 ? 1.15 : 1);
    set(C, i, 48 + 34 * dry, 66 + 10 * dry, 38 + 10 * dry, k); H[i] = mid[i] * .5 + (sp < .2 ? -.1 : sp > .9 ? .1 : 0);
  }
  return { map: colour(n, n, C), normalMap: normals(n, n, H, 3), size: 6 };
}

/* galvanised chain-link fence: diamonds of wire on clear, 0.6 m to a tile */
export function chainlink(n = 256) {
  const c = canvas(n, n), x = c.getContext('2d'), d = 6, step = n / d;
  x.clearRect(0, 0, n, n); x.strokeStyle = '#b7bcc4'; x.lineWidth = 2.4; x.lineCap = 'round';
  for (let k = -d; k <= d * 2; k++) { x.beginPath(); x.moveTo(k * step, 0); x.lineTo(k * step + n, n); x.stroke(); x.beginPath(); x.moveTo(k * step, 0); x.lineTo(k * step - n, n); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return { map: t, size: .6 };
}

/* the yellow tactile strip at the platform edge: raised domes, 0.6 m to a tile */
export function tactile(n = 256) {
  const C = new Uint8ClampedArray(n * n * 3), H = new Float32Array(n * n), f = fbm(n, n, [[8, .6], [30, .4]]), g = n / 6, rr = g * .3;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, dx = (x % g) - g / 2, dy = (y % g) - g / 2, d = Math.hypot(dx, dy) / rr, dome = d < 1 ? Math.sqrt(1 - d * d) : 0;
    const k = (1 - (f[i] - .5) * .25) * (dome > 0 ? .92 + dome * .12 : 1) * (d > 1 && d < 1.25 ? .8 : 1);
    set(C, i, 232, 185, 35, k); H[i] = dome * .8 + f[i] * .05;
  }
  return { map: colour(n, n, C), normalMap: normals(n, n, H, 5), size: .6 };
}

// a copy of a surface's textures with the repeat for a w x h metre face
export function tiled(surf, w, h) {
  const out = {};
  ['map', 'normalMap', 'roughnessMap'].forEach(k => { if (!surf[k]) return; const t = surf[k].clone(); t.repeat.set(w / surf.size, h / surf.size); t.needsUpdate = true; out[k] = t; });
  return out;
}
