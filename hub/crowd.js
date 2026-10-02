import * as THREE from 'three';
import { Person, KINDS, SCALE, HIP_SIT } from './people.js';

// Everyone on and around the platform who isn't you: people waiting on the benches and by the yellow line,
// people walking past (some with a phone, a suitcase or a dog), cyclists, an e-bike and an e-scooter on the
// forecourt path, and the odd cyclist on the road beyond the fence. The people are Kenney's Mini Characters
// (people.js), one skinned mesh each, animated by their own clips; the props they carry and ride are shared
// instanced meshes, a fixed handful of draw calls.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 29; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------- props: phones, a book, suitcases, dogs, bikes and scooters ---------- */
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

function geometries() {
  const dark = 0x1e2026, grey = 0x9aa0a8;
  const frame = (pts, extra = []) => bake([
    tube(pts.bb, pts.seat, .022), tube(pts.seat, pts.ht, .02), tube(pts.bb, pts.hl, .026), tube(pts.hl, pts.ht, .028),
    ...[-1, 1].flatMap(sd => [tube(pts.bb, pts.ra.clone().setX(sd * .055), .014), tube(pts.seat, pts.ra.clone().setX(sd * .055), .012), tube(pts.hl, pts.fa.clone().setX(sd * .045), .016)]),
    tube(pts.seat, pts.seat.clone().add(V(0, .06, .02)), .014, grey), tube(pts.ht, V(0, .97, -.4), .016, grey), tube(V(-.24, .97, -.38), V(.24, .97, -.38), .013, dark),
    ...[-1, 1].map(sd => tube(V(sd * .18, .97, -.38), V(sd * .25, .97, -.38), .02, dark)),
    BOX(.12, .045, .26, T(0, .93, .22), dark), ...extra
  ]);
  const bike = { bb: V(0, .3, .02), seat: V(0, .86, .2), ht: V(0, .86, -.42), hl: V(0, .7, -.45), ra: V(0, .34, .55), fa: V(0, .34, -.55) };
  return {
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

/* ---------- the crowd ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4(), UP = V(0, 1, 0);
const Col = h => new THREE.Color(h);
const BIKE_K = .62, SCOOT_K = .6;         // bikes and scooters at the toy people's scale
const WALK_SPEED = 1.15;                    // ground speed (m/s) the walk clip is made for, at SCALE

export class Crowd {
  constructor(st) {
    this.st = st; const G = geometries(), s = st.scene, mobile = st.mobile, P = (k, n, o) => new Pool(s, G[k], n, o);
    this.p = {
      phone: P('phone', 8, { rough: .3 }), screen: P('screen', 8, { glow: true, cast: false }), book: P('book', 2),
      suitcase: P('suitcase', 3, { rough: .5 }), dogBody: P('dogBody', 2), dogHead: P('dogHead', 2), dogLeg: P('dogLeg', 8), dogTail: P('dogTail', 2), leash: P('leash', 2, { cast: false }),
      wheel: P('wheel', 8, { rough: .5 }), bike: P('bike', 3, { rough: .35 }), ebike: P('ebike', 2, { rough: .35 }), scooter: P('scooter', 2, { rough: .4 }), crank: P('crank', 4, { rough: .4 })
    };
    this.root = new THREE.Matrix4();
    let kindAt = 3; const person = () => { const p = new Person(kindAt); kindAt = (kindAt + 5) % KINDS.length; s.add(p.root); return p; }; // every few, a different character
    const F = st.FLOOR, front = st.front, PP = st.P, benchZ = front + 5.8;
    // lanes far enough forward that, from the resting camera, passers-by stay below the doors on screen
    // (phones sit closer to the train, so their lanes are nearer; bikes only use the forecourt path on desktop)
    this.lanes = { walk: mobile ? [front + 11.3, front + 12] : [front + 16.4, front + 17.2], ride: [front + 19.8, front + 20.6], road: [-8.85, -12.4] };
    // people waiting: on the two outer benches, and standing back from the yellow line between the doors
    const idle = [
      [-2 * PP - .55, benchZ, 0, 'sit', 'phone'], [-2 * PP + .6, benchZ, 0, 'sit', 'lap'], [2 * PP - .5, benchZ, 0, 'sit', 'book'], [2 * PP + .62, benchZ, 0, 'sit', 'phone'],
      [-PP - .3, front + 2.3, .3, 'stand', 'lap'], [PP + .4, front + 2.6, -.2, 'stand', 'phone'], [-3 * PP - 1.6, front + 3.2, .9, 'stand', 'lap'], [3 * PP + 1.8, front + 2.9, -.5, 'stand', 'phone']
    ];
    this.idle = idle.map(([x, z, yaw, pose, hands]) => {
      const sit = pose === 'sit', busy = hands !== 'lap', p = person();
      // seated: hips on the bench seat (top at .52), backs near the backrest
      p.root.position.set(x, sit ? F + .52 - HIP_SIT * SCALE + .01 : F, sit ? z + .06 : z); p.root.rotation.y = yaw;
      p.pose(sit ? (busy ? 'sit-phone' : 'sit') : (busy ? 'idle-phone' : 'idle'), { fade: 0, phase: rnd() });
      return { x, z, yaw, sit, hands, busy, p, look: 0, pitch: busy ? .35 : 0, target: 0, next: 2 + rnd() * 4, seed: rnd() * 10 };
    });
    // people and riders passing by; each slot has its own person and waits a while between trips
    const slot = (kind, wait) => { const a = { kind, on: false, wait, x: 0, dir: 1, v: 0, ph: 0, p: person() }; a.p.root.visible = false; return a; };
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
    const F = this.st.FLOOR; a.on = true; a.p.root.visible = true; a.dir = rnd() < .5 ? 1 : -1; a.x = mid ? (rnd() - .5) * this.span * 1.4 : -a.dir * this.span; a.look = 0; a.glance = 0; a.nextGlance = 0;
    if (a.kind === 'walk') {
      const r = rnd(); a.prop = r < .18 ? 'case' : r < .32 && !this.dogInUse ? 'dog' : r < .5 ? 'phone' : null;
      if (a.prop === 'dog') { this.dogInUse = true; a.dogCol = Col(pick([0x8a6a4a, 0x2a2420, 0xd8c8a8, 0x6a4a30])); a.dph = 0; }
      a.v = a.prop === 'phone' ? .8 + rnd() * .15 : .95 + rnd() * .3; a.y = F; a.z = this.lanes.walk[a.dir > 0 ? 0 : 1] + (rnd() - .5) * .2;
      // the leash and the suitcase go in the hand facing the camera, so they're seen
      a.side = a.dir > 0 ? 'right' : 'left';
      a.p.pose(a.prop === 'phone' ? 'walk-phone' : a.prop === 'dog' ? (a.side === 'right' ? 'walk-phone' : 'walk-left') : 'walk', { fade: 0, phase: rnd() });
    } else {
      const road = a.kind === 'roadbike', type = road ? 'bike' : a.kind;
      a.type = type; a.y = road ? 0 : F; a.z = (road ? this.lanes.road : this.lanes.ride)[a.dir > 0 ? 0 : 1];
      a.v = type === 'scooter' ? 3.2 + rnd() * .8 : type === 'ebike' ? 5 + rnd() : 3.8 + rnd() * 1.2; a.crank = rnd() * 6; a.spin = 0;
      a.frame = Col(pick(type === 'scooter' ? [0x2a2d35, 0x3f8f8a, 0xd9d6d0] : [0x2c5a8a, 0xc9272c, 0x2f4a3a, 0xe8e4da, 0x1d1f26, 0xe8b923]));
      a.p.pose(type === 'scooter' ? 'stand' : 'drive', { fade: 0 });
    }
  }
  _hide(a) { a.on = false; a.p.root.visible = false; }

  update(t, dt) {
    const st = this.st, fl = st.flight;
    // where the boarding camera crosses a lane at depth z (it flies in a straight line toward the door)
    const flX = z => { if (!fl) return null; const u = (fl.p0.z - z) / (fl.p0.z - fl.p1.z); return u < 0 || u > 1 ? null : fl.p0.x + (fl.p1.x - fl.p0.x) * u; };
    // people waiting: heads watch the train come in, then the open doors, otherwise glance about
    const moving = st.trainX > .5, nose = st.cars[0].position.x + st.trainX - st.CAR_L / 2 - st.NOSE_L;
    this.idle.forEach(a => {
      let yaw, pitch = a.pitch;
      if (moving && st.trainX < 60) { yaw = Math.atan2(-(nose - a.x), a.z) - a.yaw; pitch = a.busy ? .1 : -.05; }
      else if (!moving && st.doors[0].open > .2 && !a.busy) { let bx = 0, best = 1e9; st.cars.forEach(c => { const dx = c.position.x - a.x; if (Math.abs(dx) < Math.abs(best)) { best = dx; bx = c.position.x; } }); yaw = Math.atan2(-(bx - a.x), a.z) - a.yaw; }
      else { if (t > a.next) { a.target = (rnd() - .5) * (a.busy ? .4 : 1.4); a.next = t + 2.5 + rnd() * 5; } yaw = a.target; }
      const k = 1 - Math.pow(.04, dt), L = a.p.look;
      L.yaw += (Math.max(-1.1, Math.min(1.1, yaw)) - L.yaw) * k; L.pitch += (pitch - L.pitch) * k; L.roll = Math.sin(t * .8 + a.seed) * .02;
      a.p.update(dt);
      if (a.hands !== 'lap') this._held(a.p, a.hands, a.p.root.rotation.y);
    });
    // people walking by
    this.walkers.forEach(a => {
      if (!a.on) { if ((a.wait -= dt) <= 0) this._spawn(a); else return; }
      let v = a.v;
      const fx = flX(a.z); if (fx !== null) { const dx = fx - a.x; if (Math.abs(dx) < 1.8) v *= 2.2; else if (dx * a.dir > 0 && Math.abs(dx) < 3.5) v = 0; } // clear the boarding camera's path
      this.walkers.forEach(b => { if (b !== a && b.on && b.dir === a.dir && Math.abs(b.z - a.z) < .4) { const gap = (b.x - a.x) * a.dir; if (gap > 0 && gap < 1.4) v = Math.min(v, b.v * (gap / 1.4)); } });
      a.cur = lerp(a.cur ?? v, v, 1 - Math.pow(.02, dt)); a.x += a.dir * a.cur * dt;
      if (a.x * a.dir > this.span) { this._hide(a); a.wait = 2 + rnd() * 9; if (a.prop === 'dog') this.dogInUse = false; return; }
      this._walker(a, t, dt);
    });
    [...this.riders, ...this.road].forEach(a => {
      if (!a.on) { if ((a.wait -= dt) <= 0) this._spawn(a); else return; }
      let v = a.v; const fx = a.kind === 'roadbike' ? null : flX(a.z); if (fx !== null && Math.abs(fx - a.x) < 6) v *= 1.5;
      a.x += a.dir * v * dt; a.spin += v / (.33 * (a.type === 'scooter' ? SCOOT_K : BIKE_K)) * dt; a.crank += v * dt * (a.type === 'ebike' ? 1.4 : 1.9);
      if (a.x * a.dir > this.span + 6) { this._hide(a); a.wait = 8 + rnd() * 16; return; }
      this._rider(a, t, dt);
    });
    Object.values(this.p).forEach(q => q.flush());
  }

  // the root frame of someone at (x, y, z) facing yaw; props are placed in it
  _root(a, yaw) { return this.root.compose(_v.set(a.x, a.y, a.z), _q.setFromAxisAngle(UP, yaw), _s.set(1, 1, 1)); }
  _push(pool, local, col) { _m.multiplyMatrices(this.root, local); pool.push(_m, col); }
  _local(world) { return _inv.copy(this.root).invert(), world.clone().applyMatrix4(_inv); }
  // a phone or a book held between both hands, tilted toward the face
  _held(p, kind, yaw) {
    const mid = p.hand('left', _v).add(p.hand('right', _w)).multiplyScalar(.5);
    const m = new THREE.Matrix4().compose(mid.add(_w.set(0, .02, 0)), _q.setFromEuler(_e.set(-.7, yaw, 0, 'YXZ')), _s.set(1, 1, 1));
    if (kind === 'book') this.p.book.push(m); else { this.p.phone.push(m); this.p.screen.push(m); }
  }

  _walker(a, t, dt) {
    const p = a.p, yaw = -a.dir * Math.PI / 2;
    p.root.position.set(a.x, a.y, a.z); p.root.rotation.set(0, yaw, 0);
    // the stride keeps pace with the ground; a glance at the train now and then
    p.pose(p.poseName, { speed: a.cur / WALK_SPEED });
    if (t > a.nextGlance) { a.glance = rnd() < .45 ? (rnd() < .5 ? .6 : -.35) * (a.dir > 0 ? 1 : -1) : 0; a.nextGlance = t + 2 + rnd() * 4; }
    const L = p.look; L.yaw = lerp(L.yaw, a.prop === 'phone' ? 0 : a.glance, 1 - Math.pow(.1, dt)); L.pitch = lerp(L.pitch, a.prop === 'phone' ? .35 : 0, 1 - Math.pow(.1, dt));
    p.update(dt); p.root.updateMatrixWorld(true);
    this._root(a, yaw);
    if (a.prop === 'case') p.aim(a.side === 'right' ? 'arm-right' : 'arm-left', V(a.side === 'right' ? .3 : -.3, .3, .45).applyMatrix4(this.root)); // trailing arm
    if (a.prop === 'phone') { const h = p.hand('right', _v), m = new THREE.Matrix4().compose(h.add(_w.set(0, .03, 0)), _q.setFromEuler(_e.set(-.7, yaw, 0, 'YXZ')), _s.set(1, 1, 1)); this.p.phone.push(m); this.p.screen.push(m); }
    if (a.prop === 'case') { // trailing on its wheels, handle in hand
      const h = this._local(p.hand(a.side, _v)), len = 1.02, back = Math.sqrt(Math.max(.01, len * len - h.y * h.y));
      this._push(this.p.suitcase, new THREE.Matrix4().compose(V(h.x, 0, h.z + back), _q.setFromUnitVectors(UP, V(0, h.y, -back).normalize()), _s.set(.85, .85, .85)), Col(pick([0x30323a, 0x8a2a2a, 0x2c3a5a, 0x3f6f5a])));
    }
    if (a.prop === 'dog') this._dog(a, p.hand(a.side, new THREE.Vector3()), a.side === 'right' ? 1 : -1, dt);
  }

  _dog(a, hand, sd, dt) {
    const p = this.p, c = a.dogCol, x0 = sd * .62, z0 = -.55; a.dph += a.cur * dt / .55 * Math.PI * 2;
    const ph = a.dph, bob = .015 * Math.abs(Math.sin(ph)), M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(V(x0 + x, y + bob, z0 + z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(1, 1, 1));
    this._push(p.dogBody, M(0, .42, 0), c);
    this._push(p.dogHead, M(0, .6, -.36, -.1 + .05 * Math.sin(ph * .5), .15 * Math.sin(ph * .25)), c);
    [[-1, -1, 0], [1, -1, Math.PI], [-1, 1, Math.PI], [1, 1, 0]].forEach(([sx, sz, o]) => this._push(p.dogLeg, M(sx * .07, .38, sz * .2, .5 * Math.sin(ph + o)), c));
    this._push(p.dogTail, M(0, .47, .27, .9, 0, .5 * Math.sin(ph * 2.3)), c);
    // the leash, from the hand to the collar (in world space)
    const collar = V(x0, .58 + bob, z0 - .24).applyMatrix4(this.root), d = collar.sub(hand), len = d.length();
    p.leash.push(new THREE.Matrix4().compose(hand, _q.setFromUnitVectors(UP, d.divideScalar(len)), _s.set(1, len, 1)));
  }

  // riders: seated on the bike ('drive'), hands to the grips and feet on the pedals; or standing on the scooter
  _rider(a, t, dt) {
    const p = a.p, type = a.type, scoot = type === 'scooter', yaw = -a.dir * Math.PI / 2, K = scoot ? SCOOT_K : BIKE_K;
    this._root(a, yaw);
    const M = (x, y, z, rx = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z).multiplyScalar(K), _q.setFromEuler(_e.set(rx, 0, 0)), _s.setScalar(s * K));
    const W = v => v.clone().multiplyScalar(K).applyMatrix4(this.root); // a point on the bike, in world space
    if (scoot) {
      this._push(this.p.scooter, M(0, 0, 0), a.frame); [[.11, -.44], [.11, .38]].forEach(([y, z]) => this._push(this.p.wheel, M(0, y, z, -a.spin * 3, .33)));
      p.root.position.copy(W(V(0, .165, .05))); p.root.rotation.set(0, yaw, 0);
      p.look.yaw = .15 * Math.sin(t * .4 + a.dir); p.update(dt); p.root.updateMatrixWorld(true);
      p.aim('arm-left', W(V(-.2, 1.05, -.44))); p.aim('arm-right', W(V(.2, 1.05, -.44)));
    } else {
      this._push(type === 'ebike' ? this.p.ebike : this.p.bike, M(0, 0, 0), a.frame);
      [.55, -.55].forEach(z => this._push(this.p.wheel, M(0, .34, z, -a.spin)));
      this._push(this.p.crank, M(0, .3, .02, -a.crank));
      // hips on the saddle
      p.root.position.copy(W(V(0, .955, .22))).add(_w.set(0, -HIP_SIT * SCALE - .03, 0)); p.root.rotation.set(-.12, yaw, 0, 'YXZ');
      p.look.yaw = .12 * Math.sin(t * .4 + a.dir); p.update(dt); p.root.updateMatrixWorld(true);
      p.aim('arm-left', W(V(-.2, .97, -.38))); p.aim('arm-right', W(V(.2, .97, -.38)));
      [0, 1].forEach(i => { const c = a.crank + i * Math.PI, sd = i ? 1 : -1; p.aim(i ? 'leg-right' : 'leg-left', W(V(sd * .11, .3 + .17 * Math.cos(c), .02 - .17 * Math.sin(c)))); });
    }
  }
}
