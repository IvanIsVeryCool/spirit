import * as THREE from 'three';
import { CAR_L, FLOOR, DOOR_W, DOOR_H, shellRing, windowSlots } from './train.js';
import { posedGeometry, SCALE, HIP_SIT, sitters } from './people.js';

// The inside of each car, seen through its open door and flown through when you board:
// a platform-level vestibule, stairs up to the upper deck, a step down to the lower deck,
// seats, grab poles, and passengers in the seats by the windows (you see them from the platform too).
// Both ends of the car have both decks: on the right the lower deck with an upper deck over it,
// on the left the stairs (far side) beside a lower saloon (near side) under the upper deck. No real-time lights: the light from the ceiling
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
const UPR = LCEIL + .1;             // upper deck floor over the lower deck (right)
const LTOP = UPPER - .14;           // underside of the upper deck on the left: the lower saloon's ceiling

const LIGHTS = [ // [from, to, intensity, reach, region the light can see: x0 x1 y0 y1 z0 z1]
  [V(-.5, CEIL - .02, 0), V(.5, CEIL - .02, 0), 1.6, 1.35, [-XV, XV, 0, CEIL + .02, -2, 2]],
  [V(-1.2, ROOF - .03, -.8), V(XTOP - .2, ROOF - .03, -.8), 1.1, 1.3, [-4, -XV, 0, 4.2, -2, ZW]],
  [V(XTOP - .1, ROOF - .03, -.1), V(-END + .1, ROOF - .03, -.1), 1.1, 1.4, [-4, XTOP + .03, UPPER - .2, 4.2, -2, 2]],
  [V(XV + .2, LCEIL - .02, -.3), V(END - .1, LCEIL - .02, -.3), 1.05, 1.2, [XV, 4, 0, LCEIL + .02, -2, 2]],
  [V(XV + .2, ROOF - .03, -.1), V(END - .1, ROOF - .03, -.1), 1.1, 1.4, [XV, 4, LCEIL + .05, 4.2, -2, 2]],         // upper deck, right
  [V(-XV - .2, LTOP - .02, .45), V(-END + .1, LTOP - .02, .45), 1.05, 1.2, [-4, -XV, 0, LTOP + .02, ZW, 2]],       // lower saloon, left
  [V(-XV - .2, ROOF - .03, .55), V(XTOP, ROOF - .03, .55), 1.1, 1.3, [XTOP + .03, -XV, LTOP - .05, 4.2, ZW, 2]]    // upper deck beside the stairs
].map(([a, b, I, r, box]) => ({ a, b, I, r, box }));
const AMB = new THREE.Color(.15, .135, .13), WARM = new THREE.Color(1, .8, .56);

function localFloor(p) {
  if (p.x > XV) return p.y > LCEIL ? UPR : LOWER;
  if (p.x < -XV) return p.z < ZW && p.x > XTOP ? VEST + Math.min(STEPS, Math.max(0, Math.ceil((-XV - p.x) / RUN))) * RISE : (p.y > LTOP - .05 ? UPPER : LOWER);
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
const POSED = {}; const posed = (kind, pose) => POSED[kind + pose] || (POSED[kind + pose] = posedGeometry(kind, pose)); // shared by every car
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
const steelMat = () => STEEL || (STEEL = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: .35, roughness: .42, envMapIntensity: .3 })); // (neutral: shinier, it took on the evening sky's purple)

/* shared textures: a barely-there grain for the laminate panels and rubber floors (clean, as on a new train: the
   owner asked for a super clean interior; the earlier dark speckle and blotches read as dirt), and a seat moquette */
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
    for (let k = 0; k < 700; k++) { const v = r() < .5 ? 255 : 234; x.fillStyle = `rgba(${v},${v},${v},${.2 + r() * .25})`; x.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1, 1); }
    x.fillStyle = '#f2f2f2'; [[0, 0], [126, 0], [0, 126], [126, 126]].forEach(([u, v]) => x.fillRect(u, v, 2, 2)); // flat surfaces sample this corner
  });
  // transit moquette: a deep red weave with a few short amber and darker dashes (kept quiet: busier read as noise)
  const moquette = mk(x => {
    x.fillStyle = '#9e1f26'; x.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 1600; k++) { x.fillStyle = r() < .5 ? 'rgba(70,8,14,.22)' : 'rgba(190,60,60,.16)'; x.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1, 1); }
    const cols = ['rgba(226,160,64,.75)', 'rgba(110,20,28,.9)', 'rgba(214,92,96,.8)'];
    for (let k = 0; k < 30; k++) {
      const cx = r() * 128, cy = r() * 128, a = (r() < .5 ? .6 : -.6) + (r() - .5) * .3, l = 3 + r() * 4;
      x.strokeStyle = cols[k % cols.length]; x.lineWidth = 1.2; x.lineCap = 'round';
      [-128, 0, 128].forEach(ox => [-128, 0, 128].forEach(oy => { x.beginPath(); x.moveTo(cx + ox, cy + oy); x.lineTo(cx + ox + Math.cos(a) * l, cy + oy + Math.sin(a) * l); x.stroke(); }));
    }
  });
  return (TEX = { speckle, moquette });
}

/* palette */
const P = {
  wall: C(0xf1ede5), dado: C(0xd2ccc1), ceil: C(0xf8f6f1), floor: C(0x6a707b), tread: C(0x50555f), riser: C(0x9aa0a8),
  yellow: C(0xe8b923), part: C(0xe0d9cb), kick: C(0x8a9099), red: C(0xc9272c), frame: C(0xb4b9c1), leaf: C(0xc6cbd2),
  gasket: C(0x22242a), seatFrame: C(0x555a63), shell: C(0xb3b7be), head: C(0xefe9de), dark: C(0x2b2d33), white: C(0xffffff)
};
const liningPaint = p => p.y > 3.6 || (p.x > -XV && p.x < XV && p.y > CEIL - .1) ? P.ceil : p.y < 1.0 ? P.dado : P.wall;

// Build one car's interior into `car` (car-local coordinates; the door faces +z).
// Returns the per-car materials so the station can brighten them as the doors open and on hover.
// The door at the lower deck's +x end into the cab, on a car with a cab behind it (the last car): in line with the aisle.
export const CAB_DOOR = { z0: -.6, z1: -.06, y0: LOWER, y1: LCEIL - .06, x: END };
// Every car has a sliding door at each end, both on the lower level, so you can walk the whole train (the drive, station.js):
// the right one is CAB_DOOR's (in line with the lower deck's aisle), the left one opens into the lower saloon's aisle.
export const LEFT_DOOR = { z0: -.24, z1: .26, y0: LOWER, y1: LTOP - .06, x: -END };
// the doorway from the vestibule into the lower saloon, through the left partition (a step down)
const DOORWAY = { z0: ZW, z1: .3, y1: LTOP - .02 };
// Where you can walk in a car (car-local): [x0, x1, z0, z1, floor], the floor a height or (x, z) => height. Kept clear of the
// seats, walls and poles; station.js keeps you inside them, matching each to the floor you're on (so the decks over and
// under each other don't mix).
export function walkRegions({ bikes = false } = {}) {
  const stairs = x => VEST + Math.min(STEPS - 1, Math.max(0, Math.ceil((-XV - x) / RUN - 1e-6))) * RISE;
  return [
    [-XV + .1, XV - .1, -1.2, 1.24, VEST],                                        // the vestibule
    [-XV - .14, -XV + .12, ZW + .06, DOORWAY.z1 - .04, x => x < -XV ? LOWER : VEST], // the doorway into the lower saloon, a step down
    [-END + .04, -XV - .02, ZW + .06, LEFT_DOOR.z1 - .02, LOWER],                // the lower saloon's aisle
    [-3.05, -2.4, ZW + .06, 1.15, LOWER],                                           // and the bay between its seats
    [XTOP + .02, -XV + .1, -1.26, ZW - .1, stairs],                                // the stairs (far side)
    [-3.05, XTOP + .02, -1.26, 1.26, UPPER],                                        // the upper deck at the top of the stairs
    [XTOP - .1, -2.38, ZW + .06, 1.26, UPPER], [-1.72, -XV - .1, ZW + .06, 1.26, UPPER], [-2.4, -1.7, ZW + .06, -.1, UPPER], // beside the stair well
    [XV - .1, XV + .14, -1.24, ZW - .1, x => x > XV ? LOWER : VEST],              // the step down to the lower deck
    [XV + .08, 1.72, -1.22, 1.22, LOWER], [XV + .08, END + .04, CAB_DOOR.z0 + .06, CAB_DOOR.z1 - .04, LOWER], [2.4, 3.05, -1.2, bikes ? -.1 : 1.2, LOWER],
    [-END - .04, -END + .1, LEFT_DOOR.z0 + .04, LEFT_DOOR.z1 - .04, LOWER]          // the left end door
  ];
}
// The Newsletter car: the aisle seat on the lower deck you sit in to read (kept free of passengers), facing +x.
export const READ_SEAT = { x: 2.05, y: LOWER + .47, z: .275, aisle: -.32 };
// The Events car: the next-stops screen on the vestibule's partition beside the step down, facing the vestibule (-x).
export const SCREEN = { x: XV - .035, y: 1.76, z: .5, w: .96, h: .54 };
export function buildInterior(car, { ledMat, plateMat, idx = 0, cab = false, free = false, screen = null, bikes = false }) {
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
    { const D = sd > 0 ? CAB_DOOR : LEFT_DOOR, h = new THREE.Path(); h.moveTo(D.z0, D.y0); h.lineTo(D.z1, D.y0); h.lineTo(D.z1, D.y1); h.lineTo(D.z0, D.y1); h.closePath(); sh.holes.push(h); } // (the door at each end)
    const g = new THREE.ShapeGeometry(sh, 2);
    A.add(g, new THREE.Matrix4().makeRotationY(sd > 0 ? -Math.PI / 2 : Math.PI / 2).premultiply(M4.makeTranslation(sd * END, 0, 0)).multiply(sd > 0 ? I4 : new THREE.Matrix4().makeScale(-1, 1, 1)), P.wall.clone().multiplyScalar(.5), { lit: false });
    // and its outside, facing the passage between the cars in the passage's colour (without it you saw through the wall from
    // there), or facing a cab (the first car's front, the last car's back) in a warm grey, the cab's back wall
    const toCab = (sd < 0 && idx === 0) || (sd > 0 && cab);
    A.add(g, new THREE.Matrix4().makeRotationY(sd > 0 ? Math.PI / 2 : -Math.PI / 2).premultiply(M4.makeTranslation(sd * END, 0, 0)).multiply(sd > 0 ? new THREE.Matrix4().makeScale(-1, 1, 1) : I4), toCab ? P.wall.clone().multiplyScalar(.62) : C(0x3c3f46), { lit: false, uvs: 0 });
  });
  // the end doors (and, on the last car, the one into the cab): a frame round each opening, and a leaf of its own that slides
  // aside into the wall as you come up to it (station.js); a window in it, both sides
  const leafMat = new THREE.MeshBasicMaterial({ color: P.leaf.clone().multiplyScalar(.82) }), winMat = new THREE.MeshBasicMaterial({ color: 0x2a2f3a });
  mats.endDoors = [1, -1].map(sd => {
    const D = sd > 0 ? CAB_DOOR : LEFT_DOOR, x = sd * END;
    const fx = sd > 0 ? [x - .04, x + .02] : [x - .02, x + .04]; // (the frame stands a little proud of the wall, inside)
    box(A, fx, [D.y1, D.y1 + .05], [D.z0 - .05, D.z1 + .05], P.gasket, { lit: false });
    [D.z0 - .05, D.z1].forEach(z => box(A, fx, [D.y0, D.y1], [z, z + .05], P.gasket, { lit: false }));
    const leaf = put(new THREE.BoxGeometry(.03, D.y1 - D.y0, D.z1 - D.z0), leafMat, x + sd * .035, (D.y0 + D.y1) / 2, (D.z0 + D.z1) / 2);
    [-1, 1].forEach(f => { const win = new THREE.Mesh(new THREE.PlaneGeometry(.26, .5), winMat); win.position.set(f * .017, .32, 0); win.rotation.y = f * Math.PI / 2; leaf.add(win); });
    leaf.userData.keep = true;
    return { leaf, sd, D, z: (D.z0 + D.z1) / 2, slide: -sd * (D.z1 - D.z0 + .06), open: 0 }; // (the right one slides toward the far side, the left toward the near)
  });
  if (cab) mats.cabDoor = mats.endDoors[0].leaf;

  // glass in the far-side windows
  windowSlots().forEach(w => put(new THREE.PlaneGeometry(w.w, w.h), glassMat(), w.x, w.y, -(1.45 - IN * .6)));

  /* ---- floors and ceilings ---- */
  const floorOpt = { uvs: 2.2 };
  box(A, [-XV, XV], [.36, VEST], [-ZIN, ZIN], (p, n) => n.y > .5 ? P.floor : P.riser, floorOpt); // vestibule
  box(A, [XV, END], [.36, LOWER], [-1.27, 1.27], P.floor, floorOpt);                      // lower deck
  box(A, [-END, XTOP], [LTOP, UPPER], [-1.36, 1.36], (p, n) => n.y < -.5 ? P.ceil : P.floor, floorOpt); // upper deck, top of the stairs
  box(A, [XTOP, -XV - .05], [LTOP, UPPER], [ZW, 1.36], (p, n) => n.y < -.5 ? P.ceil : P.floor, floorOpt); // ...and on beside the stair well, up to the partition (ending on its face, the two fought: black over the red line)
  box(A, [-END, -XV], [.36, LOWER], [ZW, 1.27], P.floor, floorOpt);                      // lower saloon, left
  box(A, [-END, XTOP], [LOWER, LTOP], [ZW - .05, ZW], P.part);                          // its far wall, under the upper deck
  box(A, [XV + .05, END], [UPR - .012, UPR], [-1.38, 1.38], P.floor, floorOpt);          // upper deck floor, right (a skin on the ceiling's slab, not on its top face)
  box(A, [-.65, .65], [VEST - .02, VEST + .003], [ZIN - .1, 1.47], P.riser, { uvs: 4 }); // threshold plate
  box(A, [-.65, .65], [VEST, VEST + .012], [1.38, 1.43], P.yellow);
  box(A, [-.66, .66], [VEST, VEST + .012], [-ZIN, -ZIN + .06], P.yellow);              // far door threshold
  box(A, [XV - .06, XV + .006], [VEST, VEST + .012], [-ZIN, ZW], P.yellow);                    // the step down
  box(A, [-XV, XV], [CEIL, CEIL + .06], [-1.38, 1.38], P.ceil);                         // vestibule ceiling
  box(A, [XV + .05, END], [LCEIL, UPR - .012], [-1.38, 1.38], P.ceil);                        // lower deck ceiling

  /* ---- stairs up (far side, left) ---- */
  for (let k = 1; k < STEPS; k++) {
    const x1 = -XV - (k - 1) * RUN, x0 = x1 - RUN, top = VEST + k * RISE;
    box(A, [x0, x1], [VEST - .1, top], [-1.36, ZW - .025], (p, n) => n.y > .5 ? P.tread : P.riser, { uvs: 2.2 });
    box(A, [x1 - .05, x1 + .008], [top, top + .012], [-1.34, ZW - .03], P.yellow); // (clear of the tread and riser, or it flickers)
  }
  box(A, [XTOP - .05, XTOP + .008], [UPPER, UPPER + .012], [-1.34, ZW - .03], P.yellow);
  // the stair well's inner wall, its end wall at the top, and the partition facing the vestibule
  const partPaint = p => p.y < localFloor(p) + .22 ? P.kick : P.part;
  box(A, [XTOP, -XV - .05], [VEST, ROOF], [ZW - .05, ZW], partPaint); // (meets the partition below, rather than overlapping it)
  [-1, 1].forEach(sd => {
    const x0 = sd > 0 ? XV : -XV - .05, x1 = x0 + .05;
    if (sd > 0) box(A, [x0, x1], [LOWER, ROOF], [ZW - .05, ZIN], partPaint); // up to the roof: it closes off the decks either side
    else { // (on the left, with the doorway down into the lower saloon)
      box(A, [x0, x1], [VEST, ROOF], [ZW - .05, DOORWAY.z0], partPaint); box(A, [x0, x1], [VEST, ROOF], [DOORWAY.z1, ZIN], partPaint);
      box(A, [x0, x1], [DOORWAY.y1, ROOF], [DOORWAY.z0, DOORWAY.z1], partPaint);
      box(A, [-XV - .006, -XV + .06], [VEST, VEST + .012], [DOORWAY.z0 + .01, DOORWAY.z1 - .01], P.yellow); // the step's edge
    }
    box(A, [x0, x1], [sd > 0 ? LCEIL : CEIL, ROOF], [-1.38, ZW - .05], P.part); // header over each opening (from where the partition ends)
    box(A, [x0 - .012, x1 + .012], [1.96, 2.02], [ZW - .062, ZIN - .02], P.red); // red accent line, wrapped round the partition (flush with it, faces flickered)
    pole(sd * (XV - .03), ZW - .03, VEST, CEIL); // pole at the corner of each opening
    // car number on the partition
    if (screen && sd > 0) { // the next-stops screen: a dark bezel, the panel, a mounting bar up to the ceiling's edge
      const S = SCREEN;
      box(A, [S.x - .04, XV], [S.y - S.h / 2 - .035, S.y + S.h / 2 + .035], [S.z - S.w / 2 - .035, S.z + S.w / 2 + .035], P.dark, { lit: false });
      put(new THREE.PlaneGeometry(S.w, S.h), screen, S.x - .041, S.y, S.z, m => { m.rotation.y = -Math.PI / 2; m.userData.keep = true; });
    }
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
  glowBox(XV + .25, END - .15, ROOF - .03, -.1, .14);
  glowBox(-END + .15, -XV - .25, LTOP - .012, .45, .12);
  glowBox(XTOP + .05, -XV - .15, ROOF - .03, .55, .1);
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
    for (let k = 0; k < n; k++) seats.push({ cx, fy, z: z0 + w * (k + .5), face, z0, z1, first: k === 0 });
  };
  const seats = [];
  // lower deck: a facing bay, its seats on boxes over the bogie's wheels (x = 2.05 and XE); the end rows stand far enough in that
  // their leaning backs stay inside the end walls (at 3.45 their tops poked through into the passage between the cars)
  const XE = 3.33;
  if (!bikes) { bench(2.05, LOWER, -.04, 1.22, 1, true); bench(XE, LOWER, -.04, 1.22, -1, true); }
  bench(2.05, LOWER, -1.24, -.6, 1, true); bench(XE, LOWER, -1.24, -.6, -1, true);
  // upper deck, at the top of the stairs
  bench(-XE, UPPER, -.04, 1.2, 1); bench(-XE, UPPER, -1.24, -.66, 1);
  // the upper deck over the lower one (right), facing bays like the deck below
  bench(2.05, UPR, -.04, 1.2, 1); bench(XE, UPR, -.04, 1.2, -1); bench(2.05, UPR, -1.24, -.6, 1); bench(XE, UPR, -1.24, -.6, -1);
  // beside the stair well, facing the seats at the top of the stairs
  bench(-2.05, UPPER, -.04, 1.2, -1);
  // the lower saloon on the left, over the other bogie
  bench(-2.05, LOWER, .32, 1.22, -1, true); bench(-XE, LOWER, .32, 1.22, 1, true); // (an aisle beside them, from the end door to the doorway)
  // grab handles on the aisle corners

  /* ---- the things a real commuter car has ---- */
  // where the lining is at a height (its near side, z > 0): for things fixed to the walls
  const wallZ = y => { let best = 0, d = 1e9; ring.forEach(q => { if (q.z > 0 && Math.abs(q.y - y) < d) { d = Math.abs(q.y - y); best = q.z; } }); return best; };
  // luggage racks over the window seats on both upper decks, both sides: a shelf on brackets, a lip along its edge
  [[-END + .1, XTOP - .05, UPPER], [XV + .12, END - .1, UPR]].forEach(([x0, x1, fl]) => {
    const y = fl + 1.32, zw = wallZ(y + .05) - .02;
    [1, -1].forEach(sd => {
      const z = [sd * (zw - .26), sd * zw].sort((a, b) => a - b);
      box(A, [x0, x1], [y, y + .025], z, P.frame, { uvs: 0 });
      box(A, [x0, x1], [y + .025, y + .07], sd > 0 ? [z[0], z[0] + .02] : [z[1] - .02, z[1]], P.frame, { uvs: 0 });
      for (let x = x0 + .15; x < x1; x += .9) box(A, [x - .015, x + .015], [y - .14, y], sd > 0 ? [zw - .05, zw] : [-zw, -zw + .05], P.seatFrame);
    });
  });
  // tables between the facing seats in the bays (not where you sit to read the newsletter)
  const table = (x0, x1, fl, z0, z1) => { box(A, [x0, x1], [fl + .7, fl + .74], [z0, z1], P.frame, { uvs: 0 }); box(A, [(x0 + x1) / 2 - .03, (x0 + x1) / 2 + .03], [fl, fl + .7], [z1 - .12, z1 - .06], P.seatFrame); };
  if (!bikes && !free) table(2.44, 3.0, LOWER, .5, 1.2);
  table(2.44, 3.0, LOWER, -1.22, -.78); table(2.44, 3.0, UPR, .5, 1.2); table(2.44, 3.0, UPR, -1.22, -.78);
  // the bike car (Car 3): bikes stood in a row along the near side of the lower deck, against a padded rail, strapped in;
  // a bike sign on the partition
  if (bikes) {
    const zr = wallZ(LOWER + 1) - .05;
    box(A, [1.75, 3.7], [LOWER + .82, LOWER + .94], [zr - .1, zr], P.dark); box(A, [1.75, 3.7], [LOWER + .28, LOWER + .36], [zr - .08, zr], P.dark);
    const tyre = new THREE.TorusGeometry(.27, .03, 6, 18), cols = [0xc9272c, 0x2c5a8a, 0xe8b923, 0x2f6b4a, 0xe8e4da, 0x1d1f26], frame = (a, b, r = .022) => { const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Matrix4().compose(a.clone().addScaledVector(v, .5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), v.clone().normalize()), V(1, 1, 1)); return [new THREE.CylinderGeometry(r, r, v.length(), 6), m]; };
    for (let i = 0; i < 5; i++) {
      const bx = 1.95 + i * .42, lean = (i % 2 ? 1 : -1) * .04, col = C(cols[i]), base = new THREE.Matrix4().compose(V(bx, LOWER, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, lean)), V(1, 1, 1));
      const z0 = .12, z1 = zr - .3, y = .3, bb = V(0, y, (z0 + z1) / 2 + .02), seat = V(0, .82, (z0 + z1) / 2 + .14), ht = V(0, .84, z0 + .2);
      [z0, z1].forEach(z => A.add(tyre, new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().compose(V(0, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 2), V(1, 1, 1))), P.gasket));
      [[bb, seat], [seat, ht], [bb, ht], [bb, V(0, y, z1)], [seat, V(0, y, z1)], [ht, V(0, y, z0)]].forEach(([a, b]) => { const [g, m] = frame(a, b); A.add(g, new THREE.Matrix4().multiplyMatrices(base, m), col); });
      const [hg, hm] = frame(ht.clone().add(V(-.22, .1, 0)), ht.clone().add(V(.22, .1, 0)), .014); A.add(hg, new THREE.Matrix4().multiplyMatrices(base, hm), P.gasket);
      box(A, [bx - .07, bx + .07], [LOWER + .86, LOWER + .9], [zr - .3, zr - .08], P.yellow); // its strap
    }
    if (plateMat) { // a blue bike sign on the partition, facing the lower deck
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#2a5aa0'; x.beginPath(); x.roundRect(4, 4, 120, 120, 14); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 7; x.lineCap = x.lineJoin = 'round'; [[38, 78], [92, 78]].forEach(([cx, cy]) => { x.beginPath(); x.arc(cx, cy, 20, 0, 7); x.stroke(); });
      x.beginPath(); x.moveTo(38, 78); x.lineTo(56, 48); x.lineTo(80, 48); x.lineTo(92, 78); x.moveTo(56, 48); x.lineTo(66, 78); x.lineTo(80, 48); x.moveTo(50, 40); x.lineTo(62, 40); x.moveTo(78, 48); x.lineTo(82, 36); x.lineTo(90, 36); x.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      put(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ map: t }), XV + .056, 1.35, .7, m => { m.rotation.y = Math.PI / 2; });
    }
  }
  // a grab bar along the top of every seat back, and, in the vestibule, the intercom and the emergency handle by the doorway
  seats.forEach(st => { if (!st.first) return; rail(V(st.cx - st.face * .3, st.fy + 1.2, st.z0 + .04), V(st.cx - st.face * .3, st.fy + 1.2, st.z1 - .04), .011); });
  [-1, 1].forEach(sd => { const x = sd * (DOOR_W / 2 + .2), zw = wallZ(1.5) - .02;
    box(A, [x - .07, x + .07], [1.38, 1.6], [zw - .04, zw], sd > 0 ? P.yellow : P.red); box(A, [x - .045, x + .045], [1.44, 1.54], [zw - .05, zw - .04], P.dark); });
  // a display hung at the top of the stairs (the car's own destination sign), facing you as you come up
  if (ledMat) { box(A, [XTOP - .19, XTOP - .17], [ROOF - .3, ROOF - .02], [-.78, -.72], P.dark); box(A, [XTOP - .2, XTOP - .15], [ROOF - .46, ROOF - .3], [-1.05, -.45], P.dark);
    put(new THREE.PlaneGeometry(.56, .112), ledMat, XTOP - .145, ROOF - .38, -.75, m => { m.rotation.y = Math.PI / 2; m.userData.noShadow = false; }); }

  /* ---- passengers, baked in with the rest: Mini Characters posed seated, mostly by the platform-side windows ---- */
  let seed = 7 + idx * 131; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const slim = sitters(), k = SCALE * .88; // a little smaller, to suit the train seats
  seats.forEach(st => {
    if (free && st.fy === LOWER && st.z > 0 && (st.cx === READ_SEAT.x ? Math.abs(st.z - READ_SEAT.z) < .1 : st.cx === XE)) return; // your seat, and the two facing it
    if (r() > (st.z > .5 ? .72 : st.z > 0 ? .4 : .22)) return; // window seats fill first; a few aisle and far-side seats too
    if (st.fy === LOWER && st.cx < -XV && st.z < .7 && r() > .2) return; // (the lower saloon's seats by its narrow aisle stay mostly free: you walk past them)
    if (st.fy === UPPER && st.cx > XTOP - .8 && st.cx < -XV + .3 && st.z < .75) return; // (beside the stair well: a hand poked through its wall)
    const kind = slim[Math.floor(r() * slim.length)], pose = r() < .45 ? 'sit-phone' : 'sit';
    A.add(posed(kind, pose), new THREE.Matrix4().compose(V(st.cx - st.face * .06, st.fy + .47 - HIP_SIT * k + .01, st.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), st.face * Math.PI / 2), V(k, k, k)), 'vertex', { uvs: 0 });
  });

  const g = new THREE.Group(); g.name = 'interior';
  g.add(A.mesh(mats.base), S.mesh(mats.seat), ...extra);
  car.add(g);
  return mats;
}
