import * as THREE from 'three';
import { CAR_L, FLOOR, DOOR_W, DOOR_H, shellRing, windowSlots } from './train.js';
import { posedGeometry, SCALE, HIP_SIT } from './people.js';

// The inside of each car, seen through its open door and flown through when you board:
// a platform-level vestibule, stairs up to the upper deck, a step down to the lower deck,
// seats, grab poles and a few passengers. No real-time lights: the light from the ceiling
// panels is baked into vertex colours once, and each car's interior is a handful of draw calls.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = hex => new THREE.Color(hex);
export const VEST = FLOOR + .005;   // vestibule floor, level with the platform
const LOWER = .43;                  // lower deck floor: a step down (just clear of the bogies)
const RISE = .19, RUN = .27, STEPS = 8, UPPER = VEST + STEPS * RISE; // stairs up to the upper deck
const CEIL = 2.95, LCEIL = 2.12;    // vestibule and lower-deck ceilings
const XV = 1.0;                     // the vestibule spans |x| < XV
const ZW = -.28;                    // stair wells take the far side of the car (z < ZW)
const XTOP = -XV - (STEPS - 1) * RUN; // where the stairs reach the upper deck
const END = CAR_L / 2 - .22, ZIN = 1.33, IN = .07, ROOF = 3.97;

const LIGHTS = [ // [from, to, intensity, reach, region the light can see: x0 x1 y0 y1 z0 z1]
  [V(-.5, CEIL - .02, 0), V(.5, CEIL - .02, 0), 1.6, 1.35, [-XV, XV, 0, CEIL + .02, -2, 2]],
  [V(-1.2, ROOF - .03, -.8), V(XTOP - .2, ROOF - .03, -.8), 1.1, 1.3, [-4, -XV, 0, 4.2, -2, ZW]],
  [V(XTOP - .1, ROOF - .03, -.1), V(-END + .1, ROOF - .03, -.1), 1.1, 1.4, [-4, XTOP + .03, UPPER - .2, 4.2, -2, 2]],
  [V(XV + .2, LCEIL - .02, -.3), V(END - .1, LCEIL - .02, -.3), 1.05, 1.2, [XV, 4, 0, LCEIL + .02, -2, 2]]
].map(([a, b, I, r, box]) => ({ a, b, I, r, box }));
const AMB = new THREE.Color(.15, .135, .13), WARM = new THREE.Color(1, .8, .56);

function localFloor(p) {
  if (p.x > XV) return LOWER;
  if (p.x < -XV) return p.z < ZW ? VEST + Math.min(STEPS, Math.max(0, Math.ceil((-XV - p.x) / RUN))) * RISE : (p.x < XTOP ? UPPER : LOWER);
  return VEST;
}
const _q = new THREE.Vector3(), _d = new THREE.Vector3();
function bake(p, n, out) {
  let s = 0;
  for (const L of LIGHTS) {
    const b = L.box; if (p.x < b[0] || p.x > b[1] || p.y < b[2] || p.y > b[3] || p.z < b[4] || p.z > b[5]) continue;
    for (let k = 0; k < 6; k++) {
      _q.lerpVectors(L.a, L.b, (k + .5) / 6); _d.subVectors(_q, p); const dist = _d.length() + 1e-4; _d.divideScalar(dist);
      const ndl = Math.max(0, n.dot(_d)), emit = .3 + .7 * Math.max(0, _d.y);
      s += L.I / 6 * (ndl * emit / (1 + (dist / L.r) ** 2) + .22 / (1 + (dist / (2 * L.r)) ** 2));
    }
  }
  // contact shadow where walls meet the floor
  const h = p.y - localFloor(p), ao = Math.abs(n.y) > .7 ? 1 : .68 + .32 * Math.min(1, Math.max(0, h / .5));
  return out.setRGB((AMB.r + WARM.r * s) * ao, (AMB.g + WARM.g * s) * ao, (AMB.b + WARM.b * s) * ao);
}

/* a buffer of baked, vertex-coloured triangles; uvs are projected from the dominant axis so textures tile in metres */
class Baked {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
  vert(p, n, col, uvs = 1, lit = true) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z);
    const c = lit ? bake(p, n, _lc).multiply(col) : col; this.c.push(c.r, c.g, c.b);
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    if (ay >= ax && ay >= az) this.uv.push(p.x * uvs, p.z * uvs); else if (ax >= az) this.uv.push(p.z * uvs, p.y * uvs); else this.uv.push(p.x * uvs, p.y * uvs);
  }
  // add a geometry under matrix m; paint is a colour or (point, normal) => colour
  add(geo, m, paint, { uvs = 1, lit = true } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position, nor = g.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(m), flip = m.determinant() < 0, P = [], N = [];
    for (let i = 0; i < pos.count; i++) { P.push(V(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m)); N.push(V(nor.getX(i), nor.getY(i), nor.getZ(i)).applyMatrix3(nm).normalize()); }
    for (let t = 0; t < P.length; t += 3) {
      const order = flip ? [0, 2, 1] : [0, 1, 2];
      order.forEach(k => { const p = P[t + k], n = N[t + k]; this.vert(p, n, paint === 'vertex' ? _vc.fromBufferAttribute(g.attributes.color, t + k) : typeof paint === 'function' ? paint(p, n) : paint, uvs, lit); });
    }
    if (g !== geo) g.dispose();
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material); m.userData.noShadow = true; return m;
  }
}
const _lc = new THREE.Color(), _vc = new THREE.Color();
const M4 = new THREE.Matrix4(), I4 = new THREE.Matrix4();
const boxGeo = (w, h, d) => new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / .35)), Math.max(1, Math.ceil(h / .35)), Math.max(1, Math.ceil(d / .35)));
// an axis-aligned box from its extents
function box(acc, [x0, x1], [y0, y1], [z0, z1], paint, opt) {
  acc.add(boxGeo(x1 - x0, y1 - y0, z1 - z0), M4.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), paint, opt);
}

// sunlit glass on the far side of the car: the evening outside, softened and warmed
let GLASS = null;
const glassMat = () => {
  if (GLASS) return GLASS;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,236,214,.62)'); g.addColorStop(.55, 'rgba(255,214,170,.3)'); g.addColorStop(1, 'rgba(255,200,150,.2)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (GLASS = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.15, 1.05, .95), transparent: true, depthWrite: false }));
};
// brushed stainless for poles and rails: softer than the train's outside, so it doesn't mirror the purple sky
let STEEL = null;
const steelMat = () => STEEL || (STEEL = new THREE.MeshStandardMaterial({ color: 0xd2d5da, metalness: .55, roughness: .32, envMapIntensity: .55 }));

/* shared textures: a fine speckle for rubber floors and laminate, and a seat moquette */
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const mk = (draw, srgb = true) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const speckle = mk(x => {
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 30; k++) { const cx = r() * 128, cy = r() * 128, rr = 14 + r() * 30, g = x.createRadialGradient(cx, cy, 0, cx, cy, rr); g.addColorStop(0, `rgba(${r() < .5 ? 255 : 200},${r() < .5 ? 255 : 200},${r() < .5 ? 255 : 200},.07)`); g.addColorStop(1, 'rgba(255,255,255,0)'); [-128, 0, 128].forEach(ox => [-128, 0, 128].forEach(oy => { x.save(); x.translate(ox, oy); x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); x.restore(); })); }
    for (let k = 0; k < 1400; k++) { const v = r() < .5 ? 255 : 185; x.fillStyle = `rgba(${v},${v},${v},${.2 + r() * .3})`; x.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1, 1); }
    x.fillStyle = '#f2f2f2'; [[0, 0], [126, 0], [0, 126], [126, 126]].forEach(([u, v]) => x.fillRect(u, v, 2, 2)); // flat surfaces sample this corner
  });
  // transit moquette: a deep red weave scattered with short amber, cream and charcoal dashes
  const moquette = mk(x => {
    x.fillStyle = '#9e1f26'; x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 2200; k++) { x.fillStyle = r() < .5 ? 'rgba(70,8,14,.35)' : 'rgba(200,60,60,.25)'; x.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1, 1); }
    const cols = ['#f0b23c', '#f1e7d4', '#2a1a1e', '#d8545a'];
    for (let k = 0; k < 70; k++) {
      const cx = r() * 128, cy = r() * 128, a = (r() < .5 ? .6 : -.6) + (r() - .5) * .3, l = 4 + r() * 6;
      x.strokeStyle = cols[k % cols.length]; x.lineWidth = 1.6; x.lineCap = 'round';
      [-128, 0, 128].forEach(ox => [-128, 0, 128].forEach(oy => { x.beginPath(); x.moveTo(cx + ox, cy + oy); x.lineTo(cx + ox + Math.cos(a) * l, cy + oy + Math.sin(a) * l); x.stroke(); }));
    }
  });
  return (TEX = { speckle, moquette });
}

/* palette */
const P = {
  wall: C(0xece5d8), dado: C(0xcbc2b2), ceil: C(0xf4f0e8), floor: C(0x6a707b), tread: C(0x50555f), riser: C(0x9aa0a8),
  yellow: C(0xe8b923), part: C(0xe0d9cb), kick: C(0x8a9099), red: C(0xc9272c), frame: C(0xb4b9c1), leaf: C(0xc6cbd2),
  gasket: C(0x22242a), seatFrame: C(0x555a63), shell: C(0xb3b7be), head: C(0xefe9de), dark: C(0x2b2d33), white: C(0xffffff)
};
const liningPaint = p => p.y > 3.6 || (p.x > -XV && p.x < XV && p.y > CEIL - .1) ? P.ceil : p.y < 1.0 ? P.dado : P.wall;

// Build one car's interior into `car` (car-local coordinates; the door faces +z).
// Returns the per-car materials so the station can brighten them as the doors open and on hover.
export function buildInterior(car, { ledMat, plateMat, idx = 0 }) {
  const steel = steelMat();
  const T = textures();
  const mats = {
    base: new THREE.MeshBasicMaterial({ vertexColors: true, map: T.speckle }),
    seat: new THREE.MeshBasicMaterial({ vertexColors: true, map: T.moquette }),
    glow: new THREE.MeshBasicMaterial({ color: WARM.clone().multiplyScalar(1.6) })
  };
  mats.glow.toneMapped = false;
  const A = new Baked(), S = new Baked(), extra = [];
  const put = (geo, mat, x, y, z, setup) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.userData.noShadow = true; if (setup) setup(m); extra.push(m); return m; };
  const pole = (x, z, y0, y1, r = .019) => put(new THREE.CylinderGeometry(r, r, y1 - y0, 12), steel, x, (y0 + y1) / 2, z);
  const rail = (a, b, r = .017) => { const v = new THREE.Vector3().subVectors(b, a); return put(new THREE.CylinderGeometry(r, r, v.length(), 10), steel, 0, 0, 0, m => { m.position.copy(a).addScaledVector(v, .5); m.quaternion.setFromUnitVectors(V(0, 1, 0), v.normalize()); }); };

  /* ---- the lining: the car's own section, offset inward, with the doorways and windows cut out ---- */
  const { pts, R, pin, pinned } = shellRing();
  const keep = [...Array(R + 1).keys()].filter(j => j % 2 === 0 || pinned.has(j)); // half the shell's resolution is plenty inside
  const ring = pts.map((p, j) => {
    const a = pts[(j - 1 + R) % R], b = pts[(j + 1) % R], tz = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tz, ty);
    const nz = ty / l, ny = -tz / l; // outward
    return { z: p[0] - nz * IN, y: p[1] - ny * IN, n: V(0, -ny, -nz), sz: p[0], sy: p[1], t: V(0, ty / l, tz / l) };
  });
  const holes = [], xs = new Set([-END, END]);
  const hole = (x0, x1, ya, yb, sd, kind) => { const a = pin(ya, sd), b = pin(yb, sd); holes.push({ x0, x1, j0: Math.min(a, b), j1: Math.max(a, b), kind }); xs.add(x0); xs.add(x1); };
  [1, -1].forEach(sd => hole(-DOOR_W / 2, DOOR_W / 2, FLOOR, FLOOR + DOOR_H, sd, 'door'));
  windowSlots().forEach(w => [1, -1].forEach(sd => hole(w.x - w.w / 2, w.x + w.w / 2, w.y - w.h / 2, w.y + w.h / 2, sd, 'win')));
  let X = [...xs].sort((a, b) => a - b); const filled = [];
  X.forEach((x, i) => { filled.push(x); const nx = X[i + 1]; if (nx !== undefined) { const k = Math.ceil((nx - x) / .4); for (let s = 1; s < k; s++) filled.push(x + (nx - x) * s / k); } });
  X = filled;
  const lp = (x, j) => V(x, ring[j].y, ring[j].z), sp = (x, j) => V(x, ring[j].sy, ring[j].sz);
  const tri = (acc, ps, ns, paint) => ps.forEach((p, k) => acc.vert(p, ns[k], paint(p, ns[k])));
  // a flat quad a-b-c-d, wound so it faces along n
  const quad = (a, b, c, d, n, paint) => {
    const fwd = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).dot(n) > 0;
    [[a, b, c], [a, c, d]].forEach(t => tri(A, fwd ? t : [t[0], t[2], t[1]], [n, n, n], paint));
  };
  for (let i = 0; i < X.length - 1; i++) {
    const xm = (X[i] + X[i + 1]) / 2;
    for (let k = 0; k < keep.length - 1; k++) {
      const j = keep[k], j2 = keep[k + 1];
      if (holes.some(h => xm > h.x0 && xm < h.x1 && j >= h.j0 && j < h.j1)) continue;
      const a = lp(X[i], j), b = lp(X[i + 1], j), c = lp(X[i + 1], j2), d = lp(X[i], j2), na = ring[j].n, nd = ring[j2].n;
      tri(A, [a, c, b], [na, nd, na], liningPaint); tri(A, [a, d, c], [na, nd, nd], liningPaint); // wound to face inward
    }
  }
  // reveals: the depth of the wall around each opening, from the lining out to the body
  holes.forEach(h => {
    const col = h.kind === 'door' ? P.kick : P.frame, paint = () => col;
    const js = keep.filter(j => j >= h.j0 && j <= h.j1);
    for (let k = 0; k < js.length - 1; k++) {
      const j = js[k], j2 = js[k + 1];
      [[h.x0, V(1, 0, 0)], [h.x1, V(-1, 0, 0)]].forEach(([x, n]) => quad(lp(x, j), lp(x, j2), sp(x, j2), sp(x, j), n, paint));
    }
    [[h.j0, 1], [h.j1, -1]].forEach(([j, s]) => {
      if (h.kind === 'door' && ring[j].sy < 1) return; // the floor covers the sill
      quad(lp(h.x0, j), lp(h.x1, j), sp(h.x1, j), sp(h.x0, j), ring[j].t.clone().multiplyScalar(s), paint);
    });
  });
  // end walls
  [-1, 1].forEach(sd => {
    const sh = new THREE.Shape(); keep.slice(0, -1).forEach((j, k) => k ? sh.lineTo(ring[j].z, ring[j].y) : sh.moveTo(ring[j].z, ring[j].y));
    const g = new THREE.ShapeGeometry(sh, 2);
    A.add(g, new THREE.Matrix4().makeRotationY(sd > 0 ? -Math.PI / 2 : Math.PI / 2).premultiply(M4.makeTranslation(sd * END, 0, 0)).multiply(sd > 0 ? I4 : new THREE.Matrix4().makeScale(-1, 1, 1)), P.wall.clone().multiplyScalar(.5), { lit: false });
  });
  // gangway doors in the end walls, one on each deck you can see
  [[END, LOWER, LCEIL - .06], [-END, UPPER, ROOF - .25]].forEach(([x, y0, y1]) => {
    const sd = Math.sign(x);
    box(A, sd > 0 ? [x - .03, x] : [x, x + .03], [y0, y1], [-.42, .42], P.leaf, { uvs: 0 });
    box(A, sd > 0 ? [x - .04, x - .03] : [x + .03, x + .04], [y0 + .9, y1 - .2], [-.2, .2], P.gasket, { lit: false });
  });

  // glass in the far-side windows
  windowSlots().forEach(w => put(new THREE.PlaneGeometry(w.w, w.h), glassMat(), w.x, w.y, -(1.45 - IN * .6)));

  /* ---- floors and ceilings ---- */
  const floorOpt = { uvs: 2.2 };
  box(A, [-XV, XV], [.36, VEST], [-ZIN, ZIN], (p, n) => n.y > .5 ? P.floor : P.riser, floorOpt); // vestibule
  box(A, [XV, END], [.36, LOWER], [-1.27, 1.27], P.floor, floorOpt);                      // lower deck
  box(A, [-END, XTOP], [UPPER - .14, UPPER], [-1.36, 1.36], P.floor, floorOpt);         // upper deck, top of the stairs
  box(A, [-.65, .65], [VEST - .02, VEST + .003], [ZIN - .1, 1.47], P.riser, { uvs: 4 }); // threshold plate
  box(A, [-.65, .65], [VEST, VEST + .006], [1.38, 1.43], P.yellow);
  box(A, [-.66, .66], [VEST, VEST + .006], [-ZIN, -ZIN + .06], P.yellow);              // far door threshold
  box(A, [XV - .06, XV], [VEST, VEST + .006], [-ZIN, ZW], P.yellow);                    // the step down
  box(A, [-XV, XV], [CEIL, CEIL + .06], [-1.38, 1.38], P.ceil);                         // vestibule ceiling
  box(A, [XV + .05, END], [LCEIL, LCEIL + .1], [-1.38, 1.38], P.ceil);                        // lower deck ceiling

  /* ---- stairs up (far side, left) ---- */
  for (let k = 1; k < STEPS; k++) {
    const x1 = -XV - (k - 1) * RUN, x0 = x1 - RUN, top = VEST + k * RISE;
    box(A, [x0, x1], [VEST - .1, top], [-1.36, ZW - .025], (p, n) => n.y > .5 ? P.tread : P.riser, { uvs: 2.2 });
    box(A, [x1 - .05, x1 + .002], [top, top + .006], [-1.34, ZW - .03], P.yellow);
  }
  box(A, [XTOP - .05, XTOP + .002], [UPPER, UPPER + .006], [-1.34, ZW - .03], P.yellow);
  // the stair well's inner wall, its end wall at the top, and the partition facing the vestibule
  const partPaint = p => p.y < localFloor(p) + .22 ? P.kick : P.part;
  box(A, [XTOP, -XV], [VEST, ROOF], [ZW - .05, ZW], partPaint);
  box(A, [XTOP - .05, XTOP], [UPPER - .14, ROOF], [ZW - .05, ZIN], P.part);
  [-1, 1].forEach(sd => {
    const x0 = sd > 0 ? XV : -XV - .05, x1 = x0 + .05;
    box(A, [x0, x1], [sd > 0 ? LOWER : VEST, CEIL], [ZW - .05, ZIN], partPaint);
    box(A, [x0, x1], [sd > 0 ? LCEIL : CEIL, ROOF], [-1.38, ZW], P.part); // header over each opening
    box(A, [x0 - sd * .004, x1 - sd * .004], [1.96, 2.02], [ZW - .05, ZIN - .02], P.red); // red accent line
    pole(sd * (XV - .03), ZW - .03, VEST, CEIL); // pole at the corner of each opening
    // car number on the partition
    if (plateMat) put(new THREE.PlaneGeometry(.44, .22), plateMat, sd * (XV - .004), 2.3, .72, m => { m.rotation.y = -sd * Math.PI / 2; m.userData.noShadow = false; });
  });
  // handrails up the stairs
  const s0 = V(-XV - .1, VEST + .92, 0), s1 = V(XTOP - .05, UPPER + .92, 0);
  [ZW - .09, -1.3].forEach(z => { rail(s0.clone().setZ(z), s1.clone().setZ(z)); });
  [s0, s1].forEach(e => [ZW - .09, -1.3].forEach(z => rail(e.clone().setZ(z), e.clone().setZ(z + (z < -1 ? -.06 : .06)), .012))); // wall brackets

  /* ---- the vestibule: poles, the far doors, the destination display ---- */
  [-1, 1].forEach(sd => pole(sd * .46, .05, VEST, CEIL));
  rail(V(-.46, 2.35, .05), V(.46, 2.35, .05), .016);
  const ZF = -1.31; // inside face of the far doors
  [-1, 1].forEach(sd => {
    const a = sd > 0 ? 0 : -.66, b = a + .66, wx0 = sd > 0 ? .1 : -.55, wx1 = wx0 + .45, top = FLOOR + DOOR_H + .03;
    const z = [ZF - .04, ZF];
    const flat = { uvs: 0 };
    box(A, [a, b], [VEST, 1.4], z, P.leaf, flat); box(A, [a, b], [2.36, top], z, P.leaf, flat);
    box(A, [a, wx0], [1.4, 2.36], z, P.leaf, flat); box(A, [wx1, b], [1.4, 2.36], z, P.leaf, flat);
    // rubber gasket around the window
    box(A, [wx0 - .02, wx1 + .02], [1.38, 1.4], [ZF, ZF + .012], P.gasket); box(A, [wx0 - .02, wx1 + .02], [2.36, 2.38], [ZF, ZF + .012], P.gasket);
    box(A, [wx0 - .02, wx0], [1.4, 2.36], [ZF, ZF + .012], P.gasket); box(A, [wx1, wx1 + .02], [1.4, 2.36], [ZF, ZF + .012], P.gasket);
    put(new THREE.PlaneGeometry(.45, .96), glassMat(), (wx0 + wx1) / 2, 1.88, ZF - .02);
    // a vertical grab handle beside each door
    rail(V(sd * .8, 1.05, -1.24), V(sd * .8, 2.0, -1.24), .016);
  });
  box(A, [-.012, .012], [VEST, FLOOR + DOOR_H], [ZF, ZF + .015], P.gasket);
  box(A, [-.5, .5], [2.69, 2.93], [-1.38, -1.3], P.dark);
  if (ledMat) put(new THREE.PlaneGeometry(.88, .2), ledMat, 0, 2.81, -1.296, m => { m.userData.noShadow = false; });

  /* ---- light panels ---- */
  const glowBox = (x0, x1, y, z, w) => put(new THREE.BoxGeometry(x1 - x0, .02, w), mats.glow, (x0 + x1) / 2, y, z);
  glowBox(-.6, .6, CEIL - .012, 0, .34);
  glowBox(XTOP - .1, -XV - .15, ROOF - .03, -.8, .1);
  glowBox(-END + .15, XTOP - .1, ROOF - .03, -.1, .14);
  glowBox(XV + .25, END - .15, LCEIL - .012, -.32, .12);
  box(A, [-.66, .66], [CEIL - .01, CEIL], [-.21, .21], P.frame); // trim around the vestibule panel

  /* ---- seats ---- */
  // a bench of seats across z0..z1 whose occupants face `face` (+1 = toward +x)
  const bench = (cx, fy, z0, z1, face, solid = false) => {
    const n = Math.max(1, Math.round((z1 - z0) / .56)), w = (z1 - z0) / n;
    if (solid) { // a seat box: on the lower deck these cover the bogie wheels below
      box(A, [cx - .28, cx + .28], [fy, fy + .36], [z0 + .01, z1 - .01], (p, n) => p.y < fy + .08 && Math.abs(n.y) < .5 ? P.kick : P.seatFrame);
    } else { // a slim pedestal: a rail under the cushion on two legs
    box(A, [cx - .2, cx + .2], [fy + .3, fy + .36], [z0 + .05, z1 - .05], P.seatFrame);
    [z0 + .12, z1 - .12].forEach(z => box(A, [cx - .04, cx + .04], [fy, fy + .3], [z - .03, z + .03], P.seatFrame));
    box(A, [cx - .16, cx + .16], [fy, fy + .015], [z0 + .07, z0 + .17], P.seatFrame); box(A, [cx - .16, cx + .16], [fy, fy + .015], [z1 - .17, z1 - .07], P.seatFrame);
    }
    box(S, [cx - .25, cx + .25], [fy + .36, fy + .47], [z0 + .02, z1 - .02], P.white, { uvs: 4 });
    const bx = cx - face * .23, tilt = face * .13;
    const back = new THREE.Matrix4().makeTranslation(bx, fy + .47, 0).multiply(new THREE.Matrix4().makeRotationZ(tilt));
    const sub = (y, x = 0, z = 0) => new THREE.Matrix4().copy(back).multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    S.add(boxGeo(.11, .7, z1 - z0 - .04), sub(.35, -face * .01, (z0 + z1) / 2), P.white, { uvs: 4 });
    for (let k = 0; k < n; k++) A.add(boxGeo(.125, .16, w * .66), sub(.6, face * .005, z0 + w * (k + .5)), P.head);
    A.add(boxGeo(.05, .72, z1 - z0 - .02), sub(.34, -face * .07, (z0 + z1) / 2), P.shell, { uvs: 0 }); // moulded seat-back shell
  };
  // lower deck: a facing bay, its seats on boxes over the bogie's wheels (x = 2.05 and 3.45)
  bench(2.05, LOWER, -.04, 1.22, 1, true); bench(3.45, LOWER, -.04, 1.22, -1, true);
  bench(2.05, LOWER, -1.24, -.6, 1, true); bench(3.45, LOWER, -1.24, -.6, -1, true);
  // upper deck, at the top of the stairs
  bench(-END + .36, UPPER, -.04, 1.2, 1); bench(-END + .36, UPPER, -1.24, -.66, 1);
  // grab handles on the aisle corners

  /* ---- a passenger, baked in with the rest: one of the Mini Characters, posed seated ---- */
  const riders = [[2, 'sit-phone', 3.45, LOWER, -.92, -1], [5, 'sit', -END + .36, UPPER, -.95, 1], [9, 'sit-phone', 3.45, LOWER, -.92, -1], [7, 'sit', -END + .36, UPPER, -.95, 1]];
  const [kind, pose, cx, fy, z, face] = riders[idx % riders.length];
  A.add(posedGeometry(kind, pose), new THREE.Matrix4().compose(V(cx - face * .06, fy + .47 - HIP_SIT * SCALE * .88 + .01, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), face * Math.PI / 2), V(SCALE * .88, SCALE * .88, SCALE * .88)), 'vertex', { uvs: 0 }); // a little smaller, to suit the train seats

  const g = new THREE.Group(); g.name = 'interior';
  g.add(A.mesh(mats.base), S.mesh(mats.seat), ...extra);
  car.add(g);
  return mats;
}
