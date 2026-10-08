import * as THREE from 'three';
import { mergeGeometries } from '/vendor/jsm/utils/BufferGeometryUtils.js';
import { softBox, toyMaterial } from './toy.js';
import { Person, PEOPLE, library } from './people.js';
import { cityKits } from './city.js';
import { mergeStatic } from './scenery.js';

// The places the train can take you (the driver's desk in the front cab, station.js): the golden-hour station it
// starts at, and three more, each built from blocks in the Mini Characters' style (softBox and toyMaterial, like the
// cassette player and the plane), with their own sky, light, weather and the clothes people wear there.
// Everything behind the fence is swapped; the platform, the train and the people stay (dressed for the place).

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, reseed = n => { seed = n; };
const pick = a => a[Math.floor(rnd() * a.length)];

export const THEMES = [
  { id: 'home', name: 'Golden Hour', place: 'Nueva', swatch: '#ff9d5c',
    look: { sky: ['#1c2a66', '#7468ab', '#ffb07a', '#ffd08e'], sunDir: [-.36, .15, -.92], sun: [0xffc690, 1.85, [-32, 11, 16]], hemi: [0x9fb2ff, 0x5a3b2c, .72], fill: [0x8d9cff, .5], fog: [null, 45, 230], exposure: .84, ballast: 0xffffff, paving: 0xffffff, rock: 0x7a6650, top: 0x4f6a3e, motes: 0xffd9a8 } },
  { id: 'snow', name: 'Snow Peaks', place: 'Frostfall', swatch: '#8fc3f0',
    look: { sky: ['#2b3f74', '#8ea6d8', '#f3c3c6', '#ffe2cf'], sunDir: [-.42, .11, -.9], sun: [0xffd8c4, 1.45, [-32, 13, 16]], hemi: [0xc4d6ff, 0x8e9cba, .95], fill: [0x9fb4ff, .55], fog: [0xc9d2ea, 35, 210], exposure: .86, ballast: 0xdfe6f2, paving: 0xe3e9f2, rock: 0x6e7c92, top: 0xf2f5fa, motes: null } },
  { id: 'desert', name: 'Red Canyon', place: 'Red Rock', swatch: '#e0773a',
    look: { sky: ['#2a1d4c', '#a35277', '#ff9550', '#ffc672'], sunDir: [-.5, .09, -.86], sun: [0xffb070, 2.05, [-32, 10, 16]], hemi: [0xffc9a6, 0x8a4a2a, .74], fill: [0xb08cff, .45], fog: [0xe39a74, 55, 270], exposure: .84, ballast: 0xe0b48a, paving: 0xf3dcc0, rock: 0xb4532f, top: 0xd98a52, motes: 0xffc98a } },
  { id: 'coast', name: 'Seaside', place: 'Seashell Bay', swatch: '#3fbfc0',
    look: { sky: ['#2a5fb4', '#7dbde8', '#ffdcb4', '#fff0cc'], sunDir: [-.42, .2, -.88], sun: [0xffe4b8, 1.95, [-32, 15, 16]], hemi: [0xc6e4ff, 0x9c8c6c, .8], fill: [0xa8c8ff, .5], fog: [0xc2daea, 95, 400], exposure: .78, ballast: 0xebe0cc, paving: 0xf7f1e7, rock: 0x7c8088, top: 0x6f9a52, motes: null } }
];
export const theme = id => THEMES.find(t => t.id === id) || THEMES[0];

/* ---------- making things out of blocks ---------- */
// Parts painted from one small palette and merged into one mesh (one draw call). at() places what follows.
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
class Kit {
  constructor(cols, glow = 0, share = null) { const t = share || toyMaterial(cols, glow); this.mat = t.mat; this.paint = t.paint; this.cols = cols; this.parts = []; this.base = new THREE.Matrix4(); } // (share: another kit's material and palette)
  at(x = 0, y = 0, z = 0, ry = 0, s = 1) { this.base.compose(V(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), typeof s === 'number' ? V(s, s, s) : s); return this; }
  add(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    if (this.cols.indexOf(hex) < 0) console.warn('colour not in palette', hex);
    if (rx) geo.rotateX(rx); if (ry) geo.rotateY(ry); if (rz) geo.rotateZ(rz);
    geo.translate(x, y, z); geo.applyMatrix4(this.base); this.paint(geo, hex); this.parts.push(geo); return geo;
  }
  // a bevelled block (the bevel follows its smallest side unless given)
  box(w, h, d, hex, x, y, z, rx, ry, rz, r) { return this.add(softBox(w, h, d, r ?? Math.min(.25, Math.min(w, h, d) * .22)), hex, x, y, z, rx, ry, rz); }
  cyl(rt, rb, h, seg, hex, x, y, z, rx, ry, rz) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), hex, x, y, z, rx, ry, rz); }
  geometry() {
    const mixed = this.parts.some(g => !g.index), list = mixed ? this.parts.map(g => g.index ? g.toNonIndexed() : g) : this.parts;
    const g = mergeGeometries(list); this.parts = []; return g;
  }
  mesh() { const m = new THREE.Mesh(this.geometry(), this.mat); m.userData.noShadow = true; return m; }
}
// a glowing palette (lit windows, string lights), drawn unlit
const glowKit = cols => { const k = new Kit(cols); k.mat = new THREE.MeshBasicMaterial({ map: k.mat.map }); k.mat.toneMapped = false; k.mat.color.setScalar(1.6); return k; };

// a far range of hills or mountains, cut in flat-coloured bands from the bottom up (bands: [[edge(x) -> y, colour], ...];
// the last band runs to the top), unlit like the golden-hour hills, faceted a little
function range(z, x0, x1, top, bands, step = 4) {
  const P = [], C = [], c = new THREE.Color();
  for (let x = x0; x < x1; x += step) {
    const xb = x + step, ta = top(x), tb = top(xb); let la = -30, lb = -30;
    bands.forEach(([edge, hex], k) => {
      const last = k === bands.length - 1;
      const ha = last ? ta : Math.min(ta, Math.max(la, edge(x))), hb = last ? tb : Math.min(tb, Math.max(lb, edge(xb)));
      if (ha > la + 1e-3 || hb > lb + 1e-3) {
        c.set(hex).multiplyScalar(.95 + rnd() * .07);
        P.push(x, la, 0, xb, lb, 0, xb, hb, 0, x, la, 0, xb, hb, 0, x, ha, 0);
        for (let i = 0; i < 6; i++) C.push(c.r, c.g, c.b);
      }
      la = Math.max(la, ha); lb = Math.max(lb, hb);
    });
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); m.position.z = z; m.userData.noShadow = true; return m;
}
// pointed peaks (mountains) or flat-topped ones (mesas) along a range
const peaks = (n, x0, x1, hMin, hMax, wMin, wMax) => Array.from({ length: n }, () => ({ x: x0 + rnd() * (x1 - x0), h: hMin + rnd() * (hMax - hMin), w: wMin + rnd() * (wMax - wMin), f: .2 + rnd() * .5 }));
const pointed = (list, base) => x => Math.max(base + Math.sin(x * .05) * 1.5, ...list.map(p => p.h * (1 - Math.abs(x - p.x) / p.w) + Math.sin(x * .7 + p.x) * .5 * p.f));
const flat = (list, base) => x => Math.max(base + Math.sin(x * .04) * 1.2 + Math.sin(x * .13) * .6, ...list.map(p => p.h * Math.min(1, Math.max(0, (p.w - Math.abs(x - p.x)) / (p.w * .18)))));

const cloudTex = (() => { let t = null; return () => t || (t = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  for (let k = 0; k < 14; k++) { const cx = 40 + rnd() * 176, cy = 60 + (rnd() - .5) * 34, r = 18 + rnd() * 30, gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; })()); })();
function clouds(g, list, cols, opacity = .75) {
  const out = [];
  list.forEach(([x, y, z, k, sy = 1], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(140 * k, 44 * k * sy), new THREE.MeshBasicMaterial({ map: cloudTex(), color: cols[i % cols.length], transparent: true, depthWrite: false, fog: false, opacity }));
    m.position.set(x, y, z); m.userData.noShadow = true; g.add(m); out.push({ m, x0: x, v: .3 + rnd() * .5 });
  });
  return out;
}
const driftClouds = (list, t) => list.forEach(c => { c.m.position.x = c.x0 + ((t * c.v + 300) % 600) - 300; });

// the ground behind the fence, from a painted tile
function ground(g, paint, size = 512, tile = 12, z0 = -8.4, depth = 204, rough = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(600 / tile, depth / tile); t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(600, depth), new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: 0 }));
  m.rotation.x = -Math.PI / 2; m.position.set(0, -.06, z0 - depth / 2); m.userData.noShadow = true; g.add(m); return m;
}
const speckle = (x, s, n, cols, rMin, rMax) => { for (let i = 0; i < n; i++) { x.fillStyle = pick(cols); x.beginPath(); x.arc(rnd() * s, rnd() * s, rMin + rnd() * (rMax - rMin), 0, 7); x.fill(); } };

// birds (gulls, vultures): the platform's flock shape, instanced
function flock(n, color, scale) {
  const bird = new THREE.BufferGeometry();
  bird.setAttribute('position', new THREE.Float32BufferAttribute([-.9, .25, 0, 0, 0, 0, 0, 0, .25, 0, 0, 0, .9, .25, 0, 0, 0, .25], 3)); bird.computeVertexNormals();
  const m = new THREE.InstancedMesh(bird, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), n); m.frustumCulled = false; m.userData.noShadow = true;
  return { mesh: m, scale, list: Array.from({ length: n }, () => ({ r: 6 + rnd() * 14, h: rnd() * 6, ph: rnd() * 6.3, v: .2 + rnd() * .2, flap: rnd() * 6 })) };
}
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function circleFlock(F, cx, cy, cz, t, glide = .7) {
  F.list.forEach((b, i) => {
    const a = b.ph + t * b.v, flap = Math.sin(t * 6 + b.flap) > glide ? .35 + .65 * Math.abs(Math.sin(t * 9 + b.flap)) : .55;
    _q.setFromAxisAngle(_up, -a); _m.compose(_p.set(cx + Math.cos(a) * b.r, cy + b.h + Math.sin(t * .5 + i) * .8, cz + Math.sin(a) * b.r * .6), _q, _s.set(F.scale, F.scale * flap, F.scale)); F.mesh.setMatrixAt(i, _m);
  });
  F.mesh.instanceMatrix.needsUpdate = true;
}

// falling things (snow), in a box that follows the camera
function weather(n, size, color, box, fall) {
  const p = new Float32Array(n * 3), sp = new Float32Array(n);
  for (let i = 0; i < n; i++) { p[i * 3] = (rnd() - .5) * box[0]; p[i * 3 + 1] = rnd() * box[1]; p[i * 3 + 2] = (rnd() - .5) * box[2]; sp[i] = .6 + rnd() * .8; }
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: .95 }));
  pts.frustumCulled = false; pts.userData.noShadow = true;
  return {
    pts, update(t, dt, cam) {
      pts.position.set(cam.x, 0, cam.z - box[2] * .3);
      const a = g.attributes.position.array;
      for (let i = 0; i < n; i++) {
        a[i * 3 + 1] -= fall * sp[i] * dt; a[i * 3] += Math.sin(t * .8 + i) * .25 * dt + .3 * dt; a[i * 3 + 2] += Math.cos(t * .6 + i * 1.7) * .15 * dt;
        if (a[i * 3 + 1] < 0) a[i * 3 + 1] += box[1]; if (a[i * 3] > box[0] / 2) a[i * 3] -= box[0];
      }
      g.attributes.position.needsUpdate = true;
    }
  };
}
// sprites of smoke: puffs rise from each chimney, grow and fade (by shrinking) as they go
function smoke(list, color) {
  const n = list.length * 6, mesh = new THREE.InstancedMesh(softBox(1, 1, 1, .3), new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: .55, depthWrite: false }), n);
  mesh.frustumCulled = false; mesh.userData.noShadow = true;
  return {
    mesh, update(t) {
      let k = 0;
      list.forEach((c, j) => { for (let i = 0; i < 6; i++, k++) {
        const u = ((t * .16 + i / 6 + j * .37) % 1), s = Math.sin(Math.PI * u) * (.5 + u * .9);
        _q.setFromEuler(_e.set(u * 2, u * 3 + j, 0)); _m.compose(_p.set(c.x + u * 2.2 + Math.sin(t + i) * .2, c.y + u * 5, c.z + u * .8), _q, _s.set(s, s, s)); mesh.setMatrixAt(k, _m);
      } });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
}

// spots on top of the tunnel's hill (its three steps), for each place's trees or cactus
const HILL = [[-84.4, -205, -14, 36, 10.6], [-90.6, -205, -10, 28, 15.6], [-101.6, -205, -4, 18, 19.6]];
export function hillSpots(n) {
  const out = [];
  for (let tries = 0; out.length < n && tries < n * 20; tries++) {
    const x = -88 - rnd() * 110, z = -12 + rnd() * 46; let y = -1;
    HILL.forEach(([x0, x1, z0, z1, top]) => { if (x < x0 - 1.5 && x > x1 && z > z0 + 1.5 && z < z1 - 1.5) y = Math.max(y, top); });
    if (y > 0) out.push(V(x, y - .1, z));
  }
  return out;
}

/* ---------- the tunnel the train runs through between places (station.js puts it past the end of the platform) ---------- */
// the hill around it is painted per place (setLook), so it suits each one
export function tunnel(st) {
  const g = new THREE.Group(), X = -84, Z0 = -6.9, Z1 = 2.3, TOP = 7.2, END = -205;
  const rock = new THREE.MeshStandardMaterial({ color: 0x7a6650, roughness: .95, metalness: 0, envMapIntensity: .3 });
  const top = new THREE.MeshStandardMaterial({ color: 0x4f6a3e, roughness: .95, metalness: 0, envMapIntensity: .3 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8f8a84, roughness: .9, metalness: 0, envMapIntensity: .3 });
  const blk = (mat, x0, x1, y0, y1, z0, z1, r = .5) => { const m = new THREE.Mesh(softBox(x1 - x0, y1 - y0, z1 - z0, Math.min(r, (y1 - y0) * .3)), mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.userData.noShadow = true; g.add(m); return m; };
  // the hill, built round the bore (stepped, with a cap of grass, snow or sand on each step)
  blk(rock, END, X, -1, 10, Z1, 36); blk(rock, END, X, -1, 10, -14, Z0); blk(rock, END, X, TOP, 10, Z0 - .5, Z1 + .5);
  blk(top, END, X + .4, 9.8, 10.6, -14.2, 36.2);
  blk(rock, END, X - 7, 10.4, 15, -10, 28); blk(top, END, X - 6.6, 14.8, 15.6, -10.2, 28.2);
  blk(rock, END, X - 18, 15.4, 19, -4, 18); blk(top, END, X - 17.6, 18.8, 19.6, -4.2, 18.2);
  // the portal: stone pillars and lintel, a keystone, and a plaque
  blk(stone, X - .2, X + .7, -.5, TOP, Z1, Z1 + 1.1, .15); blk(stone, X - .2, X + .7, -.5, TOP, Z0 - 1.1, Z0, .15);
  blk(stone, X - .2, X + .8, TOP, TOP + 1.2, Z0 - 1.4, Z1 + 1.4, .2); blk(stone, X + .2, X + .95, TOP + .2, TOP + 1.5, -2.9, -1.7, .12);
  const plaque = new THREE.Mesh(softBox(.08, .7, 2.6, .03), new THREE.MeshStandardMaterial({ color: 0xc9272c, roughness: .7 })); plaque.position.set(X + .85, TOP + .62, -4.6); g.add(plaque);
  // the bore: dark walls, facing in, with lamps along both sides, and the light at the far end
  const bore = new THREE.Mesh(new THREE.BoxGeometry(X - END, TOP + .35, Z1 - Z0 - .12), new THREE.MeshStandardMaterial({ color: 0x2c2926, roughness: 1, metalness: 0, side: THREE.BackSide, envMapIntensity: .05, fog: false })); // (just inside the hill's own faces, not on them)
  bore.position.set((X + END) / 2, (TOP + .35) / 2 - .4, (Z0 + Z1) / 2); bore.userData.noShadow = true; g.add(bore);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.45, 1), fog: false }); lampMat.toneMapped = false;
  const n = Math.floor((X - END) / 9), lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(.5, .14, .14), lampMat, n * 2);
  for (let i = 0; i < n; i++) [Z0 + .16, Z1 - .16].forEach((z, k) => { _m.makeTranslation(X - 5 - i * 9, 3.6, z); lamps.setMatrixAt(i * 2 + k, _m); });
  lamps.userData.noShadow = true; g.add(lamps);
  const endMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.7), fog: false }); endMat.toneMapped = false;
  const end = new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0, TOP), endMat); end.rotation.y = Math.PI / 2; end.position.set(END + .6, TOP / 2 - .2, (Z0 + Z1) / 2); g.add(end);
  // rocks bulging from its face and along its edges, so it reads as a hillside rather than a wall
  reseed(91);
  const rocks = new THREE.InstancedMesh(softBox(1, 1, 1, .22), rock, 70);
  for (let i = 0; i < 70; i++) {
    const face = i < 44, z = face ? (rnd() < .25 ? -14 + rnd() * 5.5 : 4 + rnd() * 32) : -14 + rnd() * 50, s = 1.4 + rnd() * 2.6;
    const x = face ? X + .2 - rnd() * .4 : X - 3 - rnd() * 100, y = face ? rnd() * 10 : 10.4, w = s * (.7 + rnd() * .6);
    _m.compose(_p.set(x, y, face ? z : (rnd() < .5 ? -13.8 : 35.8)), _q.setFromEuler(_e.set(rnd() * .3, rnd() * .6, rnd() * .3)), _s.set(w, s * (.5 + rnd() * .4), s)); rocks.setMatrixAt(i, _m);
  }
  rocks.userData.noShadow = true; g.add(rocks);
  // at home, the hill's trees (the Nature Kit's; the other places dress it themselves)
  const home = new THREE.Group(), KIT = cityKits();
  if (KIT && KIT.nature) {
    hillSpots(34).forEach(v => { const name = pick(['tree_default', 'tree_oak', 'tree_fat', 'tree_tall', 'tree_detailed']), o = KIT.nature[name].clone(), h = 5 + rnd() * 4; o.position.copy(v); o.rotation.y = rnd() * 6.3; o.scale.setScalar(h / KIT.nature[name].userData.size.y); home.add(o); });
    home.traverse(o => { if (o.isMesh) o.userData.noShadow = true; }); mergeStatic(home);
  }
  g.userData.keep = true; g.traverse(o => { o.userData.keep = true; });
  return { group: g, home, X, END, mats: { rock, top } };
}

/* ---------- the clothes people wear in each place ---------- */
// fitted to each character's head (the hair included) and torso, in their bones' own units; drawn with the people's shading
const ACC = ['#c9272c', '#2a4f8a', '#2f6b4a', '#e0a92e', '#f1ece2', '#6b3a2a', '#1d1f26', '#d8b27a', '#8a6a4a', '#f4f7fb', '#e86aa0', '#f5d76e', '#ffffff', '#3fae9a', '#4a4f5a', '#b5482a'];
let ACCK = null, FIT = null;
function fit() {
  if (FIT) return FIT;
  const L = library(); FIT = L.models.map(m => {
    const mesh = m.getObjectByName('person'), sk = mesh.skeleton, g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
    const j = sk.bones.findIndex(b => b.name === 'head'), inv = sk.boneInverses[j], bb = new THREE.Box3(), v = V();
    for (let k = 0; k < pos.count; k++) if (si.getX(k) === j && sw.getX(k) > .5) bb.expandByPoint(v.fromBufferAttribute(pos, k).applyMatrix4(inv));
    return bb;
  });
  return FIT;
}
function outfit(p, id, k, role) {
  const ACCK_ = ACCK || (ACCK = new Kit(ACC)), h = new Kit(ACC, 0, ACCK_), b = new Kit(ACC, 0, ACCK_);
  const bb = fit()[p.kind % fit().length], top = bb.max.y, wx = bb.max.x - bb.min.x, zc = (bb.max.z + bb.min.z) / 2, dz = bb.max.z - bb.min.z;
  reseed(1000 + k * 37); rnd();
  const hat = role !== 'cop' && role !== 'listener', [RED, BLUE, GREEN, GOLD, CREAM, BROWN, BLACK, TAN, WOOD, SNOW, PINK, YELLOW, WHITE, TEAL, GREY, RUST] = ACC;
  if (id === 'snow') {
    // a knitted scarf, its ends hanging down the front (striped), and a beanie with a fold and a pompom (or earmuffs)
    const sc = pick([RED, BLUE, GREEN, GOLD, TEAL, PINK]), st = pick([CREAM, WHITE, GOLD]);
    b.box(.36, .085, .33, sc, 0, .16, .02); b.box(.09, .2, .05, sc, .08, .06, .17, .12); b.box(.092, .03, .052, st, .08, .03, .171, .12); b.box(.092, .03, .052, st, .08, .1, .171, .12);
    if (hat) {
      if (rnd() < .78) {
        const bc = pick([RED, BLUE, GREEN, GOLD, CREAM, GREY, TEAL]), y0 = .2, yt = Math.max(top + .1, .46); // (pulled down to the brows, over the hair)
        h.box(wx + .05, yt - y0, dz + .05, bc, 0, (y0 + yt) / 2, zc, 0, 0, 0, .1);
        h.box(wx + .09, .08, dz + .09, bc === CREAM ? RED : CREAM, 0, y0 + .04, zc, 0, 0, 0, .03);
        h.box(.15, .14, .15, pick([WHITE, CREAM, RED]), 0, yt + .055, zc, 0, 0, 0, .06);
      } else { // earmuffs on a band over the top
        h.box(.05, .03, .06, BLACK, 0, top + .015, zc); h.box(wx * .9, .03, .05, BLACK, 0, top + .01, zc);
        [-1, 1].forEach(s => h.box(.08, .14, .14, pick([PINK, WHITE, RED]), s * (wx / 2 + .03), .17, zc, 0, 0, 0, .05));
      }
    }
  } else if (id === 'desert') {
    // a wide-brimmed hat (most), a bandana knotted at the neck (some)
    if (hat && rnd() < .8) {
      const hc = pick([TAN, WOOD, BROWN, CREAM, BLACK]), y0 = Math.max(.22, top - .1);
      h.cyl(wx * .78, wx * .78, .025, 12, hc, 0, y0, zc); h.box(wx * .7, .16, dz * .62, hc, 0, y0 + .08, zc, 0, 0, 0, .05);
      h.box(wx * .72, .035, dz * .64, hc === BLACK ? GOLD : BROWN, 0, y0 + .03, zc, 0, 0, 0, .012);
    }
    if (rnd() < .55 || !hat) { const bc = pick([RED, BLUE, RUST]); b.box(.34, .07, .32, bc, 0, .16, .02); b.add(new THREE.ConeGeometry(.1, .14, 3), bc, 0, .08, .16, 0, Math.PI, Math.PI); }
  } else if (id === 'coast') {
    // sunglasses (most), a straw hat (some) or a flower garland
    if (rnd() < .78) {
      const fz = .172, gy = .14; h.box(wx * .82, .022, .02, BLACK, 0, gy + .035, fz, 0, 0, 0, .006);
      [-1, 1].forEach(s => { h.box(.14, .075, .022, pick([BLACK, BLACK, TEAL, PINK]), s * .09, gy, fz + .004, 0, 0, 0, .02); h.box(.02, .02, .2, BLACK, s * (wx / 2 - .005), gy + .035, fz - .1, 0, 0, 0, .006); });
    }
    if (hat && rnd() < .45) {
      const y0 = Math.max(.22, top - .1); h.cyl(wx * .72, wx * .72, .022, 14, YELLOW, 0, y0, zc); h.cyl(wx * .36, wx * .4, .14, 12, YELLOW, 0, y0 + .08, zc); h.cyl(wx * .41, wx * .41, .04, 12, pick([RED, BLUE, TEAL, PINK]), 0, y0 + .03, zc);
    } else if (rnd() < .3) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.box(.06, .05, .06, pick([PINK, YELLOW, WHITE, RED]), Math.sin(a) * .17, .15 + Math.cos(a) * .02, .02 + Math.cos(a) * .16, 0, 0, 0, .02); } }
  }
  const out = [];
  [[h, p.bones.head], [b, p.bones.torso]].forEach(([kit, bone]) => {
    if (!kit.parts.length) return;
    const m = new THREE.Mesh(kit.geometry(), ACCK_.mat); m.userData.keep = true; m.castShadow = false; m.receiveShadow = true; bone.add(m); out.push(m);
  });
  return out;
}
const inScene = (o, scene) => { while (o) { if (o === scene) return true; o = o.parent; } return false; };
export function dress(st, id) {
  PEOPLE.forEach((p, k) => {
    if (!inScene(p.root, st.scene)) return; // (the passengers' posed copies aren't)
    const map = p.dress || (p.dress = {}), role = st.cop && st.cop.p === p ? 'cop' : st.listener === p ? 'listener' : '';
    if (id !== 'home' && !map[id]) map[id] = outfit(p, id, k, role);
    Object.entries(map).forEach(([key, list]) => list.forEach(m => { m.visible = key === id; }));
  });
}

/* ---------- Snow Peaks: an alpine village at dusk ---------- */
function snow(st) {
  reseed(301);
  const g = new THREE.Group(), F = st.FLOOR, front = st.front, P = st.P, mob = st.mobile, upd = [];
  const SNOW = '#f4f7fb', SHADE = '#dbe4f0', PINE = '#2f5a44', PINE2 = '#24473a', WOOD = '#8a5e3f', WOOD2 = '#6b4a34', DARK = '#3a2a22', ROOF = '#9a3a32', STONE = '#6f7884', COAL = '#1d1f26', CARROT = '#e8792a', RED = '#c9272c', BLUE = '#2a5aa0', GOLD = '#e8c94a', PLASTER = '#efe4cc', ICE = '#cfe6f5', GREEN = '#2f7a4a';
  const K = new Kit([SNOW, SHADE, PINE, PINE2, WOOD, WOOD2, DARK, ROOF, STONE, COAL, CARROT, RED, BLUE, GOLD, PLASTER, ICE, GREEN]);
  const L = glowKit(['#ffcf80', '#ff6a5a', '#7fd0ff', '#9cff9a', '#ffe9a8']), [WARM, LRED, LBLUE, LGREEN, LGOLD] = L.cols;
  // the ground: fresh snow, a blue shade in the dips, a few sparkles
  ground(g, (x, s) => { x.fillStyle = '#eef2f8'; x.fillRect(0, 0, s, s); speckle(x, s, 900, ['rgba(170,190,220,.18)', 'rgba(200,215,235,.3)'], 2, 14); speckle(x, s, 400, ['rgba(255,255,255,.9)'], .6, 1.4); }, 512, 10, -8.4, 204, .8);
  // mountains: snow above the snow line, blue rock below, paler with distance
  const snowLine = (b, a) => x => b + Math.sin(x * .07) * a + Math.sin(x * .19) * a * .5;
  g.add(range(-250, -520, 520, pointed(peaks(14, -520, 520, 40, 78, 45, 90), 22), [[snowLine(46, 4), '#a6b2cc'], [() => 1e9, '#e7ecf6']]));
  g.add(range(-170, -480, 480, pointed(peaks(16, -480, 480, 28, 52, 30, 60), 12), [[snowLine(30, 3), '#7d8cad'], [() => 1e9, '#f0f3f9']]));
  g.add(range(-95, -420, 420, pointed(peaks(18, -420, 420, 12, 24, 18, 34), 4), [[snowLine(13, 2), '#56637f'], [() => 1e9, '#f6f8fc']]));
  const cl = clouds(g, [[-140, 70, -300, 1], [-20, 84, -330, .8], [100, 66, -290, 1.1], [220, 78, -320, .9], [30, 52, -260, .7]], [0xf6d6dc, 0xdfe6f6], .7);
  // drifts banked against the fence
  const drift = new THREE.InstancedMesh(softBox(1, 1, 1, .35), new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: .85 }), 90);
  for (let i = 0; i < 90; i++) { const len = 2 + rnd() * 4; _m.compose(_p.set(-200 + i * 4.5 + rnd() * 2, .1, -8.9 - rnd() * .5), _q.setFromEuler(_e.set(0, (rnd() - .5) * .2, 0)), _s.set(len, .3 + rnd() * .5, 1 + rnd() * .8)); drift.setMatrixAt(i, _m); }
  drift.userData.noShadow = true; g.add(drift);
  // the village: chalets with snow on their roofs, lit windows with shutters, balconies, smoking chimneys, icicles,
  // and strings of lights along the eaves
  const chimneys = [], lots = [], bulbs = [];
  const chalet = (x, z, ry, s) => {
    lots.push([x, z, 7 * s]);
    const w = 7, D = 6, wh = 3.4, wt = .9 + wh, rise = 2.7, over = .6, half = w / 2 + over, ang = Math.atan2(rise, half), slab = Math.hypot(half, rise);
    K.at(x, 0, z, ry, s); L.at(x, 0, z, ry, s);
    K.box(w + .3, .9, D + .3, STONE, 0, .45, 0); K.box(w, wh, D, WOOD, 0, .9 + wh / 2, 0);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => K.box(.3, wh, .3, WOOD2, a * (w / 2 - .1), .9 + wh / 2, b * (D / 2 - .1)));
    K.box(w + .1, .2, D + .1, WOOD2, 0, .9 + wh * .52, 0); // the band between the storeys
    // the gable (a triangular prism), the roof slabs and the snow on them
    const gable = new THREE.CylinderGeometry(w / Math.sqrt(3), w / Math.sqrt(3), D, 3); gable.rotateX(-Math.PI / 2); gable.scale(1, rise / (1.5 * w / Math.sqrt(3)), 1);
    K.add(gable, PLASTER, 0, wt + rise * (.5 / 1.5), 0);
    [-1, 1].forEach(sd => {
      const cx = sd * half / 2, cy = wt + rise / 2, n = V(-sd * Math.sin(ang), Math.cos(ang), 0);
      K.box(slab + .1, .24, D + 1.3, ROOF, cx, cy, 0, 0, 0, -sd * ang, .06);
      K.box(slab, .2, D + 1.1, SNOW, cx + n.x * .2, cy + n.y * .2, 0, 0, 0, -sd * ang, .08);
      // icicles along the eave
      for (let zz = -D / 2 - .4; zz <= D / 2 + .4; zz += .45) { const l = .25 + rnd() * .5; K.add(new THREE.ConeGeometry(.06, l, 5), ICE, sd * (half - .1), wt - .1 - l / 2, zz, Math.PI); }
      // lights along the front edge of each slope
      for (let k = 1; k < 9; k++) { const u = k / 9; bulbs.push(V(sd * half * (1 - u), wt + rise * u + .12, D / 2 + .7).applyMatrix4(K.base)); }
    });
    // windows: lit, in dark frames, with red shutters; a door with a lamp; a balcony on the upper floor
    const win = (wx, wy, wz, rot) => { L.box(.9, 1, .08, rnd() < .8 ? WARM : LGOLD, wx, wy, wz, 0, rot, 0, .02); K.box(1.05, 1.15, .06, DARK, wx, wy, wz - (rot ? 0 : .01), 0, rot, 0, .02);
      [-1, 1].forEach(sd => K.box(.38, 1.05, .08, RED, wx + (rot ? 0 : sd * .7), wy, wz + (rot ? sd * .7 : .02), 0, rot, 0, .02)); };
    [-1.8, 1.8].forEach(wx => { win(wx, 2.1, D / 2 + .04, 0); win(wx, 3.7, D / 2 + .04, 0); });
    win(0, wt + .9, D / 2 + .04, 0); [-1.4, 1.4].forEach(wz => [2.1, 3.7].forEach(wy => win(w / 2 + .04, wy, wz, Math.PI / 2)));
    K.box(1.2, 2, .15, DARK, 0, 1.9, D / 2 + .05); L.box(.2, .3, .2, WARM, .95, 2.9, D / 2 + .2);
    K.box(w * .66, .14, 1, WOOD2, 0, 3.05, D / 2 + .5);
    for (let k = 0; k <= 10; k++) K.box(.08, .8, .08, WOOD2, -w * .33 + k * w * .066, 3.5, D / 2 + .96);
    K.box(w * .68, .1, .12, WOOD2, 0, 3.9, D / 2 + .96); K.box(w * .68, .1, .2, SNOW, 0, 4.0, D / 2 + .96);
    // the chimney, its snowy cap, and where its smoke comes from
    K.box(.8, 2.4, .8, STONE, w * .22, wt + rise * .55, -D * .2); K.box(.95, .2, .95, SNOW, w * .22, wt + rise * .55 + 1.25, -D * .2);
    chimneys.push(V(w * .22, wt + rise * .55 + 1.4, -D * .2).applyMatrix4(K.base));
    // snow heaped round the walls
    for (let k = 0; k < 6; k++) K.box(1 + rnd() * 1.5, .35 + rnd() * .3, .9, SNOW, (rnd() - .5) * w, .15, (rnd() < .5 ? -1 : 1) * (D / 2 + .5), 0, rnd(), 0);
  };
  [[-98, -22, .15, 1], [-80, -27, -.1, 1.1], [-63, -19, .2, .95], [-16, -33, 0, 1.05], [5, -37, .1, 1], [26, -31, -.15, 1.1], [44, -21, -.2, 1], [62, -26, .1, 1.05], [82, -19, -.1, .95], [100, -27, .2, 1.1],
    [-112, -55, .1, .9], [-70, -58, -.2, .85], [-34, -56, .2, .9], [30, -58, 0, .9], [70, -55, -.1, .85], [110, -57, .15, .9]].forEach(a => chalet(...a));
  // the village tree, behind the middle of the train: its lights twinkle, a gold star on top
  const TX = 0, TZ = -46;
  K.at(TX, 0, TZ, 0, 1); K.box(.9, 2, .9, WOOD2, 0, 1, 0);
  [[3.6, 4.2, 2.6], [2.9, 3.6, 5.2], [2.2, 3.2, 7.6], [1.5, 2.8, 9.9], [.9, 2.2, 11.9]].forEach(([r, hh, y]) => { K.add(new THREE.ConeGeometry(r, hh, 7), PINE, 0, y, 0); K.add(new THREE.ConeGeometry(r * .55, hh * .5, 7), SNOW, 0, y + hh * .25 + .03, 0); });
  L.at(TX, 0, TZ, 0, 1); L.box(.9, .9, .25, LGOLD, 0, 13.6, 0, 0, 0, Math.PI / 4, .05); L.box(.9, .9, .25, LGOLD, 0, 13.6, 0, 0, Math.PI / 2, Math.PI / 4, .05);
  const treeLights = [];
  for (let i = 0; i < 70; i++) { const u = i / 70, y = 1.6 + u * 10.8, r = 3.5 * (1 - u * .82) + .1, a = i * 2.4; treeLights.push(V(TX + Math.cos(a) * r, y, TZ + Math.sin(a) * r)); }
  // pines: three tiers, each with snow on its shoulders
  const pine = new Kit(K.cols, 0, K);
  pine.box(.08, .2, .08, WOOD2, 0, .1, 0);
  [[.34, .42, .32], [.26, .36, .56], [.18, .3, .78]].forEach(([r, h, y]) => { pine.add(new THREE.ConeGeometry(r, h, 6), rnd() < .5 ? PINE : PINE2, 0, y, 0); pine.add(new THREE.ConeGeometry(r * .58, h * .56, 6), SNOW, 0, y + h * .22 + .006, 0); });
  const pg = pine.geometry(), pn = mob ? 70 : 150, pines = new THREE.InstancedMesh(pg, K.mat, pn); let pk = 0;
  const pond = [-46, -20, 8];
  const clear = (x, z, r) => !lots.some(([a, b, w]) => Math.hypot(x - a, z - b) < w * .75 + r) && Math.hypot(x - pond[0], z - pond[1]) > pond[2] + 3 + r && Math.hypot(x - TX, z - TZ) > 6 + r;
  for (let tries = 0; pk < pn && tries < 3000; tries++) {
    const x = -130 + rnd() * 260, z = -11.5 - rnd() * 50, h = 5 + rnd() * 7; if (!clear(x, z, 1.5)) continue;
    _m.compose(_p.set(x, 0, z), _q.setFromEuler(_e.set(0, rnd() * 6, 0)), _s.set(h * (.85 + rnd() * .3), h, h * (.85 + rnd() * .3))); pines.setMatrixAt(pk++, _m);
  }
  pines.count = pk; pines.userData.noShadow = true; g.add(pines);
  const hp = hillSpots(30), hillPines = new THREE.InstancedMesh(pg, K.mat, hp.length);
  hp.forEach((v, i) => { const h = 4 + rnd() * 5; _m.compose(v, _q.setFromEuler(_e.set(0, rnd() * 6, 0)), _s.set(h, h, h)); hillPines.setMatrixAt(i, _m); }); hillPines.userData.noShadow = true; g.add(hillPines);
  // snowmen out in the field, either side of the train: coal eyes and buttons, carrot noses, stick arms, hats and scarves
  [[28, -11.5, -.2, 0], [-27, -12.4, .3, 1], [48, -14, -.1, 2], [-55, -11.2, .2, 3], [70, -12.2, -.3, 0], [-82, -13, .1, 2]].forEach(([x, z, ry, v]) => {
    K.at(x, 0, z, ry, 1.15);
    K.box(1.2, 1, 1.2, SNOW, 0, .5, 0, 0, .2, 0, .3); K.box(.9, .78, .9, SNOW, 0, 1.36, 0, 0, -.15, 0, .26); K.box(.66, .6, .66, SNOW, 0, 2.03, 0, 0, .1, 0, .2);
    [-.13, .13].forEach(ex => K.box(.08, .08, .05, COAL, ex, 2.12, .33));
    [1.2, 1.4, 1.6].forEach(by => K.box(.08, .08, .05, COAL, 0, by, .46));
    K.add(new THREE.ConeGeometry(.06, .34, 6), CARROT, 0, 2.02, .48, Math.PI / 2);
    [-1, 1].forEach(sd => { K.box(.62, .05, .05, WOOD2, sd * .7, 1.5, 0, 0, 0, sd * .5); K.box(.2, .04, .04, WOOD2, sd * .98, 1.72, 0, 0, 0, sd * 1.2); });
    if (v % 2 === 0) { K.cyl(.42, .42, .05, 10, COAL, 0, 2.36, 0); K.cyl(.26, .26, .42, 10, COAL, 0, 2.58, 0); K.cyl(.265, .265, .08, 10, RED, 0, 2.42, 0); }
    else { K.box(.7, .22, .7, BLUE, 0, 2.38, 0); K.box(.16, .14, .16, SNOW, 0, 2.55, 0); }
    K.box(.75, .12, .75, v > 1 ? GREEN : RED, 0, 1.76, 0); K.box(.14, .5, .06, v > 1 ? GREEN : RED, .2, 1.5, .4, 0, 0, .15);
  });
  // the frozen pond, with skaters gliding round it (in their scarves and hats, like everyone here)
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(pond[2], pond[2], .08, 40), new THREE.MeshStandardMaterial({ color: 0xcfe6f5, roughness: .12, metalness: .15, envMapIntensity: 1.2 }));
  ice.position.set(pond[0], .02, pond[1]); ice.userData.noShadow = true; g.add(ice);
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; K.at(pond[0] + Math.cos(a) * (pond[2] + .3), 0, pond[1] + Math.sin(a) * (pond[2] + .3), -a, 1); K.box(1.6, .4 + rnd() * .3, .9, SNOW, 0, .15, 0); }
  K.at(pond[0] + 2, 0, pond[1] + pond[2] + 1.6, .3, 1); K.box(2.4, .12, .5, WOOD, 0, .5, 0); [-1, 1].forEach(s => K.box(.12, .5, .4, WOOD2, s * 1, .25, 0)); // a bench to lace up on
  const skaters = Array.from({ length: mob ? 2 : 4 }, (_, i) => {
    const p = new Person([1, 4, 9, 2][i]); p.pose('walk', { fade: 0, speed: .42, phase: i * .3 }); g.add(p.root);
    return { p, r: 2.6 + i * 1.3, v: (.36 - i * .04) * (i % 2 ? -1 : 1), a: i * 1.7 };
  });
  upd.push((t, dt) => skaters.forEach(s => {
    s.a += s.v * dt; const x = pond[0] + Math.cos(s.a) * s.r, z = pond[1] + Math.sin(s.a) * s.r * .8;
    s.p.root.position.set(x, .06, z); s.p.root.rotation.set(0, -s.a + (s.v > 0 ? Math.PI : 0), -Math.sign(s.v) * .12); s.p.update(dt);
  }));
  // the platform: snow capping the lamps and the benches' backs, swept into piles by the lamp posts
  [-3 * P, -P, P, 3 * P].forEach(x => { K.at(x, F, front + 7.2, 0, 1); K.box(.4, .08, .58, SNOW, 0, 4.6, -.8); K.box(.7 + rnd() * .3, .3, .6, SNOW, .5, .12, .3); K.box(.5, .22, .5, SHADE, -.45, .1, .4); });
  [-2 * P, 0, 2 * P].forEach(x => { K.at(x, F, front + 5.8, 0, 1); K.box(2.24, .06, .12, SNOW, 0, 1.08, .24); });
  g.add(K.mesh());
  // lights: the windows, the string lights (warm and coloured, twinkling), the tree's
  g.add(L.mesh());
  const all = [...bulbs, ...treeLights], lightMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .16, .13), new THREE.MeshBasicMaterial({ toneMapped: false }), all.length), cols = [0xffc06a, 0xff5a4a, 0x6ac8ff, 0x8aff8a, 0xffe08a], cc = new THREE.Color();
  all.forEach((v, i) => { _m.makeTranslation(v.x, v.y, v.z); lightMesh.setMatrixAt(i, _m); lightMesh.setColorAt(i, cc.set(cols[i % cols.length]).multiplyScalar(2)); });
  lightMesh.userData.noShadow = true; lightMesh.frustumCulled = false; g.add(lightMesh);
  upd.push(t => { for (let i = bulbs.length; i < all.length; i++) { const on = Math.sin(t * 2.2 + i * 1.7) > -.3; lightMesh.setColorAt(i, cc.set(cols[i % cols.length]).multiplyScalar(on ? 2.2 : .5)); } lightMesh.instanceColor.needsUpdate = true; });
  const sm = smoke(chimneys, 0xe8ecf4); g.add(sm.mesh); upd.push(sm.update);
  // falling snow, all round you
  const fall = weather(mob ? 600 : 1500, .1, 0xffffff, [70, 16, 60], .9); g.add(fall.pts);
  return { group: g, update(t, dt, cam) { upd.forEach(f => f(t, dt)); fall.update(t, dt, cam); driftClouds(cl, t); } };
}

/* ---------- Red Canyon: mesas, cactus and an adobe pueblo at sunset ---------- */
function desert(st) {
  reseed(502);
  const g = new THREE.Group(), F = st.FLOOR, front = st.front, mob = st.mobile, upd = [];
  const R1 = '#b4532f', R2 = '#c8693a', R3 = '#9a3f26', R4 = '#df9a5e', CAC = '#4f7a3a', CAC2 = '#3e6430', PINK = '#e86a8a', YEL = '#f2d45a', ADO = '#d49a64', ADO2 = '#c08452', ADO3 = '#e6b884', VIGA = '#5a3a26', TURQ = '#2fa7a0', CHILI = '#c92f2a', TERRA = '#b8623a', WOOD = '#7a5638', DARK = '#3a2a20', BONE = '#eee6d6', METAL = '#8a7f74', GOLD = '#d9a83a', SAND = '#d8a26a';
  const K = new Kit([R1, R2, R3, R4, CAC, CAC2, PINK, YEL, ADO, ADO2, ADO3, VIGA, TURQ, CHILI, TERRA, WOOD, DARK, BONE, METAL, GOLD, SAND]);
  const L = glowKit(['#ffbf6a', '#ff9a4a']), [WARM, AMBER] = L.cols;
  ground(g, (x, s) => {
    x.fillStyle = '#d6a36d'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(150,90,50,${.08 + rnd() * .08})`; x.lineWidth = 2 + rnd() * 3; x.beginPath(); const y0 = rnd() * s; x.moveTo(0, y0); for (let k = 0; k <= 8; k++) x.lineTo(k * s / 8, y0 + Math.sin(k * 1.3 + i) * 8); x.stroke(); }
    speckle(x, s, 500, ['rgba(120,70,40,.35)', 'rgba(240,200,150,.5)', 'rgba(90,60,40,.4)'], 1, 3.5);
  }, 512, 9);
  // mesas in bands of red rock, paler with distance
  const bands = (cols, h) => cols.map((c, i) => [i === cols.length - 1 ? () => 1e9 : () => (i + 1) * h, c]);
  g.add(range(-260, -540, 540, flat(peaks(10, -540, 540, 30, 52, 40, 90), 6), bands(['#c9907e', '#d6a08a', '#c9907e', '#dcae96'], 9)));
  g.add(range(-180, -480, 480, flat(peaks(12, -480, 480, 20, 36, 25, 60), 4), bands(['#a3523e', '#b8664a', '#a3523e', '#c47a56', '#d48c62'], 6)));
  g.add(range(-100, -420, 420, flat(peaks(14, -420, 420, 9, 20, 14, 34), 1.5), bands(['#8a3a26', '#a8482c', '#93402a', '#b65a34', '#c96e3e'], 3.6)));
  const cl = clouds(g, [[-150, 64, -300, 1.2, .35], [0, 78, -330, 1, .3], [120, 58, -290, 1.3, .3], [230, 70, -320, 1, .35]], [0xff9f86, 0xf2a0b4], .8);
  // buttes standing out in the valley, layer on layer, and a natural arch
  const butte = (x, z, w, d, n, s) => { K.at(x, 0, z, rnd() * .6, s); let y = 0; for (let i = 0; i < n; i++) { const h = 2 + rnd() * 2.5, k = 1 - i * .07; K.box(w * k + rnd(), h, d * k + rnd(), [R1, R2, R3, R4][i % 4], (rnd() - .5) * .8, y + h / 2, (rnd() - .5) * .8, 0, 0, 0, .4); y += h; } };
  butte(-66, -62, 16, 12, 6, 1.1); butte(78, -70, 20, 14, 7, 1.15); butte(24, -84, 13, 10, 8, 1.2); butte(-118, -78, 18, 12, 5, 1);
  K.at(-24, 0, -60, .25, 1.4); [-6, 6].forEach(px => { let y = 0; for (let i = 0; i < 5; i++) { const h = 2.2 + rnd(); K.box(3.4 - i * .2, h, 3 - i * .15, [R1, R2, R3][i % 3], px, y + h / 2, 0, 0, 0, 0, .4); y += h; } });
  K.box(16, 2.6, 3, R2, 0, 12.6, 0, 0, 0, 0, .5); K.box(13, 1.4, 2.6, R4, 0, 14.4, 0, 0, 0, 0, .4); K.box(9, .9, 3.2, R1, 0, 11.1, 0, 0, 0, 0, .3);
  // the pueblo: adobe houses with vigas, turquoise doors and window frames, chili ristras, ladders, pots
  const lots = [];
  const house = (x, z, ry, s, up) => {
    lots.push([x, z, 8 * s]); K.at(x, 0, z, ry, s); L.at(x, 0, z, ry, s);
    const w = 7, d = 5.5, h = 3.2, col = pick([ADO, ADO2, ADO3]);
    K.box(w, h, d, col, 0, h / 2, 0, 0, 0, 0, .3);
    [[w, .4, .3, 0, h + .1, d / 2 - .15], [w, .4, .3, 0, h + .1, -d / 2 + .15], [.3, .4, d, w / 2 - .15, h + .1, 0], [.3, .4, d, -w / 2 + .15, h + .1, 0]].forEach(([a, b, c, px, py, pz]) => K.box(a, b, c, col, px, py, pz, 0, 0, 0, .1));
    for (let k = 0; k < 8; k++) K.box(.18, .18, .7, VIGA, -w / 2 + .5 + k * .86, h - .35, d / 2 + .2, 0, 0, 0, .05);
    K.box(1.05, 2.1, .14, TURQ, -1.2, 1.05, d / 2 + .02); K.box(1.3, .14, .22, VIGA, -1.2, 2.2, d / 2 + .05);
    [1.4, 2.9].forEach(wx => { K.box(1.05, 1, .12, TURQ, wx, 1.8, d / 2 + .02); L.box(.75, .7, .1, rnd() < .6 ? WARM : AMBER, wx, 1.8, d / 2 + .05, 0, 0, 0, .02); });
    for (let k = 0; k < 7; k++) K.box(.13, .16, .13, CHILI, -.45, 2.05 - k * .17, d / 2 + .18, 0, k * .7, 0, .04); // a ristra by the door
    K.cyl(.28, .2, .5, 8, TERRA, -2.4, .25, d / 2 + .5); K.cyl(.22, .16, .4, 8, TERRA, -2.9, .2, d / 2 + .7);
    if (up) {
      const uw = 4.2, ud = 3.6, ux = -w / 2 + uw / 2 + .3, uz = -d / 2 + ud / 2 + .3;
      K.box(uw, 2.8, ud, col, ux, h + 1.4, uz, 0, 0, 0, .25); K.box(uw + .1, .35, ud + .1, col, ux, h + 2.95, uz, 0, 0, 0, .1);
      for (let k = 0; k < 5; k++) K.box(.16, .16, .6, VIGA, ux - uw / 2 + .45 + k * .82, h + 2.5, uz + ud / 2 + .2, 0, 0, 0, .04);
      L.box(.7, .65, .1, WARM, ux + 1, h + 1.5, uz + ud / 2 + .03, 0, 0, 0, .02); K.box(.95, .9, .12, TURQ, ux + 1, h + 1.5, uz + ud / 2, 0, 0, 0, .02);
      // a ladder up to the roof, its poles poking above
      const lx = w / 2 - 1.2, a = .25; [-.32, .32].forEach(dx => K.box(.1, 4.6, .1, WOOD, lx + dx, 2.1, d / 2 + .7 - .02, -a, 0, 0, .03)); // (leaning back against the wall)
      for (let k = 0; k < 9; k++) K.box(.7, .07, .07, WOOD, lx, .3 + k * .45, d / 2 + .7 - (.3 + k * .45 - 2.1) * Math.tan(a) + .02, 0, 0, 0, .02);
    }
  };
  [[-104, -24, .1, 1, 1], [-86, -19, -.15, .9, 0], [-50, -24, .2, 1, 1], [36, -19, -.1, 1, 0], [56, -26, .15, 1.1, 1], [80, -20, -.2, .95, 1], [104, -27, .1, 1, 0], [-20, -34, 0, 1.1, 1], [8, -38, .15, 1, 1]].forEach(a => house(...a));
  // the mission chapel, its bell in the tower
  K.at(-66, 0, -32, .1, 1.1); K.box(8, 5, 10, ADO3, 0, 2.5, 0, 0, 0, 0, .35); K.box(3.4, 9, 3.4, ADO3, 0, 4.5, 5.2, 0, 0, 0, .3); K.box(3.8, .4, 3.8, ADO2, 0, 9.1, 5.2, 0, 0, 0, .1);
  K.box(1.6, 1.8, .4, DARK, 0, 7.2, 6.8, 0, 0, 0, .1); K.cyl(.38, .6, .8, 10, GOLD, 0, 7.1, 6.8); K.box(.16, 1.3, .16, DARK, 0, 9.9, 5.2); K.box(.8, .16, .16, DARK, 0, 10.1, 5.2);
  K.box(1.6, 2.8, .2, WOOD, 0, 1.4, 6.95); L.box(.5, .8, .1, AMBER, 0, 4.2, 6.95);
  // a wooden water tank on legs, and a farm windmill whose wheel turns in the breeze
  K.at(52, 0, -40, 0, 1.2); [[-1.3, -1.3], [-1.3, 1.3], [1.3, -1.3], [1.3, 1.3]].forEach(([a, b]) => K.box(.25, 7, .25, WOOD, a, 3.5, b, b * .04, 0, -a * .04));
  K.cyl(2, 2, 2.6, 10, WOOD, 0, 8.3, 0); [7.4, 9.2].forEach(y => K.cyl(2.04, 2.04, .15, 10, DARK, 0, y, 0)); K.add(new THREE.ConeGeometry(2.3, 1.3, 10), VIGA, 0, 10.25, 0);
  const WX = -40, WZ = -27; K.at(WX, 0, WZ, .4, 1);
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => K.box(.14, 10.2, .14, METAL, a * .75, 5, b * .75, -b * .07, 0, a * .07, .04));
  for (let k = 1; k < 5; k++) { const y = k * 2, r = .75 - y * .065; K.box(r * 2 + .1, .08, .08, METAL, 0, y, r); K.box(r * 2 + .1, .08, .08, METAL, 0, y, -r); K.box(.08, .08, r * 2 + .1, METAL, r, y, 0); K.box(.08, .08, r * 2 + .1, METAL, -r, y, 0); }
  K.box(.5, .4, 1.4, METAL, 0, 10.3, -.3); K.box(.06, 1.1, 1.8, WOOD, 0, 10.4, -1.6);
  const wheel = new Kit(K.cols, 0, K); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; wheel.box(.12, 1.25, .03, METAL, Math.sin(a) * .9, Math.cos(a) * .9, 0, 0, 0, -a, .01); } wheel.cyl(.18, .18, .2, 8, DARK, 0, 0, 0, Math.PI / 2);
  const wm = wheel.mesh(); const wg = new THREE.Group(); wg.position.set(WX, 10.4, WZ); wg.rotation.y = .4; wm.position.z = .75; wg.add(wm); g.add(wg); upd.push((t, dt) => { wm.rotation.z -= dt * 1.4; });
  // cacti: saguaros (three shapes, instanced), with flowers on top; prickly pears and barrels near the fence
  const sag = arms => { const s = new Kit(K.cols, 0, K); s.box(.18, 1, .18, CAC, 0, .5, 0, 0, 0, 0, .06); s.box(.07, .06, .07, rnd() < .5 ? PINK : YEL, 0, 1.02, 0, 0, 0, 0, .02);
    arms.forEach(([side, y, len]) => { s.box(.24, .11, .11, CAC2, side * .16, y, 0, 0, 0, 0, .04); s.box(.11, len, .11, CAC, side * .26, y + len / 2 - .03, 0, 0, 0, 0, .04); s.box(.05, .05, .05, PINK, side * .26, y + len, 0, 0, 0, 0, .015); }); return s.geometry(); };
  const sags = [sag([[1, .45, .3]]), sag([[-1, .5, .28], [1, .38, .36]]), sag([[1, .55, .25], [-1, .62, .2], [-1, .35, .18]])], sn = mob ? 18 : 40;
  const clear = (x, z, r) => !lots.some(([a, b, w]) => Math.hypot(x - a, z - b) < w * .75 + r) && Math.hypot(x - WX, z - WZ) > 4 && Math.hypot(x + 66, z + 32) > 9 && Math.hypot(x - 52, z + 40) > 5;
  sags.forEach(geo => {
    const im = new THREE.InstancedMesh(geo, K.mat, sn); let k = 0;
    for (let tries = 0; k < sn && tries < 800; tries++) { const x = -130 + rnd() * 260, z = -11 - rnd() * 45, h = 4 + rnd() * 4; if (!clear(x, z, 1)) continue; _m.compose(_p.set(x, 0, z), _q.setFromEuler(_e.set(0, rnd() * 6, 0)), _s.set(h, h, h)); im.setMatrixAt(k++, _m); }
    im.count = k; im.userData.noShadow = true; g.add(im);
    const hs = hillSpots(8), hm = new THREE.InstancedMesh(geo, K.mat, hs.length); // and up on the tunnel's hill
    hs.forEach((v, i) => { const h = 3 + rnd() * 3; _m.compose(v, _q.setFromEuler(_e.set(0, rnd() * 6, 0)), _s.set(h, h, h)); hm.setMatrixAt(i, _m); }); hm.userData.noShadow = true; g.add(hm);
  });
  for (let i = 0; i < 46; i++) {
    const x = -120 + rnd() * 240, z = -9.4 - rnd() * 6; if (Math.abs(x) < 18 && rnd() < .7) continue; K.at(x, 0, z, rnd() * 6, .8 + rnd() * .6);
    if (rnd() < .5) { K.box(.5, .55, .12, CAC, 0, .27, 0, 0, 0, .2, .05); K.box(.42, .45, .1, CAC2, .3, .62, .02, 0, .4, -.5, .05); K.box(.38, .4, .1, CAC, -.25, .66, -.02, 0, -.3, .6, .05); [[.1, .55], [.42, .9], [-.4, .9]].forEach(([fx, fy]) => K.box(.09, .1, .09, CHILI, fx, fy, .05, 0, 0, 0, .03)); }
    else { K.box(.5, .48, .5, CAC2, 0, .24, 0, 0, 0, 0, .14); K.box(.18, .1, .18, rnd() < .5 ? YEL : PINK, 0, .5, 0, 0, 0, 0, .04); }
    if (rnd() < .6) K.box(.5 + rnd(), .3 + rnd() * .4, .5 + rnd() * .6, pick([R1, R3, R4]), (rnd() - .5) * 2.5, .15, (rnd() - .5) * 1.5, 0, rnd(), 0, .1);
  }
  // a cow's skull on a fence post, out by the line
  K.at(31, 0, -9.3, -.3, 1); K.box(.16, 1.3, .16, WOOD, 0, .65, 0); K.box(.42, .3, .34, BONE, 0, 1.35, .14, 0, 0, 0, .08); K.box(.26, .22, .3, BONE, 0, 1.2, .32, 0, 0, 0, .07);
  [-1, 1].forEach(s => { K.box(.06, .06, .05, DARK, s * .1, 1.4, .32, 0, 0, 0, .01); K.box(.36, .07, .07, BONE, s * .32, 1.48, .1, 0, 0, s * .4, .02); K.box(.07, .2, .07, BONE, s * .5, 1.64, .1, 0, 0, -s * .3, .02); });
  g.add(K.mesh()); g.add(L.mesh());
  // tumbleweeds rolling through on the wind (one across the platform, too)
  const tw = new Kit(K.cols, 0, K);
  for (let i = 0; i < 26; i++) { const a = rnd() * 6.3, b = rnd() * 3.1; tw.box(.035, .9 + rnd() * .3, .035, '#7a5638', Math.sin(b) * Math.cos(a) * .15, Math.cos(b) * .15, Math.sin(b) * Math.sin(a) * .15, rnd() * 3, rnd() * 3, rnd() * 3, .01); }
  const twGeo = tw.geometry(), weeds = [[-9.8, 3.4, .9], [-12.6, 4.2, 1.1], [front + 9.2, 2.6, .8], [-15.5, 3.8, 1.3]].map(([z, v, s], i) => { const m = new THREE.Mesh(twGeo, K.mat); m.scale.setScalar(s); m.userData.noShadow = true; g.add(m); return { m, z, v, s, x: -100 + i * 55, y0: z > 0 ? F : 0 }; });
  upd.push((t, dt) => weeds.forEach((w, i) => {
    w.x += w.v * dt; if (w.x > 110) w.x -= 220;
    const hop = Math.abs(Math.sin(t * (2.2 + i * .3) + i)) * .5 * w.s; w.m.position.set(w.x, w.y0 + .45 * w.s + hop, w.z); w.m.rotation.z -= w.v * dt / (.45 * w.s); w.m.rotation.x = Math.sin(t * .7 + i) * .3;
  }));
  // vultures circling, and dust drifting low (the platform's motes, warmer: station.js)
  const vul = flock(5, 0x2a1d1a, 2.2); g.add(vul.mesh); upd.push(t => circleFlock(vul, 6, 26, -44, t, .92));
  return { group: g, update(t, dt) { upd.forEach(f => f(t, dt)); driftClouds(cl, t); } };
}

/* ---------- Seaside: a beach, the sea, a lighthouse, an afternoon ---------- */
function seaMaterial(st) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, shore: { value: -26 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 70 }, fogFar: { value: 340 }, sunDir: { value: st.sunDir }, sunCol: { value: new THREE.Color(1, .93, .8) },
      shallow: { value: new THREE.Color('#47c4bd') }, deep: { value: new THREE.Color('#1e5d93') }, sky: { value: new THREE.Color('#bfe0f2') } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time, shore, fogNear, fogFar; uniform vec3 fogColor, sunDir, sunCol, shallow, deep, sky; varying vec3 vW;
      void main(){
        float d = shore - vW.z; vec2 p = vW.xz;
        float wash = 1.4 + 1.1 * sin(time * .55 + p.x * .045) + .4 * sin(time * 1.3 + p.x * .21);
        float e = d + wash; if (e < 0.) discard;
        vec3 n = normalize(vec3(.06 * cos(p.x * .41 + time * 1.3) + .05 * cos(p.x * .17 - p.y * .3 + time * .9) + .03 * cos(p.y * .9 + time * 2.1), 1., .07 * cos(p.y * .37 + time * 1.1) + .04 * cos(p.x * .23 + p.y * .51 - time * 1.7)));
        vec3 V = normalize(cameraPosition - vW);
        vec3 c = mix(shallow, deep, smoothstep(3., 70., d));
        float fr = pow(1. - max(dot(n, V), 0.), 4.); c = mix(c, sky, fr * .7);
        float sp = pow(max(dot(reflect(-normalize(sunDir), n), V), 0.), 120.); c += sunCol * sp * 2.5;
        float foam = smoothstep(0., .15, e) * (1. - smoothstep(.2, 1.1, e));
        float br = (1. - smoothstep(0., .5, abs(d - 6. - 2. * sin(time * .55 + p.x * .045 + 1.)))) * .5 * (.5 + .5 * sin(p.x * .3 + time));
        c = mix(c, vec3(1.), clamp(foam + br, 0., 1.));
        c = mix(c, fogColor, smoothstep(fogNear, fogFar, length(cameraPosition - vW)));
        gl_FragColor = vec4(c, 1.);
      }`
  });
}
function coast(st) {
  reseed(707);
  const g = new THREE.Group(), F = st.FLOOR, mob = st.mobile, upd = [];
  const SAND = '#f2e2bf', SAND2 = '#e3cc9a', WHITE = '#ffffff', MINT = '#7fd1c1', PINK = '#f2a6b8', YEL = '#f5d76e', SKY = '#8cc8f0', CORAL = '#f08a6a', NAVY = '#2a5aa0', RED = '#c9272c', WOOD = '#8a6a4a', WOOD2 = '#6b5040', DARK = '#3a3d45', ROCK = '#7a7f88', ROCK2 = '#5f646d', ORANGE = '#e8792a', GREEN = '#3fae5a', GLASS = '#2a3a4a';
  const K = new Kit([SAND, SAND2, WHITE, MINT, PINK, YEL, SKY, CORAL, NAVY, RED, WOOD, WOOD2, DARK, ROCK, ROCK2, ORANGE, GREEN, GLASS]);
  // sand from the fence to the water's edge; the sea beyond, to the horizon (its own shader: waves, glints, the wash)
  ground(g, (x, s) => { x.fillStyle = '#efdcb4'; x.fillRect(0, 0, s, s); speckle(x, s, 700, ['rgba(200,170,120,.35)', 'rgba(255,248,230,.6)', 'rgba(170,140,100,.3)'], .8, 2.6); }, 512, 8, -8.4, 30);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(600, 6), new THREE.MeshStandardMaterial({ color: 0xc9b083, roughness: .35, metalness: 0 })); wet.rotation.x = -Math.PI / 2; wet.position.set(0, -.05, -27); wet.userData.noShadow = true; g.add(wet);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700, 1, 1), seaMaterial(st)); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -.03, -22 - 350); sea.userData.noShadow = true; sea.frustumCulled = false; g.add(sea);
  upd.push(t => { const u = sea.material.uniforms, f = st.scene.fog; u.time.value = t; u.fogColor.value.copy(f.color); u.fogNear.value = f.near; u.fogFar.value = f.far; });
  // islands and a far headland, low on the horizon
  g.add(range(-420, -600, 600, x => -2 + Math.max(0, 9 * Math.sin(x * .012 + 1) - 3) + Math.max(0, 6 * Math.sin(x * .03 + 2) - 2), [[() => 1e9, '#9cb6c8']]));
  g.add(range(-300, -500, 500, x => -3 + Math.max(0, 7 * Math.sin(x * .02 - .5) - 2.5) + Math.max(0, 4 * Math.sin(x * .05 + 1) - 2), [[() => 1, '#7f9a8e'], [() => 1e9, '#86a68a']]));
  const cl = clouds(g, [[-150, 60, -300, 1.1], [-30, 76, -330, .9], [90, 56, -290, 1.2], [210, 72, -320, 1], [20, 46, -260, .8], [-240, 52, -280, 1]], [0xffffff, 0xfff1e2], .85);
  // beach huts in a row, each its own pastel, white trim, a striped door and a little step
  const hut = (x, z, ry, col) => {
    K.at(x, 0, z, ry, 1.3);
    K.box(2.6, .3, 2.6, WOOD2, 0, .15, 0); K.box(2.4, 2.4, 2.3, col, 0, 1.5, 0, 0, 0, 0, .08);
    [-1, 1].forEach(s => { K.box(.12, 2.4, .12, WHITE, s * 1.2, 1.5, 1.15); K.box(1.7, .16, 2.9, s < 0 ? col : WHITE, s * .75, 3.15, 0, 0, 0, -s * .6, .04); });
    for (let k = 0; k < 5; k++) K.box(.22, 1.7, .08, k % 2 ? WHITE : col === MINT ? NAVY : RED, -.44 + k * .22, 1.2, 1.17, 0, 0, 0, .02);
    K.box(1.4, .12, .5, WOOD, 0, .32, 1.5); K.box(.3, .3, .06, WHITE, .8, 2.2, 1.17);
  };
  [-96, -86, -76, -66, -56, 34, 44, 54, 64, 74, 84].forEach((x, i) => hut(x, -15.5 - (i % 2) * .4, (rnd() - .5) * .1, [MINT, PINK, YEL, SKY, CORAL][i % 5]));
  // umbrellas, striped, over towels; a cooler, a beach ball; surfboards stood in the sand; a sandcastle
  const umbrella = (x, z, c1, c2) => {
    K.at(x, 0, z, rnd() * 6, 1); K.box(.08, 2.6, .08, WHITE, 0, 1.3, 0);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, w = new THREE.ConeGeometry(1.5, .55, 8, 1, true, a, Math.PI / 4); w.setIndex(w.index); K.add(w, k % 2 ? c1 : c2, 0, 2.55, 0); }
    K.box(.14, .14, .14, c2, 0, 2.86, 0);
    K.box(.9, .03, 1.8, pick([NAVY, RED, YEL, MINT]), .9, .03, .3, 0, .2, 0, .01); K.box(.9, .035, .25, WHITE, .9, .035, .1, 0, .2, 0, .01);
    if (rnd() < .5) { K.box(.55, .4, .35, pick([NAVY, RED, WHITE]), -.9, .2, .4); K.box(.6, .08, .4, WHITE, -.9, .44, .4); }
    if (rnd() < .4) { K.box(.4, .4, .4, RED, -.5, .2, -.9, 0, .5, 0, .16); K.box(.41, .12, .41, WHITE, -.5, .2, -.9, 0, .5, 0, .05); }
  };
  [[-44, -19, RED, WHITE], [-36, -22, NAVY, YEL], [-28, -18.5, CORAL, WHITE], [26, -20, MINT, WHITE], [36, -18.6, RED, YEL], [96, -21, NAVY, WHITE], [-108, -20, PINK, WHITE], [112, -19, YEL, RED], [-60, -22.5, MINT, YEL]].forEach(a => umbrella(...a));
  [[-31, -14.6], [-30.3, -14.4], [-29.5, -14.7], [29, -14], [29.8, -14.3]].forEach(([x, z], i) => { K.at(x, 0, z, (rnd() - .5) * .3, 1); K.box(.55, 2.4, .1, [YEL, SKY, CORAL, MINT, PINK][i], 0, 1.1, 0, (rnd() - .5) * .15, 0, (rnd() - .5) * .12, .22); K.box(.08, 2.2, .11, WHITE, 0, 1.15, 0, 0, 0, 0, .02); });
  K.at(-48, 0, -14.5, .3, 1.3); K.box(1.6, .5, 1.6, SAND2, 0, .25, 0); [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => { K.box(.45, 1, .45, SAND2, a * .7, .5, b * .7); for (let k = -1; k <= 1; k += 2) K.box(.12, .14, .12, SAND2, a * .7 + k * .14, 1.07, b * .7); });
  K.box(.8, 1.2, .8, SAND, 0, .9, 0); K.box(.03, .5, .03, WOOD, 0, 1.75, 0); K.box(.25, .14, .02, RED, .13, 1.9, 0);
  // the lifeguard tower: legs, a red hut with a white roof, a ramp and a flag
  K.at(20, 0, -19, -.2, 1.25); [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => K.box(.16, 2.2, .16, WHITE, a * .9, 1.1, b * .9));
  K.box(2.2, .14, 2.2, WOOD, 0, 2.25, 0); K.box(1.9, 1.5, 1.8, RED, 0, 3.05, -.1); K.box(2.5, .2, 2.4, WHITE, 0, 3.9, -.1, 0, 0, 0, .06); K.box(1.3, .7, .06, GLASS, 0, 3.15, .82);
  K.box(.9, .1, 3.2, WOOD, 0, 1.05, 2.3, -.68); K.box(.06, 2.2, .06, WHITE, .95, 4.9, -.9); const flagAt = V(.95, 5.7, -.9).applyMatrix4(K.base);
  // the pier, out over the water, with lamp posts and a little hut at its end
  K.at(48, 0, -24, 0, 1);
  K.box(3, .22, 52, WOOD, 0, .9, -26, 0, 0, 0, .05);
  for (let k = 0; k <= 13; k++) [-1.3, 1.3].forEach(s => K.box(.24, 2.2, .24, WOOD2, s, -.1, -k * 4, 0, 0, 0, .05));
  for (let k = 0; k <= 26; k++) [-1.42, 1.42].forEach(s => K.box(.08, .8, .08, WOOD2, s, 1.4, -k * 2, 0, 0, 0, .02));
  [-1.42, 1.42].forEach(s => K.box(.1, .08, 52, WOOD2, s, 1.8, -26, 0, 0, 0, .02));
  for (let k = 1; k < 6; k++) { K.box(.1, 2.4, .1, DARK, 1.3, 2.1, -k * 9); K.box(.3, .3, .3, YEL, 1.3, 3.4, -k * 9); }
  K.box(4, 2.6, 3.4, SKY, 0, 2.3, -50); K.box(4.6, .3, 4, WHITE, 0, 3.75, -50, 0, 0, 0, .1);
  // the lighthouse on its rocky headland: red and white rings, the gallery, the lantern, its turning beam
  const LX = -34, LZ = -66;
  for (let i = 0; i < 28; i++) { K.at(LX + (rnd() - .5) * 26, 0, LZ + (rnd() - .5) * 18, rnd() * 6, 1); const s = 2 + rnd() * 4; K.box(s, s * (.4 + rnd() * .5), s * (.7 + rnd() * .4), rnd() < .5 ? ROCK : ROCK2, 0, s * .2, 0, 0, 0, 0, .3); }
  K.at(LX, 0, LZ, 0, 1); K.box(9, 4, 8, ROCK2, 0, 2, 0, 0, 0, 0, .5); K.box(5, 1.2, 5, GREEN, 0, 4.2, 0, 0, 0, 0, .3);
  for (let k = 0; k < 6; k++) K.cyl(1.55 - k * .1, 1.6 - k * .1, 2.2, 10, k % 2 ? WHITE : RED, 0, 5.9 + k * 2.2, 0);
  K.cyl(2, 2, .25, 12, DARK, 0, 19.2, 0); for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; K.box(.06, .7, .06, DARK, Math.cos(a) * 1.9, 19.7, Math.sin(a) * 1.9); }
  K.cyl(1.2, 1.2, .3, 10, DARK, 0, 21.9, 0); K.add(new THREE.ConeGeometry(1.4, 1.4, 10), RED, 0, 22.7, 0);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.9, 10), (() => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.4) }); m.toneMapped = false; return m; })());
  lamp.position.set(LX, 20.8, LZ); g.add(lamp);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: .12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.geometry.translate(0, -30, 0); beam.geometry.rotateZ(Math.PI / 2); const bg = new THREE.Group(); bg.position.set(LX, 20.8, LZ); bg.add(beam); g.add(bg);
  upd.push((t, dt) => { bg.rotation.y += dt * .5; });
  // palms along the sand (the Nature Kit's)
  const KIT = cityKits(), palms = new THREE.Group(); g.add(palms);
  if (KIT && KIT.nature) {
    const names = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall'];
    for (let i = 0; i < (mob ? 14 : 26); i++) {
      const x = -120 + rnd() * 240, z = -9.8 - rnd() * 11; if (Math.abs(x - 48) < 4 || Math.abs(x - 20) < 4) continue;
      const name = pick(names), o = KIT.nature[name].clone(), h = 7 + rnd() * 4; o.position.set(x, 0, z); o.rotation.y = rnd() * 6.3; o.scale.setScalar(h / KIT.nature[name].userData.size.y); palms.add(o);
    }
    hillSpots(12).forEach(v => { const name = pick(names), o = KIT.nature[name].clone(), h = 6 + rnd() * 3; o.position.copy(v); o.rotation.y = rnd() * 6.3; o.scale.setScalar(h / KIT.nature[name].userData.size.y); palms.add(o); });
    palms.traverse(o => { if (o.isMesh) o.userData.noShadow = true; }); mergeStatic(palms);
    // in the afternoon sun: brighter greens and a paler bark than the evening kit
    palms.traverse(o => { if (o.isMesh) { const m = o.material.clone(); m.color.set(/leaf|grass/i.test(m.name) ? 0x5aa64e : 0x8f6c4c); o.material = m; } });
  }
  g.add(K.mesh());
  // the Ferris wheel out on the pier, turning slowly: an A-frame, two rims, spokes, and gondolas that hang level
  const FX = 48, FZ = -60, FY = 14, FR = 11.5, wheel = new Kit(K.cols, 0, K), gond = new Kit(K.cols, 0, K);
  K.at(FX, 0, FZ, 0, 1); K.box(9, .6, 6, WOOD, 0, 1.1, 0);
  [-1, 1].forEach(sz => [-1, 1].forEach(sx => { const a = Math.atan2(5.5, FY), L = Math.hypot(5.5, FY); K.box(.5, L, .5, WHITE, sx * 2.75, 1.1 + FY / 2, sz * 1.6, 0, 0, sx * a); }));
  K.box(.6, .6, 3.6, DARK, 0, FY + 1.1, 0); K.box(1.6, 1.4, 1.2, RED, 0, 2.1, 2.2); // the hub's axle, and the ticket booth
  for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2, b = (k + 1) / 28 * Math.PI * 2, m = (a + b) / 2, len = 2 * FR * Math.sin(Math.PI / 28); [-.7, .7].forEach(z => wheel.box(.22, len + .1, .22, k % 2 ? WHITE : RED, Math.cos(m) * FR, Math.sin(m) * FR, z, 0, 0, m, .05)); }
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; [-.7, .7].forEach(z => wheel.box(.12, FR, .12, WHITE, Math.cos(a) * FR / 2, Math.sin(a) * FR / 2, z, 0, 0, a - Math.PI / 2, .03)); }
  wheel.cyl(.9, .9, 1.7, 12, RED, 0, 0, 0, Math.PI / 2);
  const wm = wheel.mesh(); wm.position.set(FX, FY + 1.1, FZ); g.add(wm);
  gond.box(1.5, 1.2, 1.4, WHITE, 0, -1, 0, 0, 0, 0, .25); gond.box(1.7, .2, 1.6, WHITE, 0, -.32, 0, 0, 0, 0, .06); gond.box(.1, .5, .1, WHITE, 0, .05, 0);
  const NG = 14, gm = new THREE.InstancedMesh(gond.geometry(), K.mat, NG), gc = new THREE.Color();
  for (let k = 0; k < NG; k++) gm.setColorAt(k, gc.set([0xf2a6b8, 0x8cc8f0, 0xf5d76e, 0x7fd1c1, 0xf08a6a][k % 5]));
  gm.frustumCulled = false; gm.userData.noShadow = true; g.add(gm);
  upd.push((t, dt) => {
    wm.rotation.z += dt * .12;
    for (let k = 0; k < NG; k++) { const a = wm.rotation.z + k / NG * Math.PI * 2; _m.compose(_p.set(FX + Math.cos(a) * FR, FY + 1.1 + Math.sin(a) * FR, FZ), _q.setFromEuler(_e.set(0, 0, Math.sin(t * 1.2 + k) * .04)), _s.set(1, 1, 1)); gm.setMatrixAt(k, _m); }
    gm.instanceMatrix.needsUpdate = true;
  });
  // a flag on the lifeguard tower, flapping; sailboats out on the water, bobbing as they go; gulls
  const flagGeo = new THREE.PlaneGeometry(1, .6, 8, 1); flagGeo.translate(.5, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0xc9272c, side: THREE.DoubleSide, roughness: .8 })); flag.position.copy(flagAt); flag.userData.noShadow = true; g.add(flag);
  const fb = Float32Array.from(flagGeo.attributes.position.array);
  upd.push(t => { const a = flagGeo.attributes.position; for (let i = 0; i < a.count; i++) { const x = fb[i * 3]; a.setZ(i, Math.sin(x * 5 - t * 7) * .12 * x); } a.needsUpdate = true; });
  const boats = [[-90, -95, 1.4, RED], [-20, -130, 1.8, NAVY], [60, -110, 1.5, YEL], [130, -160, 2, WHITE], [-160, -150, 1.7, CORAL]].map(([x, z, s, sail], i) => {
    const b = new Kit(K.cols, 0, K); b.box(3.2, .7, 1.1, WHITE, 0, .25, 0, 0, 0, 0, .25); b.box(3.3, .2, 1.15, NAVY, 0, -.05, 0, 0, 0, 0, .08); b.box(.1, 4.2, .1, WOOD2, .2, 2.4, 0);
    const sl = new THREE.BufferGeometry(); sl.setAttribute('position', new THREE.Float32BufferAttribute([.3, .7, 0, .3, 4.3, 0, 2.1, .8, 0, -.05, .8, 0, -1.3, .8, 0, -.05, 3.6, 0], 3)); sl.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); sl.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    b.add(sl, sail === WHITE ? RED : WHITE); const m = b.mesh(); m.material = new THREE.MeshStandardMaterial({ map: K.mat.map, roughness: .8, side: THREE.DoubleSide });
    m.scale.setScalar(s); m.position.set(x, 0, z); g.add(m); return { m, x, v: .6 + i * .15 };
  });
  upd.push((t, dt) => boats.forEach((b, i) => { b.x += b.v * dt; if (b.x > 220) b.x -= 440; b.m.position.set(b.x, Math.sin(t * 1.1 + i) * .12, b.m.position.z); b.m.rotation.set(Math.sin(t * .9 + i) * .06, 0, Math.sin(t * 1.3 + i * 2) * .05); }));
  const gulls = flock(8, 0xf4f4f0, 1.1); g.add(gulls.mesh); upd.push(t => circleFlock(gulls, -6, 12, -30, t, .55));
  return { group: g, update(t, dt) { upd.forEach(f => f(t, dt)); driftClouds(cl, t); } };
}

export const BUILD = { snow, desert, coast };
