import * as THREE from 'three';
import { SKIN, HAIR, TOPS, PANTS, headParts, torsoGeometry, BODY_K, HEAD_K, HEAD_DROP } from './scenery.js';

// Everyone on and around the platform who isn't you: people waiting on the benches and by the yellow line,
// people walking past (some with a phone, a suitcase or a dog), cyclists, an e-bike and an e-scooter on the
// path behind the planters, and the odd cyclist on the road beyond the fence.
// Every body part is one InstancedMesh shared by the whole crowd, posed each frame from a few joint
// positions, so the crowd costs a fixed ~27 draw calls however many people are in view.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 29; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------- part geometry: the same shapes and sizes as person() in scenery.js ---------- */
const T = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
function bake(parts) { // [[geometry, matrix, colour]] -> one non-indexed geometry with vertex colours
  const pos = [], nor = [], col = [], v = new THREE.Vector3();
  parts.forEach(([geo, m = new THREE.Matrix4(), c = 0xffffff]) => {
    const g = geo.index ? geo.toNonIndexed() : geo, nm = new THREE.Matrix3().getNormalMatrix(m), cc = new THREE.Color(c), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); col.push(cc.r, cc.g, cc.b);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}
const cap = (r, len, rs = 8) => new THREE.CapsuleGeometry(r, len, 3, rs);
const hang = (r, len) => bake([[cap(r, len), T(0, -len / 2, 0)]]); // a limb hanging from its joint
const sph = (r, w = 12, h = 10, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
const tube = (a, b, r, c) => { const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Matrix4().compose(a.clone().addScaledVector(d, .5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()), V(1, 1, 1)); return [new THREE.CylinderGeometry(r, r, d.length(), 8), m, c]; };
const BOX = (w, h, d, m, c) => [new THREE.BoxGeometry(w, h, d), m, c];
const L = { thigh: .34, shin: .36, upper: .28, fore: .26, ankle: .1 }; // short toy legs

function geometries() {
  const eye = 0x17120f, sole = 0x2a2a2e, dark = 0x1e2026, grey = 0x9aa0a8;
  const frame = (pts, extra = []) => bake([
    tube(pts.bb, pts.seat, .022), tube(pts.seat, pts.ht, .02), tube(pts.bb, pts.hl, .026), tube(pts.hl, pts.ht, .028),
    ...[-1, 1].flatMap(sd => [tube(pts.bb, pts.ra.clone().setX(sd * .055), .014), tube(pts.seat, pts.ra.clone().setX(sd * .055), .012), tube(pts.hl, pts.fa.clone().setX(sd * .045), .016)]),
    tube(pts.seat, pts.seat.clone().add(V(0, .06, .02)), .014, grey), tube(pts.ht, V(0, .97, -.4), .016, grey), tube(V(-.24, .97, -.38), V(.24, .97, -.38), .013, dark),
    ...[-1, 1].map(sd => tube(V(sd * .18, .97, -.38), V(sd * .25, .97, -.38), .02, dark)),
    BOX(.12, .045, .26, T(0, .93, .22), dark), ...extra
  ]);
  const H = headParts(), HK = new THREE.Matrix4().makeTranslation(0, -HEAD_DROP, 0).multiply(new THREE.Matrix4().makeScale(HEAD_K, HEAD_K, HEAD_K)), tint = ([g, m, c]) => [g, HK.clone().multiply(m), typeof c === 'string' ? 0xffffff : c];
  const bike = { bb: V(0, .3, .02), seat: V(0, .86, .2), ht: V(0, .86, -.42), hl: V(0, .7, -.45), ra: V(0, .34, .55), fa: V(0, .34, -.55) };
  return {
    // the head and hair from scenery.js; skin and hair colours come from each person's instance colour
    head: bake(H.face.map(tint)), hair: bake(H.short.map(tint)), longHair: bake(H.long.map(tint)), hat: bake(H.hat.map(tint)),
    torso: bake([[torsoGeometry(), T()]]),
    pelvis: bake([[cap(.1, .2), T(0, 0, 0, 0, 0, Math.PI / 2)]]),
    upper: hang(.06, L.upper), fore: hang(.05, L.fore), hand: bake([[sph(.052, 12, 10), T(0, -.02)]]),
    thigh: hang(.08, L.thigh), shin: hang(.062, L.shin),
    shoe: bake([BOX(.11, .09, .27, T(0, -.055, -.07)), BOX(.115, .025, .28, T(0, -.0875, -.07), sole)]),
    bag: bake([[cap(.13, .14), T(0, 0, 0, 0, 0, 0, 1.15, 1, .6)]]),
    phone: bake([BOX(.075, .15, .012, T(), 0x15161b)]),
    screen: bake([[new THREE.PlaneGeometry(.062, .13), T(0, 0, .0065)]]),
    book: bake([BOX(.26, .19, .03, T(), 0xb8402e), BOX(.24, .175, .032, T(0, .006), 0xf3eee2)]),
    // a wheeled suitcase, its origin on the ground under the wheels, handle extended
    suitcase: bake([BOX(.4, .54, .23, T(0, .33, 0)), BOX(.36, .02, .2, T(0, .45, 0), 0x777777), ...[-1, 1].flatMap(sd => [BOX(.014, .5, .014, T(sd * .08, .84, .1), dark), [new THREE.CylinderGeometry(.035, .035, .03, 12), T(sd * .15, .035, .09, 0, 0, Math.PI / 2), dark]]), BOX(.19, .028, .032, T(0, 1.09, .1), dark)]),
    dogBody: bake([[cap(.11, .4, 10), T(0, 0, 0, Math.PI / 2)], [cap(.075, .14), T(0, .1, -.26, .7)]]),
    dogHead: bake([[sph(.1), T(0, 0, 0, 0, 0, 0, 1, .95, 1.1)], [cap(.055, .07), T(0, -.03, -.1, Math.PI / 2)], [sph(.024, 8, 6), T(0, -.015, -.175), 0x111111], ...[-1, 1].map(sd => BOX(.05, .1, .02, T(sd * .07, .03, .02, .2, 0, sd * .35), 0x8a6a50))]),
    dogLeg: hang(.034, .27), dogTail: bake([[cap(.024, .18), T(0, .09, 0)]]),
    leash: bake([[new THREE.CylinderGeometry(.007, .007, 1, 5), T(0, .5)]]),
    wheel: bake([[new THREE.TorusGeometry(.33, .028, 8, 32), T(0, 0, 0, 0, Math.PI / 2), 0x1b1c20], [new THREE.TorusGeometry(.3, .01, 6, 32), T(0, 0, 0, 0, Math.PI / 2), grey], [new THREE.CylinderGeometry(.025, .025, .09, 10), T(0, 0, 0, 0, 0, Math.PI / 2), grey],
      ...Array.from({ length: 8 }, (_, k) => BOX(.004, .58, .004, T(0, 0, 0, k * Math.PI / 8), 0xc8ccd2))]),
    bike: frame(bike),
    ebike: frame(bike, [BOX(.09, .11, .4, new THREE.Matrix4().compose(V(0, .52, -.2), new THREE.Quaternion().setFromUnitVectors(V(0, 0, -1), V(0, .4, -.47).normalize()), V(1, 1, 1)), 0x2a2c33), BOX(.2, .02, .34, T(0, .78, .5), dark), tube(V(0, .78, .64), V(0, .34, .55), .012, dark), [new THREE.CylinderGeometry(.06, .06, .08, 14), T(0, .3, .02, 0, 0, Math.PI / 2), 0x2a2c33]]),
    scooter: bake([BOX(.16, .05, .76, T(0, .14, 0), 0x1d1f26), tube(V(0, .16, -.38), V(0, 1.04, -.44), .02), tube(V(-.22, 1.05, -.44), V(.22, 1.05, -.44), .014, dark), ...[-1, 1].map(sd => tube(V(sd * .16, 1.05, -.44), V(sd * .23, 1.05, -.44), .02, dark)), BOX(.05, .03, .14, T(0, .17, .39), dark)]),
    crank: bake([BOX(.02, .17, .025, T(-.07, .085)), BOX(.02, .17, .025, T(.07, -.085)), BOX(.09, .022, .06, T(-.11, .17)), BOX(.09, .022, .06, T(.11, -.17)), [new THREE.CylinderGeometry(.1, .1, .01, 24), T(.045, 0, 0, 0, 0, Math.PI / 2), 0x3a3c42]])
  };
}

/* ---------- instanced pools ---------- */
const WHITE = new THREE.Color(1, 1, 1);
class Pool {
  constructor(scene, geo, max, { rough = .8, glow = false, cast = true } = {}) {
    const mat = glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fc4ff).multiplyScalar(.9) }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough });
    const m = this.mesh = new THREE.InstancedMesh(geo, mat, max);
    for (let i = 0; i < max; i++) m.setColorAt(i, new THREE.Color(1, 1, 1));
    m.frustumCulled = false; m.userData.keep = true; if (cast) m.userData.cast = true; else m.userData.noShadow = true;
    this.n = 0; this.max = max; scene.add(m);
  }
  push(mat, col = WHITE) { if (this.n >= this.max) return; this.mesh.setMatrixAt(this.n, mat); this.mesh.setColorAt(this.n, col); this.n++; }
  flush() { const m = this.mesh; m.count = this.n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; this.n = 0; }
}

/* ---------- posing ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Euler(), UP = V(0, -1, 0);
// a knee or elbow for a two-bone limb from p to target t, bending toward +n (s = 1: forward, like a knee)
function ik(p, t, a, b, s, out) {
  const dy = t.y - p.y, dz = t.z - p.z, d = Math.min(Math.hypot(dy, dz), a + b - 1e-4) || 1e-4, ca = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))), sa = Math.sqrt(1 - ca * ca);
  const uy = dy / d, uz = dz / d, ny = -uz * s, nz = uy * s;
  return out.set(lerp(p.x, t.x, a / (a + b)), p.y + a * (uy * ca + ny * sa), p.z + a * (uz * ca + nz * sa));
}
const J = () => ({ pelvis: V(0, 0, 0), lean: 0, twist: 0, roll: 0, sh: [V(0, 0, 0), V(0, 0, 0)], el: [V(0, 0, 0), V(0, 0, 0)], ha: [V(0, 0, 0), V(0, 0, 0)], hip: [V(0, 0, 0), V(0, 0, 0)], kn: [V(0, 0, 0), V(0, 0, 0)], an: [V(0, 0, 0), V(0, 0, 0)], foot: [0, 0], neck: V(0, 0, 0), hy: 0, hp: 0, hr: 0 });
const torsoM = new THREE.Matrix4(), _v = new THREE.Vector3();
function torsoFrame(j) { return torsoM.compose(j.pelvis, _q.setFromEuler(_e.set(j.lean, j.twist, j.roll, 'YXZ')), _s.set(1, 1, 1)); }
function shoulders(j) { torsoFrame(j); [-1, 1].forEach((sd, i) => j.sh[i].set(sd * .235, .49, 0).applyMatrix4(torsoM)); j.neck.set(0, .56, 0).applyMatrix4(torsoM); }
function hips(j) { [-1, 1].forEach((sd, i) => j.hip[i].set(j.pelvis.x + sd * .1, j.pelvis.y, j.pelvis.z)); }
// a leg swung by angles: thigh pitch th (forward +), knee bend kn
function leg(j, i, th, kn) {
  const h = j.hip[i];
  j.kn[i].set(h.x, h.y - L.thigh * Math.cos(th), h.z - L.thigh * Math.sin(th));
  j.an[i].set(h.x, j.kn[i].y - L.shin * Math.cos(th - kn), j.kn[i].z - L.shin * Math.sin(th - kn));
}
function arm(j, i, al, el, out = .02) {
  const s = j.sh[i], sd = i ? 1 : -1;
  j.el[i].set(s.x + sd * out, s.y - L.upper * Math.cos(al), s.z - L.upper * Math.sin(al));
  j.ha[i].set(j.el[i].x - sd * out * .5, j.el[i].y - L.fore * Math.cos(al + el), j.el[i].z - L.fore * Math.sin(al + el));
}

/* ---------- the crowd ---------- */
const Col = h => new THREE.Color(h);
function outfit(o = {}) {
  const r = rnd();
  return {
    top: Col(o.top ?? pick(TOPS)), pants: Col(o.pants ?? pick(PANTS)), skin: Col(o.skin ?? pick(SKIN)), hair: Col(o.hairCol ?? pick(HAIR)),
    style: o.style ?? (r < .25 ? 'long' : r < .4 ? 'hat' : 'short'), hat: Col(o.hat ?? pick([0x1f2a4d, 0x7a2a2a, 0x2f4a3a, 0x3a2f4a, 0xa8832e])),
    bag: o.bag === undefined ? (rnd() < .35 ? Col(pick([0x2b2f3a, 0x1d3a5a, 0x5a2f2f, 0x3a4a3a])) : null) : (o.bag ? Col(o.bag) : null),
    scale: (o.scale ?? .93 + rnd() * .1) * BODY_K, shoe: Col(o.shoe ?? pick([0xd9d5cc, 0xcfc9be, 0x3a3c44, 0x8a6a4a, 0xb9bcc4]))
  };
}

export class Crowd {
  constructor(st) {
    this.st = st; const G = geometries(), s = st.scene, mobile = st.mobile;
    const N = mobile ? 15 : 22, P = (k, n, o) => new Pool(s, G[k], n, o);
    this.p = {
      head: P('head', N), hair: P('hair', N), longHair: P('longHair', N), hat: P('hat', N), torso: P('torso', N), pelvis: P('pelvis', N), bag: P('bag', N),
      upper: P('upper', N * 2), fore: P('fore', N * 2), hand: P('hand', N * 2), thigh: P('thigh', N * 2), shin: P('shin', N * 2), shoe: P('shoe', N * 2),
      phone: P('phone', 8, { rough: .3 }), screen: P('screen', 8, { glow: true, cast: false }), book: P('book', 2),
      suitcase: P('suitcase', 3, { rough: .5 }), dogBody: P('dogBody', 2), dogHead: P('dogHead', 2), dogLeg: P('dogLeg', 8), dogTail: P('dogTail', 2), leash: P('leash', 2, { cast: false }),
      wheel: P('wheel', 8, { rough: .5 }), bike: P('bike', 3, { rough: .35 }), ebike: P('ebike', 2, { rough: .35 }), scooter: P('scooter', 2, { rough: .4 }), crank: P('crank', 4, { rough: .4 })
    };
    this.j = J(); this.root = new THREE.Matrix4();
    const F = st.FLOOR, front = st.front, PP = st.P, benchZ = front + 5.8;
    // lanes far enough forward that, from the resting camera, passers-by stay below the doors on screen
    // (phones sit closer to the train, so their lanes are nearer; bikes only use the forecourt path on desktop)
    this.lanes = { walk: mobile ? [front + 11.3, front + 12] : [front + 16.4, front + 17.2], ride: [front + 19.8, front + 20.6], road: [-8.85, -12.4] };
    // people waiting: on the two outer benches, and standing back from the yellow line between the doors
    const idle = [
      [-2 * PP - .55, benchZ, 0, 'sit', 'phone', { bag: 0x2b2f3a, style: 'short' }], [-2 * PP + .6, benchZ, 0, 'sit', 'lap', { style: 'long', scale: .97, bag: 0 }],
      [2 * PP - .5, benchZ, 0, 'sit', 'book', { style: 'hat', hat: 0x7a2a2a, bag: 0 }], [2 * PP + .62, benchZ, 0, 'sit', 'phone', { style: 'long', scale: .96, bag: 0 }],
      [-PP - .3, front + 2.3, .3, 'stand', 'pockets', { bag: 0x1d3a5a, style: 'short' }], [PP + .4, front + 2.6, -.2, 'stand', 'phone', { style: 'long', scale: .96, bag: 0 }],
      [-3 * PP - 1.6, front + 3.2, .9, 'stand', 'pockets', { style: 'hat', hat: 0x1f2a4d, bag: 0 }], [3 * PP + 1.8, front + 2.9, -.5, 'stand', 'phone', { bag: 0x5a2f2f, style: 'short' }]
    ];
    this.idle = idle.map(([x, z, yaw, pose, hands, o], i) => ({ x, y: F, z, yaw, pose, hands, look: 0, pitch: hands === 'phone' || hands === 'book' ? .55 : 0, target: 0, next: 2 + rnd() * 4, seed: rnd() * 10, o: outfit({ top: TOPS[i % TOPS.length], skin: SKIN[(i * 3) % SKIN.length], ...o }) }));
    // people and riders passing by; each slot waits a while, then someone new comes through
    const slot = (kind, wait) => ({ kind, on: false, wait, x: 0, dir: 1, v: 0, ph: 0 });
    this.walkers = Array.from({ length: mobile ? 4 : 7 }, (_, i) => slot('walk', 1 + i * 3.5 + rnd() * 3));
    this.riders = mobile ? [] : [slot('bike', 4), slot('scooter', 13), slot('ebike', 22)];
    this.road = [slot('roadbike', 9), ...(mobile ? [] : [slot('roadbike', 30)])];
    this.dogInUse = false; this.span = 44;
    // the platform is already busy when you arrive
    this.walkers.forEach((a, i) => { if (i % 2 === 0) this._spawn(a, true); });
    if (this.riders[0]) this._spawn(this.riders[0], true);
  }

  /* spawning */
  _spawn(a, mid = false) {
    const F = this.st.FLOOR; a.on = true; a.dir = rnd() < .5 ? 1 : -1; a.x = mid ? (rnd() - .5) * this.span * 1.4 : -a.dir * this.span; a.ph = rnd() * 6; a.look = 0; a.glance = 0; a.nextGlance = 0; a.hurry = 1;
    if (a.kind === 'walk') {
      const r = rnd(); a.prop = r < .18 ? 'case' : r < .32 && !this.dogInUse ? 'dog' : r < .5 ? 'phone' : null;
      if (a.prop === 'dog') { this.dogInUse = true; a.dogCol = Col(pick([0x8a6a4a, 0x2a2420, 0xd8c8a8, 0x6a4a30])); a.dph = 0; }
      a.v = a.prop === 'phone' ? .95 + rnd() * .2 : 1.15 + rnd() * .4; a.y = F; a.z = this.lanes.walk[a.dir > 0 ? 0 : 1] + (rnd() - .5) * .2;
      a.o = outfit({ bag: a.prop === 'case' ? 0 : undefined });
    } else {
      const road = a.kind === 'roadbike', type = road ? 'bike' : a.kind;
      a.type = type; a.y = road ? 0 : F; a.z = (road ? this.lanes.road : this.lanes.ride)[a.dir > 0 ? 0 : 1];
      a.v = type === 'scooter' ? 3.6 + rnd() * .8 : type === 'ebike' ? 5.6 + rnd() : 4.2 + rnd() * 1.4; a.crank = rnd() * 6; a.spin = 0;
      a.o = outfit({ style: type === 'scooter' && rnd() < .5 ? 'short' : 'hat', hat: pick([0xc9272c, 0x9aa0a8, 0x1f2a4d, 0x2a2d35, 0xd9a520]), bag: rnd() < .4 ? pick([0x2b2f3a, 0x1d3a5a]) : 0 });
      a.o.scale = BODY_K * 1.04; // riders and their bikes are drawn at the same toy scale
      a.frame = Col(pick(type === 'scooter' ? [0x2a2d35, 0x3f8f8a, 0xd9d6d0] : [0x2c5a8a, 0xc9272c, 0x2f4a3a, 0xe8e4da, 0x1d1f26, 0xe8b923]));
    }
  }

  update(t, dt) {
    const st = this.st, p = this.p, fl = st.flight;
    // where the boarding camera crosses a lane at depth z (it flies in a straight line toward the door)
    const flX = z => { if (!fl) return null; const u = (fl.p0.z - z) / (fl.p0.z - fl.p1.z); return u < 0 || u > 1 ? null : fl.p0.x + (fl.p1.x - fl.p0.x) * u; };
    // people waiting
    const moving = st.trainX > .5, nose = st.cars[0].position.x + st.trainX - st.CAR_L / 2 - st.NOSE_L;
    this.idle.forEach(a => {
      const busy = a.hands === 'phone' || a.hands === 'book';
      let yaw, pitch = a.pitch;
      if (moving && st.trainX < 60) { yaw = Math.atan2(-(nose - a.x), a.z) - a.yaw; pitch = busy ? .15 : -.04; } // watch the train come in
      else if (!moving && st.doors[0].open > .2 && !busy) { let bx = 0, best = 1e9; st.cars.forEach(c => { const dx = c.position.x - a.x; if (Math.abs(dx) < Math.abs(best)) { best = dx; bx = c.position.x; } }); yaw = Math.atan2(-(bx - a.x), a.z) - a.yaw; }
      else { if (t > a.next) { a.target = (rnd() - .5) * (busy ? .4 : 1.6); a.next = t + 2.5 + rnd() * 5; } yaw = a.target; }
      const k = 1 - Math.pow(.04, dt); a.look += (Math.max(-1.25, Math.min(1.25, yaw)) - a.look) * k; a.hp = lerp(a.hp ?? pitch, pitch, k) + Math.sin(t * .8 + a.seed) * .004;
      this._idle(a, t);
    });
    // people walking by
    this.walkers.forEach(a => {
      if (!a.on) { if ((a.wait -= dt) <= 0) this._spawn(a); else return; }
      let v = a.v;
      const fx = flX(a.z); if (fx !== null) { const dx = fx - a.x; if (Math.abs(dx) < 1.8) v *= 2.6; else if (dx * a.dir > 0 && Math.abs(dx) < 3.5) v = 0; } // clear the boarding camera's path
      this.walkers.forEach(b => { if (b !== a && b.on && b.dir === a.dir && Math.abs(b.z - a.z) < .4) { const gap = (b.x - a.x) * a.dir; if (gap > 0 && gap < 1.4) v = Math.min(v, b.v * (gap / 1.4)); } });
      a.cur = lerp(a.cur ?? v, v, 1 - Math.pow(.02, dt)); a.x += a.dir * a.cur * dt; a.ph += a.cur * dt / 1.35 * Math.PI * 2;
      if (a.x * a.dir > this.span) { a.on = false; a.wait = 2 + rnd() * 9; if (a.prop === 'dog') this.dogInUse = false; return; }
      this._walker(a, t, dt);
    });
    [...this.riders, ...this.road].forEach(a => {
      if (!a.on) { if ((a.wait -= dt) <= 0) this._spawn(a); else return; }
      let v = a.v; const fx = a.kind === 'roadbike' ? null : flX(a.z); if (fx !== null && Math.abs(fx - a.x) < 6) v *= 1.5;
      a.x += a.dir * v * dt; a.spin += v / .33 * dt; a.crank += v * dt * (a.type === 'ebike' ? .9 : 1.2);
      if (a.x * a.dir > this.span + 6) { a.on = false; a.wait = 8 + rnd() * 16; return; }
      this._rider(a, t);
    });
    Object.values(p).forEach(q => q.flush());
  }

  /* drawing a figure from its joints */
  _root(a, yaw) { return this.root.compose(_v.set(a.x, a.y, a.z), _q.setFromAxisAngle(V(0, 1, 0), yaw), _s.setScalar(a.o.scale)); }
  _push(pool, local, col) { _m.multiplyMatrices(this.root, local); pool.push(_m, col); }
  _seg(pool, a, b, rest, col) {
    _d.subVectors(b, a); const len = _d.length() || 1e-4;
    this._push(pool, new THREE.Matrix4().compose(a, _q.setFromUnitVectors(UP, _d.divideScalar(len)), _s.set(1, len / rest, 1)), col);
  }
  _body(a) {
    const j = this.j, p = this.p, o = a.o;
    this._push(p.torso, torsoFrame(j), o.top); this._push(p.pelvis, new THREE.Matrix4().compose(j.pelvis, _q.setFromEuler(_e.set(0, j.twist * .3, 0)), _s.set(1, 1, 1)), o.pants);
    if (o.bag && j.bagLocal) this._push(p.bag, j.bagLocal, o.bag);
    const hm = new THREE.Matrix4().compose(j.neck, _q.setFromEuler(_e.set(-j.hp, j.twist + j.hy, j.hr, 'YXZ')), _s.set(1, 1, 1));
    this._push(p.head, hm, o.skin);
    if (o.style === 'hat') this._push(p.hat, hm, o.hat); else { this._push(p.hair, hm, o.hair); if (o.style === 'long') this._push(p.longHair, hm, o.hair); }
    for (let i = 0; i < 2; i++) {
      this._seg(p.upper, j.sh[i], j.el[i], L.upper, o.top); this._seg(p.fore, j.el[i], j.ha[i], L.fore, o.top);
      this._seg(p.thigh, j.hip[i], j.kn[i], L.thigh, o.pants); this._seg(p.shin, j.kn[i], j.an[i], L.shin, o.pants);
      if (!j.pockets) this._push(p.hand, new THREE.Matrix4().compose(j.ha[i], _q.setFromUnitVectors(UP, _d.subVectors(j.ha[i], j.el[i]).normalize()), _s.set(1, 1, 1)), o.skin);
      this._push(p.shoe, new THREE.Matrix4().compose(j.an[i], _q.setFromEuler(_e.set(j.foot[i], 0, 0)), _s.set(1, 1, 1)), o.shoe);
    }
  }
  _hold(kind, at, tilt) { // a phone or a book held in front, screen toward the face
    const m = new THREE.Matrix4().compose(at, _q.setFromEuler(_e.set(tilt, 0, 0)), _s.set(1, 1, 1));
    if (kind === 'book') this._push(this.p.book, m); else { this._push(this.p.phone, m); this._push(this.p.screen, m); }
  }

  _idle(a, t) {
    const j = this.j, sit = a.pose === 'sit', hipY = sit ? .72 : .8, hipZ = sit ? .02 : 0;
    j.pelvis.set(0, hipY, hipZ); j.lean = sit ? .12 : 0; j.twist = 0; j.roll = 0; j.pockets = a.hands === 'pockets';
    shoulders(j); hips(j);
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      if (sit) { j.an[i].set(sd * .13, L.ankle, -.52); ik(j.hip[i], j.an[i], L.thigh, L.shin, 1, j.kn[i]); }
      else { j.kn[i].set(sd * .1, .45, -.02); j.an[i].set(sd * .1, L.ankle, 0); }
      j.foot[i] = 0;
      const sY = hipY + .5;
      if (a.hands === 'phone' || a.hands === 'book') { j.el[i].set(sd * .2, sY - .27, hipZ - .05); j.ha[i].set(sd * .07, sY - .2, hipZ - .27); }
      else if (a.hands === 'pockets') { j.el[i].set(sd * .25, sY - .26, hipZ + .04); j.ha[i].set(sd * .17, hipY + .02, hipZ - .06); }
      else { j.el[i].set(sd * .22, sY - .28, hipZ - .02); j.ha[i].set(sd * .14, hipY + .1, hipZ - .3); }
    }
    j.hy = a.look; j.hp = a.hp; j.hr = 0;
    j.bagLocal = a.o.bag ? (sit ? new THREE.Matrix4().makeTranslation(.42, .7, .02) : new THREE.Matrix4().copy(torsoFrame(j)).multiply(new THREE.Matrix4().makeTranslation(0, .3, .2))) : null;
    this._root(a, a.yaw); this._body(a);
    if (a.hands === 'phone') this._hold('phone', V(0, hipY + .33, hipZ - .3), -.9);
    if (a.hands === 'book') this._hold('book', V(0, hipY + .35, hipZ - .31), -1.0);
  }

  _walker(a, t, dt) {
    const j = this.j, ph = a.ph, amp = .3 + a.cur * .1;
    j.pelvis.set(0, 0, 0); j.lean = -.04; j.twist = -.07 * Math.sin(ph); j.roll = .02 * Math.sin(ph); j.pockets = false;
    hips(j);
    for (let i = 0; i < 2; i++) { const q = ph + i * Math.PI, th = amp * Math.sin(q), kn = .1 + .72 * Math.pow(Math.max(0, Math.cos(q)), 1.5); leg(j, i, th, kn); j.foot[i] = .55 * th - .25 * kn; }
    const low = Math.min(j.an[0].y, j.an[1].y), lift = L.ankle - low; // the planted foot sets the height: a natural bob
    j.pelvis.set(.022 * Math.sin(ph), lift, 0); hips(j);
    for (let i = 0; i < 2; i++) { j.kn[i].y += lift; j.an[i].y += lift; j.kn[i].x = j.an[i].x = j.hip[i].x; }
    shoulders(j);
    for (let i = 0; i < 2; i++) arm(j, i, -.36 * amp * 2.4 * Math.sin(ph + i * Math.PI), .22 + .2 * Math.max(0, Math.sin(ph + i * Math.PI)));
    // what they carry
    const side = -a.dir > 0 ? 1 : 0; // the hand on the train side holds the dog's leash
    if (a.prop === 'phone') { arm(j, 1, .18, 1.32); }
    if (a.prop === 'case') { arm(j, 1, -.38, .05); }
    if (a.prop === 'dog') { arm(j, side, .3, .45); }
    // a glance at the train now and then
    if (t > a.nextGlance) { a.glance = rnd() < .45 ? (rnd() < .5 ? .7 : -.4) * (a.dir > 0 ? 1 : -1) : 0; a.nextGlance = t + 2 + rnd() * 4; }
    a.look = lerp(a.look, a.prop === 'phone' ? 0 : a.glance, 1 - Math.pow(.1, dt));
    j.hy = a.look; j.hp = a.prop === 'phone' ? .5 : .04; j.hr = 0;
    j.bagLocal = a.o.bag ? new THREE.Matrix4().copy(torsoFrame(j)).multiply(new THREE.Matrix4().makeTranslation(0, .3, .2)) : null;
    const yaw = -a.dir * Math.PI / 2; this._root(a, yaw); this._body(a);
    if (a.prop === 'phone') this._hold('phone', j.ha[1].clone().add(V(-.04, .04, -.02)), -.75);
    if (a.prop === 'case') { // trailing on its wheels, handle in hand
      const h = j.ha[1], len = 1.1, back = Math.sqrt(Math.max(.01, len * len - h.y * h.y));
      this._push(this.p.suitcase, new THREE.Matrix4().compose(V(h.x, 0, h.z + back), _q.setFromUnitVectors(V(0, 1, 0), V(0, h.y, -back).normalize()), _s.set(1, 1, 1)), a.o.top.clone().lerp(Col(0x30323a), .55));
    }
    if (a.prop === 'dog') this._dog(a, j.ha[side], side ? 1 : -1, dt);
  }

  _dog(a, hand, sd, dt) {
    const p = this.p, c = a.dogCol, x0 = sd * .62, z0 = -.45; a.dph += a.cur * dt / .55 * Math.PI * 2;
    const ph = a.dph, bob = .015 * Math.abs(Math.sin(ph)), M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(V(x0 + x, y + bob, z0 + z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
    this._push(p.dogBody, M(0, .42, 0), c);
    this._push(p.dogHead, M(0, .6, -.36, -.1 + .05 * Math.sin(ph * .5), .15 * Math.sin(ph * .25)), c);
    [[-1, -1, 0], [1, -1, Math.PI], [-1, 1, Math.PI], [1, 1, 0]].forEach(([sx, sz, o]) => this._push(p.dogLeg, M(sx * .07, .38, sz * .2, .5 * Math.sin(ph + o)), c));
    this._push(p.dogTail, M(0, .47, .27, .9, 0, .5 * Math.sin(ph * 2.3)), c);
    // the leash, from the hand to the collar
    const collar = V(x0, .58 + bob, z0 - .24); _d.subVectors(collar, hand); const len = _d.length();
    this._push(p.leash, new THREE.Matrix4().compose(hand, _q.setFromUnitVectors(V(0, 1, 0), _d.divideScalar(len)), _s.set(1, len, 1)));
  }

  _rider(a, t) {
    const j = this.j, p = this.p, type = a.type, scoot = type === 'scooter', yaw = -a.dir * Math.PI / 2;
    j.pockets = false; j.roll = .015 * Math.sin(t * 1.3 + a.ph); j.twist = 0;
    if (scoot) {
      j.pelvis.set(0, .9, .02); j.lean = -.16; hips(j);
      [[-1, -.12], [1, .2]].forEach(([sd, z], i) => { j.an[i].set(sd * .07, .265, z); ik(j.hip[i], j.an[i], L.thigh, L.shin, 1, j.kn[i]); j.foot[i] = i ? -.2 : 0; });
    } else {
      const up = type === 'ebike'; j.pelvis.set(0, .9, .16); j.lean = up ? -.3 : -.55; hips(j);
      for (let i = 0; i < 2; i++) {
        const c = a.crank + i * Math.PI, py = .3 + .17 * Math.cos(c), pz = .02 - .17 * Math.sin(c), sd = i ? 1 : -1;
        j.an[i].set(sd * .11, py + .09, pz + .05); ik(j.hip[i], j.an[i], L.thigh, L.shin, 1, j.kn[i]); j.foot[i] = .2 * Math.sin(c);
      }
    }
    shoulders(j);
    const grip = scoot ? [V(-.2, 1.05, -.44), V(.2, 1.05, -.44)] : [V(-.2, .97, -.38), V(.2, .97, -.38)];
    for (let i = 0; i < 2; i++) { j.ha[i].copy(grip[i]); ik(j.sh[i], j.ha[i], L.upper, L.fore, -1, j.el[i]); j.el[i].x += (i ? 1 : -1) * .06; }
    j.hy = .15 * Math.sin(t * .4 + a.ph); j.hp = .05; j.hr = 0;
    j.bagLocal = a.o.bag ? new THREE.Matrix4().copy(torsoFrame(j)).multiply(new THREE.Matrix4().makeTranslation(0, .3, .2)) : null;
    this._root(a, yaw);
    const M = (x, y, z, rx = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), _q.setFromEuler(_e.set(rx, 0, 0)), _s.setScalar(s));
    if (scoot) { this._push(p.scooter, M(0, 0, 0), a.frame); [[.11, -.44], [.11, .38]].forEach(([y, z]) => this._push(p.wheel, M(0, y, z, -a.spin * 3, .33))); }
    else {
      this._push(type === 'ebike' ? p.ebike : p.bike, M(0, 0, 0), a.frame);
      [.55, -.55].forEach(z => this._push(p.wheel, M(0, .34, z, -a.spin)));
      this._push(p.crank, M(0, .3, .02, -a.crank));
    }
    this._body(a);
  }
}
