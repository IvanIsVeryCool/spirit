import * as THREE from 'three';
import { CAR_L, GAP, W, FLOOR, NOSE_L } from './train.js';
import { rideTrain } from './ridetrain.js';
import { mergeStatic } from './scenery.js';

// The ride on the Events car's screen: a little Spirit Line of its own, a loop through the golden-hour countryside with
// a station for every event (its name on the signs), and a three-car train that runs from stop to stop. It's drawn by
// the hub's renderer into a render target (`rt`), which the screen shows under its passenger-display layout (NextStops).
// While the train runs, the camera chases it from above and behind; at a stop it settles beside the station.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = v => Math.max(0, Math.min(1, v));
const COL = { skyTop: '#1c2a66', skyMid: '#7468ab', horizon: '#ffb07a', sun: '#ffd08e' };
const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const SPACING = 170, CARS = 3; // metres of line per station; cars in the train
const MID = NOSE_L + CAR_L / 2 + (CARS - 1) / 2 * (CAR_L + GAP); // from the train's front to its middle

export class EventRide {
  constructor({ logo, mobile, names }) {
    this.logo = logo; this.mobile = mobile; this.names = names; this.n = Math.max(1, names.length);
    let seed = 11; this.rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(new THREE.Color(COL.horizon).lerp(new THREE.Color(COL.skyMid), .35), 240, 1250);
    this.camera = new THREE.PerspectiveCamera(mobile ? 44 : 36, 1.4, .5, 3000);
    s.add(new THREE.HemisphereLight(0xa9b8ff, 0x6a4b3c, 1.25)); // (brighter than the Spirit Points ride: the hub's exposure is lower)
    const sun = new THREE.DirectionalLight(0xffc690, 2.5); sun.position.set(-.78, .42, -.32).multiplyScalar(100); s.add(sun);
    this._sky(); this._line(); this._land(); this._stations(); this._towns();
    this.cars = rideTrain(logo, { count: CARS, led: ['EVENTS', 'SPIRIT LINE'] }); this.cars.forEach(c => s.add(c));
    this.look = V(); this.camPos = V(); this.camLook = V(); this.t = 0; this.moving = 0; this.dir = 1;
    this.at = 0; this.go = null; this.onArrive = null;
    this.reset(0);
  }

  /* ---------- the world ---------- */
  _sky() {
    const m = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(COL.skyTop) }, mid: { value: new THREE.Color(COL.skyMid) }, hor: { value: new THREE.Color(COL.horizon) }, sunCol: { value: new THREE.Color(COL.sun) }, sunDir: { value: V(-.82, .16, -.3).normalize() } },
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top, mid, hor, sunCol, sunDir; varying vec3 vDir;
        void main(){ vec3 v = normalize(vDir); float h = v.y;
          vec3 c = mix(hor, mid, smoothstep(.0, .22, h)); c = mix(c, top, smoothstep(.18, .7, h)); c = mix(c, hor * .82, smoothstep(.0, -.08, h));
          float s = max(dot(v, normalize(sunDir)), 0.); c += sunCol * (pow(s, 900.) * 4. + pow(s, 40.) * .32 + pow(s, 6.) * .12);
          gl_FragColor = vec4(c, 1.); }`
    });
    const sky = this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), m); sky.frustumCulled = false; sky.renderOrder = -1; this.scene.add(sky);
  }
  // the line: a loop round a lake and a park, long enough for every station
  _line() {
    const len = Math.max(4, this.n) * SPACING, R = len / (2 * Math.PI) / 1.1, pts = [];
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = R * (1 + .14 * Math.sin(2 * a + .7) + .06 * Math.sin(3 * a + 2)); pts.push(V(Math.cos(a) * r * 1.3, 0, Math.sin(a) * r * .82)); }
    const c = this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal'); this.L = c.getLength(); this.R = R;
    this.samples = Array.from({ length: 160 }, (_, k) => c.getPointAt(k / 160));
    const g = new THREE.Group(); this.scene.add(g);
    const ribbon = (off, w, y, mat) => {
      const pos = [], idx = [], N = 600;
      for (let i = 0; i <= N; i++) { const u = i / N % 1, p = c.getPointAt(u), q = this.side(u); [-1, 1].forEach(sd => { const v = p.clone().addScaledVector(q, off + sd * w / 2); pos.push(v.x, y, v.z); }); if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.material.side = THREE.DoubleSide; g.add(m);
    };
    ribbon(0, 4.6, .03, new THREE.MeshStandardMaterial({ color: 0x5d534b, roughness: 1 }));
    const rail = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .8, roughness: .35 }); [-.72, .72].forEach(d => ribbon(d, .12, .2, rail));
    const nT = Math.floor(this.L / 1.25), ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, .1, .24), new THREE.MeshStandardMaterial({ color: 0x3b312a, roughness: .95 }), nT), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < nT; i++) { const u = i / nT; q.setFromUnitVectors(V(1, 0, 0), this.side(u)); ties.setMatrixAt(i, m.compose(c.getPointAt(u).setY(.08), q, V(1, 1, 1))); }
    g.add(ties);
    mergeStatic(g);
  }
  // the outward side of the line at u (the stations' platforms are on the outside of the loop)
  side(u) { const t = this.curve.getTangentAt(u), n = V(-t.z, 0, t.x), p = this.curve.getPointAt(u); return n.dot(p) < 0 ? n.negate() : n; }
  _clear(x, z, d) { for (const p of this.samples) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return false; return true; }
  // the ground: fields and a street grid, the lake in the middle of the loop, low hills all round
  _land() {
    const S = 2400, N = 1024, rx = this.R * 1.3 * .5, rz = this.R * .82 * .48, px = v => (v / S + .5) * N, rnd = this.rnd;
    const col = canvas(N, N, x => {
      const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N * .7); g.addColorStop(0, '#7e8656'); g.addColorStop(1, '#8e8560'); x.fillStyle = g; x.fillRect(0, 0, N, N);
      for (let i = 0; i < 180; i++) { x.save(); x.translate(rnd() * N, rnd() * N); x.rotate(rnd() * 3); x.fillStyle = ['rgba(170,150,95,.3)', 'rgba(96,118,66,.3)', 'rgba(150,124,78,.25)', 'rgba(118,128,70,.3)'][Math.floor(rnd() * 4)]; x.fillRect(0, 0, 14 + rnd() * 40, 10 + rnd() * 30); x.restore(); }
      x.strokeStyle = 'rgba(255,236,206,.12)'; x.lineWidth = 1.2;
      for (let k = 0; k < N; k += 11) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + N * .06, N); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(N, k - N * .04); x.stroke(); }
      // the park round the lake, its shore, the water
      x.fillStyle = '#5f7c45'; x.beginPath(); x.ellipse(N / 2, N / 2, px(rx * 1.45) - N / 2, px(rz * 1.5) - N / 2, 0, 0, 7); x.fill();
      x.fillStyle = '#9b8c6c'; x.beginPath(); x.ellipse(N / 2, N / 2, px(rx * 1.04) - N / 2, px(rz * 1.06) - N / 2, 0, 0, 7); x.fill();
      const wg = x.createLinearGradient(0, px(-rz), 0, px(rz)); wg.addColorStop(0, '#3a4277'); wg.addColorStop(1, '#2c3262'); x.fillStyle = wg;
      x.beginPath(); x.ellipse(N / 2, N / 2, px(rx) - N / 2, px(rz) - N / 2, 0, 0, 7); x.fill();
      // a road round the outside of the line
      x.strokeStyle = 'rgba(240,226,196,.4)'; x.lineWidth = 3; x.beginPath();
      this.samples.forEach((p, k) => { const o = this.side(k / 160).multiplyScalar(34).add(p); k ? x.lineTo(px(o.x), px(o.z)) : x.moveTo(px(o.x), px(o.z)); }); x.closePath(); x.stroke();
    });
    const rough = canvas(64, 64, (x) => { x.fillStyle = 'rgb(0,240,0)'; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgb(0,40,0)'; x.beginPath(); x.ellipse(32, 32, rx / S * 64, rz / S * 64, 0, 0, 7); x.fill(); });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: tex(col), roughnessMap: tex(rough, false), roughness: 1, metalness: .05, envMapIntensity: .8 }));
    ground.rotation.x = -Math.PI / 2; this.scene.add(ground);
    // low hills in a ring well beyond the line, golden on their sunny side
    const hg = new THREE.RingGeometry(this.R * 2.3, 1300, 96, 10); hg.rotateX(-Math.PI / 2); const hp = hg.attributes.position, hc = [];
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), z = hp.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x), k = clamp01((r - this.R * 2.3) / 380);
      const h = k * (38 + 26 * Math.sin(a * 5 + 1) + 14 * Math.sin(a * 13 + r * .01) + 8 * Math.sin(a * 29)); hp.setY(i, h - .5);
      const cc = new THREE.Color(0x4c5a38).lerp(new THREE.Color(0x7a6a46), Math.min(1, h / 70)); hc.push(cc.r, cc.g, cc.b);
    }
    hg.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3)); hg.computeVertexNormals();
    this.scene.add(new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true })));
  }
  // a station at each event: a platform on the outside of the loop, a canopy, and its name on a sign over the platform
  _stations() {
    const g = new THREE.Group(); this.scene.add(g); this.signs = [];
    const conc = new THREE.MeshStandardMaterial({ color: 0x8d857a, roughness: .92 }), dark = new THREE.MeshStandardMaterial({ color: 0x1f2a26, metalness: .5, roughness: .55 }), yellow = new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: .6 }), roof = new THREE.MeshStandardMaterial({ color: 0x9a3a2e, roughness: .7 });
    this.stations = this.names.map((name, i) => {
      const u = i / this.n, p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u), out = this.side(u), len = 52;
      const st = new THREE.Group(); st.position.copy(p); st.lookAt(p.clone().add(t)); g.add(st); // local +z along the line
      const sd = Math.sign(V(1, 0, 0).applyQuaternion(st.quaternion).dot(out)) || 1, front = sd * (W / 2 + .12);
      const box = (w, h, d, mat, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); st.add(b); return b; };
      box(6, FLOOR, len, conc, front + sd * 3, FLOOR / 2, 0); box(.5, .012, len, yellow, front + sd * .3, FLOOR + .006, 0);
      box(4.2, .25, len * .6, roof, front + sd * 3.4, 4.2, 0);
      for (let zz = -len * .27; zz <= len * .27 + .01; zz += len * .135) box(.18, 3.7, .18, dark, front + sd * 4.2, FLOOR + 1.85, zz);
      // the name sign stands on two legs at the back of the platform, high enough to read over the train's roof
      const sign = { name, c: document.createElement('canvas') }; sign.c.width = 640; sign.c.height = 120; sign.tex = tex(sign.c); this._paintSign(sign); this.signs.push(sign);
      const mat = new THREE.MeshBasicMaterial({ map: sign.tex });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 1.8), mat), back = face.clone(); face.position.set(front + sd * 5.5, 6.2, 0); face.rotation.y = -sd * Math.PI / 2; st.add(face);
      back.position.set(front + sd * 5.82, 6.2, 0); back.rotation.y = sd * Math.PI / 2; st.add(back);
      box(.14, 2, 9.9, dark, front + sd * 5.66, 6.2, 0); [-3.6, 3.6].forEach(z => box(.2, 5.4, .2, dark, front + sd * 5.66, 2.7, z));
      return { u, p, t, out };
    });
    mergeStatic(g);
  }
  _paintSign(sg) {
    const x = sg.c.getContext('2d'), w = sg.c.width, h = sg.c.height;
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#c9272c'; x.fillRect(0, 0, 20, h);
    x.fillStyle = '#16181f'; x.textBaseline = 'middle'; let fs = 62; x.font = `800 ${fs}px Archivo, Arial, sans-serif`;
    while (x.measureText(sg.name).width > w - 70 && fs > 34) { fs -= 2; x.font = `800 ${fs}px Archivo, Arial, sans-serif`; }
    x.fillText(sg.name, 44, h / 2 + 3, w - 66); sg.tex.needsUpdate = true;
  }
  redrawSigns() { this.signs.forEach(s => this._paintSign(s)); }
  // the towns by the stations (blocks with lit windows) and trees everywhere else
  _towns() {
    const rnd = this.rnd, m = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color(), spots = [];
    this.stations.forEach(sp => {
      for (let k = 0, tries = 0; k < 16 && tries < 200; tries++) {
        const a = (rnd() - .5) * 120, d = 22 + rnd() * 70, x = sp.p.x + sp.t.x * a + sp.out.x * d, z = sp.p.z + sp.t.z * a + sp.out.z * d;
        if (!this._clear(x, z, 16)) continue; spots.push([x, z, Math.atan2(sp.t.x, sp.t.z)]); k++;
      }
    });
    const win = canvas(128, 64, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { x.fillStyle = rnd() < .45 ? (rnd() < .5 ? '#ffcf8a' : '#ffe2b0') : '#16141c'; x.fillRect(6 + c * 20, 6 + r * 20, 10, 10); } });
    const white = canvas(4, 4, x => { x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4); });
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
    const blocks = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: tex(white), emissiveMap: tex(win), emissive: 0xffffff, emissiveIntensity: .85, roughness: .9 }), Math.max(1, spots.length));
    spots.forEach(([x, z, yaw], k) => {
      const w = 8 + rnd() * 8, d = 8 + rnd() * 7, h = 5 + rnd() * 8; q.setFromAxisAngle(V(0, 1, 0), yaw + (rnd() - .5) * .2); blocks.setMatrixAt(k, m.compose(V(x, 0, z), q, V(w, h, d)));
      blocks.setColorAt(k, cc.set([0xcdb79a, 0xc29f80, 0xb07e60, 0xc8c0b2, 0xa89886, 0x9c8c7c][Math.floor(rnd() * 6)]));
    });
    blocks.count = spots.length; this.scene.add(blocks);
    const nT = this.mobile ? 320 : 600, trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true }), nT), rx = this.R * 1.3 * .5, rz = this.R * .82 * .48;
    let kt = 0; // (kept well back from the line: the camera stands beside it)
    for (let tries = 0; kt < nT && tries < nT * 8; tries++) {
      const x = (rnd() - .5) * this.R * 5, z = (rnd() - .5) * this.R * 3.6;
      if (!this._clear(x, z, 32) || (x / (rx * 1.1)) ** 2 + (z / (rz * 1.12)) ** 2 < 1 || spots.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 110)) continue;
      const sc = 2.5 + rnd() * 3.5; trees.setMatrixAt(kt, m.compose(V(x, sc * .8, z), q.setFromAxisAngle(V(0, 1, 0), rnd() * 6), V(sc, sc * (1 + rnd() * .5), sc)));
      trees.setColorAt(kt++, cc.set([0x24402f, 0x2c4a2f, 0x34502e, 0x3c5a34][Math.floor(rnd() * 4)]));
    }
    trees.count = kt; this.scene.add(trees);
  }

  /* ---------- the train ---------- */
  // the train's front, in metres along the loop, when its middle is at stop i
  stopS(i) { return this.stations[i].u * this.L + MID; }
  place(sFront) {
    this.sFront = sFront; const L = this.L, w = s => ((s % L) + L) % L / L;
    this.cars.forEach((car, i) => { const u = w(sFront - NOSE_L - CAR_L / 2 - i * (CAR_L + GAP)), p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u); car.position.copy(p); car.rotation.y = Math.atan2(t.z, -t.x); });
    const um = w(sFront - MID); this.mid = this.curve.getPointAt(um); this.tan = this.curve.getTangentAt(um); this.out = this.side(um);
  }
  // straight to stop k, the camera settled
  reset(k = 0) { this.at = k; this.go = null; this.moving = 0; this.dir = 1; this.place(this.stopS(k)); this._frame(0, true); }
  // run to stop k: forward round the loop (dir 1) or back (dir -1); from wherever it is, if it's already on the move
  goTo(k, dir = 1) {
    const from = this.sFront; let to = this.stopS(k);
    if (dir >= 0) while (to <= from + .5) to += this.L; else while (to >= from - .5) to -= this.L;
    this.at = k; this.dir = dir >= 0 ? 1 : -1; this.go = { from, to, t: 0, dur: 2.2 + Math.abs(to - from) / 95 };
  }
  get running() { return !!this.go; }
  progress() { return this.go ? clamp01(this.go.t / this.go.dur) : 1; }
  update(dt) {
    this.t += dt;
    if (this.go) {
      const G = this.go; G.t += dt; const p = clamp01(G.t / G.dur);
      this.place(G.from + (G.to - G.from) * easeInOut(p));
      if (p >= 1) { this.go = null; this.onArrive && this.onArrive(this.at); }
    }
    this._frame(dt);
  }
  // the camera: beside the station at a stop, drifting a little; up behind the train as it runs
  _frame(dt, snap) {
    const run = this.go ? Math.sin(Math.PI * clamp01(this.go.t / this.go.dur)) : 0;
    this.moving += (run - this.moving) * (snap ? 1 : Math.min(1, dt * 1.6));
    const m = this.mid, t = this.tan.clone().multiplyScalar(this.dir), o = this.out, e = this.moving * this.moving * (3 - 2 * this.moving), drift = Math.sin(this.t * .12) * .5;
    // at a stop: across the line from the platform and a little ahead, looking back at the train with the sign over it
    const stop = m.clone().addScaledVector(t, 23 + drift * 4).addScaledVector(o, -19 + drift * 2).setY(7.5), stopLook = m.clone().addScaledVector(o, 3.5).addScaledVector(t, this.mobile ? -1 : -3).setY(this.mobile ? -.6 : 2.6); // (aimed low: the train sits up out of the card's way)
    const chase = m.clone().addScaledVector(t, -30).addScaledVector(o, 13).setY(8.5), chaseLook = m.clone().addScaledVector(t, 22).setY(2.2);
    this.camPos.lerpVectors(stop, chase, e); this.camLook.lerpVectors(stopLook, chaseLook, e);
    if (snap) { this.camera.position.copy(this.camPos); this.look.copy(this.camLook); }
    else { const a = 1 - Math.pow(.04, dt); this.camera.position.lerp(this.camPos, a); this.look.lerp(this.camLook, a); }
    this.camera.lookAt(this.look); this.sky.position.copy(this.camera.position);
  }
  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }
  // draw into the target (the hub's renderer; the scene shares its reflections)
  render(renderer, target, env) {
    if (env && this.scene.environment !== env) this.scene.environment = env;
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(target); renderer.render(this.scene, this.camera); renderer.setRenderTarget(prev);
  }
}
