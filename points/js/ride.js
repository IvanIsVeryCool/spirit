import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from '/vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/jsm/postprocessing/OutputPass.js';
import { CAR_L, GAP, W, H, FLOOR, NOSE_L, DOOR_W, DOOR_H, bodyGeometry, capGeometry, noseGeometry, paintBody, paintNose, windowTexture, windowSlots } from '/hub/train.js';
import { mergeStatic } from '/hub/scenery.js';

// The ride to Spirit Points: the Spirit Line runs north up an illustrated Peninsula at golden hour,
// stopping at each station, and pulls in beside a big station billboard where the standings live.

export const STOPS = ['Nueva', 'Hayward Park', 'San Mateo', 'Burlingame', 'Spirit Points'];
const STOP_U = [.05, .28, .5, .72, .93];
const COL = { skyTop: '#1c2a66', skyMid: '#7468ab', horizon: '#ffb07a', sun: '#ffd08e' };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const smooth = t => t * t * (3 - 2 * t);
const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const shore = z => 250 + 70 * Math.sin(z * .0045) + 35 * Math.sin(z * .011 + 1); // the bay's edge, east of the line

function drawLED(ctx, lines) {
  const cv = ctx.canvas, CW = 160, CH = 32, P = 4, s = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  s.canvas.width = CW; s.canvas.height = CH; s.fillStyle = '#fff'; s.textAlign = 'center'; s.textBaseline = 'middle';
  lines.forEach((t, i) => { s.font = `bold ${i ? 10 : 13}px "DotGothic16", monospace`; s.fillText(t, CW / 2, i ? 24 : 10); });
  const d = s.getImageData(0, 0, CW, CH).data; ctx.fillStyle = '#07070a'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const on = d[(y * CW + x) * 4 + 3] > 110; ctx.fillStyle = on ? '#ffad1f' : '#2b1a05'; ctx.beginPath(); ctx.arc(x * P + P / 2, y * P + P / 2, on ? 1.7 : 1.2, 0, 7); ctx.fill(); }
}

export class Ride {
  constructor(cv, { mobile, logo }) {
    this.mobile = mobile; this.logo = logo;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !mobile, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    if (!mobile) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(new THREE.Color(COL.horizon).lerp(new THREE.Color(COL.skyMid), .35), 650, 2800);
    this.camera = new THREE.PerspectiveCamera(mobile ? 50 : 38, 1, .5, 4000);
    this.clock = new THREE.Clock(); this.t = 0;
    this.sunDir = new THREE.Vector3(-.82, .2, -.3).normalize(); // what the sky shows
    this.lightDir = new THREE.Vector3(-.78, .42, -.32).normalize(); // a touch higher for the light, so the towns aren't lost in long shadows
    s.add(new THREE.HemisphereLight(0xa9b8ff, 0x6a4b3c, .95));
    const sun = this.sun = new THREE.DirectionalLight(0xffc690, 1.9); s.add(sun, sun.target);
    if (!mobile) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 600 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .05; }
    this._sky(); this._land(); this._line(); this._towns(); this._stations(); this._train();
    s.traverse(o => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = !!o.userData.cast; o.receiveShadow = true; } });
    this.composer = new EffectComposer(r); this.composer.addPass(new RenderPass(s, this.camera));
    if (!mobile) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .5, .45, .85); this.composer.addPass(this.bloom); }
    this.composer.addPass(new OutputPass());
    this.state = 'idle'; this.speed = 0; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.placeTrain(this.stopS(0)); this.resize(); this._chase(1, true);
  }

  /* ---------- the world ---------- */
  _sky() {
    const m = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color(COL.skyTop) }, mid: { value: new THREE.Color(COL.skyMid) }, hor: { value: new THREE.Color(COL.horizon) }, sunCol: { value: new THREE.Color(COL.sun) }, sunDir: { value: this.sunDir } },
      side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top, mid, hor, sunCol, sunDir; varying vec3 vDir;
        void main(){ vec3 v = normalize(vDir); float h = v.y;
          vec3 c = mix(hor, mid, smoothstep(.0, .22, h)); c = mix(c, top, smoothstep(.18, .7, h)); c = mix(c, hor * .82, smoothstep(.0, -.08, h));
          float s = max(dot(v, normalize(sunDir)), 0.); c += sunCol * (pow(s, 900.) * 4. + pow(s, 40.) * .32 + pow(s, 6.) * .12);
          gl_FragColor = vec4(c, 1.); }`
    });
    const sky = this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), m); sky.frustumCulled = false; sky.renderOrder = -1; sky.userData.noShadow = true; this.scene.add(sky);
    const env = new THREE.Scene(); env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
    const room = new RoomEnvironment(); room.scale.setScalar(.02); room.position.y = -1; env.add(room);
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(env, .02, .1, 100).texture;
  }
  // an illustrated map underfoot: land, neighbourhood grids, parks, the freeways and the bay
  _land() {
    const S = 2400, X0 = -1300, Z0 = -1500, N = 2048, px = x => (x - X0) / S * N, pz = z => (z - Z0) / S * N;
    const col = canvas(N, N, (x) => {
      const g = x.createLinearGradient(0, 0, N, 0); g.addColorStop(0, '#6f7c4c'); g.addColorStop(.5, '#8a8660'); g.addColorStop(1, '#948a6a');
      x.fillStyle = g; x.fillRect(0, 0, N, N);
      for (let i = 0; i < 260; i++) { const cx = rnd() * N, cy = rnd() * N, rr = 20 + rnd() * 90; x.fillStyle = rnd() < .5 ? 'rgba(170,150,105,.2)' : 'rgba(84,110,64,.24)'; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(255,236,206,.13)'; x.lineWidth = 1.4; // street grid
      for (let k = 0; k < N; k += 9) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + N * .08, N); x.stroke(); x.beginPath(); x.moveTo(0, k); x.lineTo(N, k - N * .05); x.stroke(); }
      x.fillStyle = '#5b7a46'; for (let i = 0; i < 30; i++) { x.beginPath(); x.roundRect(rnd() * N, rnd() * N, 20 + rnd() * 50, 16 + rnd() * 40, 6); x.fill(); } // parks
      // the bay, with a pale edge of mudflats
      x.beginPath(); x.moveTo(N, 0); for (let i = 0; i <= 100; i++) { const z = Z0 + i / 100 * S; x.lineTo(px(shore(z) - 14), pz(z)); } x.lineTo(N, N); x.closePath(); x.fillStyle = '#8a7d66'; x.fill();
      x.beginPath(); x.moveTo(N, 0); for (let i = 0; i <= 100; i++) { const z = Z0 + i / 100 * S; x.lineTo(px(shore(z)), pz(z)); } x.lineTo(N, N); x.closePath();
      const wg = x.createLinearGradient(px(200), 0, N, 0); wg.addColorStop(0, '#3a4277'); wg.addColorStop(1, '#2a2f5c'); x.fillStyle = wg; x.fill();
      // two freeways, either side of the line
      [[z => shore(z) - 60, 'rgba(240,226,196,.5)', 5], [z => -330 + 50 * Math.sin(z * .003), 'rgba(240,226,196,.35)', 4]].forEach(([f, c, w]) => { x.strokeStyle = c; x.lineWidth = w; x.beginPath(); for (let i = 0; i <= 100; i++) { const z = Z0 + i / 100 * S; i ? x.lineTo(px(f(z)), pz(z)) : x.moveTo(px(f(z)), pz(z)); } x.stroke(); });
    });
    const rough = canvas(256, 256, (x) => { x.fillStyle = 'rgb(0,240,0)'; x.fillRect(0, 0, 256, 256); x.fillStyle = 'rgb(0,40,0)'; x.beginPath(); x.moveTo(256, 0); for (let i = 0; i <= 50; i++) { const z = Z0 + i / 50 * S; x.lineTo((shore(z) - X0) / S * 256, (z - Z0) / S * 256); } x.lineTo(256, 256); x.fill(); });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: tex(col), roughnessMap: tex(rough, false), roughness: 1, metalness: .05, envMapIntensity: .8 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(X0 + S / 2, 0, Z0 + S / 2); this.scene.add(ground);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshBasicMaterial({ color: 0x3e4732 })); far.rotation.x = -Math.PI / 2; far.position.y = -.3; far.userData.noShadow = true; this.scene.add(far);
    // the hills to the west, low-poly and golden on their sunny side
    const hg = new THREE.PlaneGeometry(1400, 2600, 70, 120); hg.rotateX(-Math.PI / 2); const hp = hg.attributes.position, hc = [];
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i) - 1050, z = hp.getZ(i) - 300, k = Math.max(0, Math.min(1, (-x - 380) / 420));
      const h = k * (70 + 40 * Math.sin(z * .006) + 22 * Math.sin(z * .017 + x * .01) + 10 * Math.sin(x * .05 + z * .03)); hp.setY(i, h - 1);
      const c = new THREE.Color(0x4c5a38).lerp(new THREE.Color(0x7a6a46), Math.min(1, h / 110)); hc.push(c.r, c.g, c.b);
    }
    hg.translate(-1050, 0, -300); hg.setAttribute('color', new THREE.Float32BufferAttribute(hc, 3)); hg.computeVertexNormals();
    const hills = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, flatShading: true })); hills.userData.noShadow = true; this.scene.add(hills);
  }
  _line() {
    const pts = [V(110, 0, 640), V(60, 0, 420), V(20, 0, 210), V(-12, 0, 20), V(-35, 0, -170), V(-72, 0, -360), V(-100, 0, -560), V(-118, 0, -760), V(-128, 0, -980)];
    const c = this.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); this.L = c.getLength();
    const g = new THREE.Group(); this.scene.add(g);
    // ballast, two tracks and their ties, and catenary poles
    const ribbon = (off, w, y, mat, n = 600) => {
      const pos = [], idx = [];
      for (let i = 0; i <= n; i++) { const u = i / n, p = c.getPointAt(u), t = c.getTangentAt(u), nn = V(-t.z, 0, t.x); [-1, 1].forEach(sd => { const q = p.clone().addScaledVector(nn, off + sd * w / 2); pos.push(q.x, y, q.z); }); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.userData.keep = true; g.add(m); return m;
    };
    ribbon(2.3, 13, .03, new THREE.MeshStandardMaterial({ color: 0x5d534b, roughness: 1 }));
    const rail = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .8, roughness: .35 });
    [0, 4.6].forEach(o => [-.72, .72].forEach(d => ribbon(o + d, .12, .2, rail)));
    const nT = Math.floor(this.L / 1.25), ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, .1, .24), new THREE.MeshStandardMaterial({ color: 0x3b312a, roughness: .95 }), nT * 2), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < nT; i++) { const u = i / nT, p = c.getPointAt(u), t = c.getTangentAt(u), nn = V(-t.z, 0, t.x); q.setFromUnitVectors(V(1, 0, 0), nn); [0, 4.6].forEach((o, k) => { m.compose(p.clone().addScaledVector(nn, o).setY(.08), q, V(1, 1, 1)); ties.setMatrixAt(i * 2 + k, m); }); }
    ties.userData.noShadow = true; g.add(ties);
    const nP = Math.floor(this.L / 32), poles = new THREE.InstancedMesh(new THREE.BoxGeometry(.4, 7.6, .4), new THREE.MeshStandardMaterial({ color: 0x6b717b, metalness: .6, roughness: .5 }), nP * 2), wire = [];
    for (let i = 0; i < nP; i++) {
      const u = i / nP, p = c.getPointAt(u), t = c.getTangentAt(u), nn = V(-t.z, 0, t.x);
      m.compose(p.clone().addScaledVector(nn, 8.2).setY(3.8), q.identity(), V(1, 1, 1)); poles.setMatrixAt(i * 2, m);
      m.compose(p.clone().addScaledVector(nn, 4.3).setY(6.7), q.setFromUnitVectors(V(0, 1, 0), nn), V(.3, 1.04, .3)); poles.setMatrixAt(i * 2 + 1, m);
      if (i) { const a = c.getPointAt((i - 1) / nP); wire.push(a.x, 6.4, a.z, p.x, 6.4, p.z); }
    }
    poles.userData.cast = true; g.add(poles);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)); g.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x22242b })));
    // samples of the line for keeping buildings off it
    this.linePts = Array.from({ length: 160 }, (_, i) => c.getPointAt(i / 159));
  }
  _clear(x, z, d) { for (const p of this.linePts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d) return false; return x < shore(z) - 30; }
  // the towns along the line: blocks near the stations, houses between, trees everywhere, lit windows coming on
  _towns() {
    const s = this.scene, mob = this.mobile, nB = mob ? 650 : 1500, nT = mob ? 700 : 1600;
    const win = canvas(128, 64, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { x.fillStyle = rnd() < .45 ? (rnd() < .5 ? '#ffcf8a' : '#ffe2b0') : '#16141c'; x.fillRect(6 + c * 20, 6 + r * 20, 10, 10); } });
    const white = canvas(4, 4, x => { x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4); });
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, .5, 0);
    const blocks = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: tex(white), emissiveMap: tex(win), emissive: 0xffffff, emissiveIntensity: .85, roughness: .9 }), nB);
    const roofGeo = new THREE.CylinderGeometry(.62, .62, 1, 3, 1); roofGeo.rotateZ(Math.PI / 2); roofGeo.rotateX(Math.PI / 6);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), nB);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), cc = new THREE.Color(); let k = 0, kr = 0;
    const stopPts = STOP_U.map(u => this.curve.getPointAt(u));
    for (let tries = 0; k < nB && tries < nB * 6; tries++) {
      const near = rnd() < .55, sp = stopPts[Math.floor(rnd() * stopPts.length)];
      const x = near ? sp.x + (rnd() - .5) * 340 : -360 + rnd() * 640, z = near ? sp.z + (rnd() - .5) * 300 : -1150 + rnd() * 1900;
      const dense = near && Math.hypot(x - sp.x, z - sp.z) < 110;
      if (!this._clear(x, z, dense ? 34 : 22) || x < -400) continue;
      const w = dense ? 9 + rnd() * 8 : 7 + rnd() * 5, d = dense ? 9 + rnd() * 7 : 7 + rnd() * 5, h = dense ? 5 + rnd() * 7 : 4 + rnd() * 2.5;
      const yaw = Math.atan2(-.05, 1) + (rnd() < .5 ? 0 : Math.PI / 2) + (rnd() - .5) * .2; q.setFromAxisAngle(V(0, 1, 0), yaw);
      m.compose(V(x, 0, z), q, V(w, h, d)); blocks.setMatrixAt(k, m);
      blocks.setColorAt(k, cc.set([0xcdb79a, 0xc29f80, 0xb07e60, 0xc8c0b2, 0xa89886, 0x9c8c7c][Math.floor(rnd() * 6)])); k++;
      if (!dense) { m.compose(V(x, h + .32 * d * .5, z), q, V(w * 1.04, d * .55, d * 1.05)); roofs.setMatrixAt(kr, m); roofs.setColorAt(kr++, cc.set([0x9a4a32, 0x5a4a48, 0xa85a3a, 0x6a5450][Math.floor(rnd() * 4)])); }
    }
    blocks.count = k; roofs.count = kr; [blocks, roofs].forEach(o => { o.userData.cast = true; s.add(o); });
    const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: .95, flatShading: true }), nT); let kt = 0;
    for (let tries = 0; kt < nT && tries < nT * 5; tries++) {
      const x = -420 + rnd() * 700, z = -1200 + rnd() * 1950; if (!this._clear(x, z, 12)) continue;
      const sc = 3 + rnd() * 4; m.compose(V(x, sc * .8, z), q.setFromAxisAngle(V(0, 1, 0), rnd() * 6), V(sc, sc * (1 + rnd() * .5), sc)); trees.setMatrixAt(kt, m);
      trees.setColorAt(kt++, cc.set([0x24402f, 0x2c4a2f, 0x34502e, 0x3c5a34][Math.floor(rnd() * 4)]));
    }
    trees.count = kt; trees.userData.cast = true; s.add(trees);
  }
  // a station: platform on the west side (the train's door side), a canopy and name signs; Spirit Points also gets the billboard
  _stations() {
    const g = new THREE.Group(); this.scene.add(g); this.stops = [];
    const conc = new THREE.MeshStandardMaterial({ color: 0x8d857a, roughness: .92 }), dark = new THREE.MeshStandardMaterial({ color: 0x1f2a26, metalness: .5, roughness: .55 }), yellow = new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: .6 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x9a3a2e, roughness: .7 });
    STOP_U.forEach((u, i) => {
      const p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u), n = V(-t.z, 0, t.x), yaw = Math.atan2(-t.x, -t.z);
      const st = new THREE.Group(); st.position.copy(p); st.rotation.y = yaw; g.add(st); // local: -z along the line, -x toward the platform
      const front = -(W / 2 + .12), len = i === 4 ? 70 : 56;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(6, FLOOR, len), conc); slab.position.set(front - 3, FLOOR / 2, 0); st.add(slab);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(.5, .01, len), yellow); strip.position.set(front - .3, FLOOR + .005, 0); st.add(strip);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.2, .25, len * .6), roof); canopy.position.set(front - 3.4, 4.2, 0); canopy.userData.cast = true; st.add(canopy);
      for (let zz = -len * .27; zz <= len * .27; zz += len * .135) { const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 3.7, .18), dark); post.position.set(front - 4.2, FLOOR + 1.85, zz); post.userData.cast = true; st.add(post); }
      // the name sign, white with a red bar like the one on the home platform
      const c = canvas(512, 112, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#c9272c'; x.fillRect(0, 0, 18, h); x.fillStyle = '#16181f'; x.font = '900 54px Archivo, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText(STOPS[i].toUpperCase(), 40, h / 2 + 3, w - 60); });
      const signMat = new THREE.MeshBasicMaterial({ map: tex(c) });
      [-1, 1].forEach(sd => { const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.22), signMat); sign.position.set(front - 4.6, 3.1, sd * len * .2); sign.rotation.y = Math.PI / 2; st.add(sign); const back = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.32, 5.8), dark); back.position.set(front - 4.66, 3.1, sd * len * .2); st.add(back); });
      this.stops.push({ name: STOPS[i], u, p, t, n, label: p.clone().addScaledVector(n, -6).setY(11) });
    });
    // Spirit Points: a big billboard on posts across the tracks from the platform, facing east, so you read it with the sunset behind
    const sp = this.stops[4], bb = this.billboard = new THREE.Group(); bb.position.copy(sp.p).addScaledVector(sp.n, 26); bb.rotation.y = Math.atan2(sp.n.x, sp.n.z); g.add(bb);
    const steel = new THREE.MeshStandardMaterial({ color: 0x6b717b, metalness: .7, roughness: .45 });
    const posts = [-1, 1].map(sd => { const m = new THREE.Mesh(new THREE.BoxGeometry(.9, 1, .9), steel); m.userData.keep = true; m.userData.cast = true; bb.add(m); return { m, sd }; });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x15161b, metalness: .4, roughness: .6 })); frame.userData.keep = true; frame.userData.cast = true; bb.add(frame);
    const face = canvas(1024, 576, (x, w, h) => {
      const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1f2026'); gr.addColorStop(1, '#131418'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
      x.fillStyle = '#132047'; x.fillRect(0, 0, w, 96);
      if (this.logo) { x.save(); x.globalAlpha = .9; x.drawImage(this.logo, 30, 18, 60, 60); x.restore(); }
      x.fillStyle = '#fff'; x.font = '900 52px Archivo, Arial, sans-serif'; x.textBaseline = 'middle'; x.fillText('SPIRIT POINTS', 110, 50);
      for (let r = 0; r < 4; r++) for (let k = 0; k < 18; k++) { x.fillStyle = '#25262c'; x.fillRect(40 + k * 52, 150 + r * 100, 46, 70); x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(40 + k * 52, 184 + r * 100, 46, 2); }
    });
    const panel = this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex(face) })); panel.userData.keep = true; panel.userData.noShadow = true; bb.add(panel);
    const lamps = [-1, 0, 1].map(k => { const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, .3, .9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2b0).multiplyScalar(2.2) })); l.userData.keep = true; l.userData.noShadow = true; bb.add(l); return { l, k }; });
    this.bbParts = { posts, frame, lamps };
    this.setBillboard(1.6);
    mergeStatic(g);
  }
  // fit the billboard to a screen aspect; the leaderboard is laid over its face
  setBillboard(aspect) {
    const Hb = this.mobile ? 30 : 24, Wb = Hb * aspect, lift = 9, { posts, frame, lamps } = this.bbParts;
    this.bb = { W: Wb, H: Hb, lift };
    this.panel.scale.set(Wb, Hb, 1); this.panel.position.set(0, lift + Hb / 2, .62);
    frame.scale.set(Wb + 1.6, Hb + 1.6, 1.1); frame.position.set(0, lift + Hb / 2, 0);
    posts.forEach(({ m, sd }) => { m.scale.set(1, lift + 1, 1); m.position.set(sd * Wb * .3, (lift + 1) / 2, -.2); });
    lamps.forEach(({ l, k }) => { l.position.set(k * Wb * .33, lift + Hb + 1.4, 1.2); l.rotation.x = .5; });
  }

  /* ---------- the train ---------- */
  _train() {
    const paint = paintBody(this.logo), body = new THREE.MeshPhysicalMaterial({ map: paint.map, roughnessMap: paint.mr, metalnessMap: paint.mr, roughness: 1, metalness: 1, clearcoat: .35, clearcoatRoughness: .25 });
    const capM = new THREE.MeshStandardMaterial({ color: 0xaeb3bb, metalness: .7, roughness: .4 }), roofM = new THREE.MeshStandardMaterial({ color: 0x8f949c, metalness: .6, roughness: .5 }), under = new THREE.MeshStandardMaterial({ color: 0x24272e, metalness: .5, roughness: .7 });
    const winT = windowTexture(), winM = new THREE.MeshPhysicalMaterial({ map: winT, emissiveMap: winT, emissive: 0xffffff, emissiveIntensity: .45, roughness: .12, clearcoat: .6, alphaTest: .5 });
    const shell = bodyGeometry(), cap = capGeometry(); this.cars = [];
    for (let i = 0; i < 4; i++) {
      const car = new THREE.Group();
      const b = new THREE.Mesh(shell, body); b.userData.cast = true; car.add(b);
      [-1, 1].forEach(sd => { const c = new THREE.Mesh(cap, capM); c.rotation.y = sd * Math.PI / 2; c.position.x = sd * CAR_L / 2; car.add(c); });
      [-2, 2].forEach(x => { const ac = new THREE.Mesh(new THREE.BoxGeometry(1.5, .32, 1.5), roofM); ac.position.set(x, H + .18, 0); car.add(ac); });
      const door = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + .06, DOOR_H + .04, .06), capM); door.position.set(0, FLOOR + DOOR_H / 2, W / 2 + .01); car.add(door); // doors closed for the ride
      [-1, 1].forEach(x => { const bg = new THREE.Mesh(new THREE.BoxGeometry(2.3, .4, W - .5), under); bg.position.set(x * (CAR_L / 2 - 1.25), .32, 0); car.add(bg); });
      [1, -1].forEach(side => windowSlots().forEach(w => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), winM); p.position.set(w.x, w.y, side * (W / 2 + .014)); if (side < 0) p.rotation.y = Math.PI; car.add(p); }));
      if (i === 0) {
        const nose = new THREE.Mesh(noseGeometry(), new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, emissive: 0xffffff, emissiveIntensity: 2 }));
        const pn = paintNose(this.logo, ctx => drawLED(ctx, ['SPIRIT POINTS', 'EXPRESS'])); Object.assign(nose.material, { map: pn.map, emissiveMap: pn.glow, roughnessMap: pn.mr });
        nose.position.x = -CAR_L / 2; nose.userData.cast = true; car.add(nose);
      }
      mergeStatic(car); this.scene.add(car); this.cars.push(car);
    }
  }
  // arc length of the train's front when its middle is at stop i
  stopS(i) { return STOP_U[i] * this.L + NOSE_L + 2 * (CAR_L + GAP) - GAP / 2; }
  placeTrain(sFront) {
    this.sFront = sFront; const L = this.L;
    this.cars.forEach((car, i) => {
      const s = sFront - NOSE_L - CAR_L / 2 - i * (CAR_L + GAP), u = Math.max(0, Math.min(1, s / L)), p = this.curve.getPointAt(u), t = this.curve.getTangentAt(u);
      car.position.copy(p); car.rotation.y = Math.atan2(t.z, -t.x);
    });
    const mid = Math.max(0, Math.min(1, (sFront - NOSE_L - 2 * (CAR_L + GAP)) / L));
    this.mid = this.curve.getPointAt(mid); this.tan = this.curve.getTangentAt(mid);
  }

  /* ---------- the ride ---------- */
  // segments between stops: travel `go` seconds, then dwell; the last one eases in slowest
  start(cb = {}) {
    this.cb = cb; this.state = 'ride'; this.rt = 0; this.leg = 0; this.dwell = 0; this.legT = 0;
    this.placeTrain(this.stopS(0)); this._chase(1, true); this.intro = 0;
  }
  // straight to the billboard (a reload, or no time for the ride)
  jumpToBoard() {
    this.leg = STOPS.length - 1; this.placeTrain(this.stopS(this.leg)); this.state = 'board'; this.cb = this.cb || {};
    const f = this.finalPose(); this.camera.position.copy(f.pos); this.look.copy(f.look); this.from = f.pos.clone(); this.fromLook = f.look.clone(); this.at = 99;
  }
  skip() { if (this.state !== 'ride') return; this.leg = STOPS.length - 1; this.placeTrain(this.stopS(this.leg)); this.speed = 0; this._arrive(true); }
  _arrive(skipped) {
    this.state = 'arrive'; this.at = 0; this.from = this.camera.position.clone(); this.fromLook = this.look.clone();
    this.cb.arrive && this.cb.arrive(skipped);
  }
  update(dt) {
    this.t += dt;
    if (this.state === 'ride') {
      const last = STOPS.length - 1, go = this.leg === last - 1 ? 3.6 : 2.7;
      if (this.dwell > 0) { this.dwell -= dt; this.speed = 0; if (this.dwell <= 0) { this.legT = 0; this.cb.depart && this.cb.depart(this.leg); } }
      else {
        this.legT += dt; const p = Math.min(1, this.legT / go), a = this.stopS(this.leg), b = this.stopS(this.leg + 1);
        // accelerate briskly, cruise, then brake into the platform (the last stop brakes longer)
        const k = this.leg === last - 1 ? 1 - Math.pow(1 - smooth(p), 1.6) : easeInOut(p), prev = this.sFront;
        this.placeTrain(a + (b - a) * k); this.speed = Math.min(1, Math.abs(this.sFront - prev) / Math.max(dt, 1e-3) / 140);
        if (p >= 1) { this.leg++; this.speed = 0; this.cb.stop && this.cb.stop(this.leg); if (this.leg === last) this._arrive(false); else this.dwell = .75; }
      }
      this._chase(dt);
    } else if (this.state === 'arrive' || this.state === 'board') {
      this.at += dt; const k = easeInOut(Math.min(1, this.at / 2.4)), f = this.finalPose();
      this.camera.position.lerpVectors(this.from, f.pos, k); this.look.lerpVectors(this.fromLook, f.look, k);
      if (this.at >= 2.4 && this.state === 'arrive') { this.state = 'board'; this.cb.board && this.cb.board(); }
    } else this._chase(dt);
    this.camera.lookAt(this.look);
    this.sky.position.copy(this.camera.position);
    const fc = this.state === 'ride' ? this.mid : this.billboard.position; // shadows follow the action
    this.sun.position.copy(fc).addScaledVector(this.lightDir, 300); this.sun.target.position.copy(fc);
  }
  // a drone chasing the train: low beside it at the platform, then up and behind as it picks up speed
  _chase(dt, snap) {
    const t = this.tan, n = V(-t.z, 0, t.x), m = this.mid, k = Math.min(1, (this.rt = (this.rt || 0) + dt) / 3.2), e = smooth(k), wob = Math.sin(this.t * .25);
    const back = 16 + 62 * e, side = 12 + (30 + wob * 10) * e, up = 5 + 58 * e;
    this.camPos.copy(m).addScaledVector(t, -back).addScaledVector(n, side).setY(up);
    this.camLook.copy(m).addScaledVector(t, 18 + 34 * e).setY(2);
    if (snap) { this.camera.position.copy(this.camPos); this.look.copy(this.camLook); return; }
    const a = 1 - Math.pow(.02, dt); this.camera.position.lerp(this.camPos, a); this.look.lerp(this.camLook, a);
  }
  // straight in front of the billboard, at the distance where its face fills the board's box on screen
  finalPose() {
    const bb = this.billboard, n = V(Math.sin(bb.rotation.y), 0, Math.cos(bb.rotation.y)), c = bb.position.clone().setY(this.bb.lift + this.bb.H / 2);
    const fill = this.fill || .8, d = (this.bb.H / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / fill;
    return { pos: c.clone().addScaledVector(n, d + .62), look: c };
  }
  // where the billboard's face lands on screen, in CSS pixels
  panelRect() {
    const p = this.panel; p.updateWorldMatrix(true, false); const out = { l: 1e9, r: -1e9, t: 1e9, b: -1e9 };
    [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].forEach(([x, y]) => { const v = V(x, y, 0).applyMatrix4(p.matrixWorld).project(this.camera); const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; out.l = Math.min(out.l, sx); out.r = Math.max(out.r, sx); out.t = Math.min(out.t, sy); out.b = Math.max(out.b, sy); });
    return out;
  }
  project(v) { const p = v.clone().project(this.camera); if (p.z > 1) return null; return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 1.75));
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); if (this.bloom) this.bloom.resolution.set(w / 2, h / 2);
  }
  render() { this.composer.render(); }
  // draw everything once behind the loading screen, from the start and from the billboard, so nothing hitches later
  async warm() {
    try { if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera); } catch (e) {}
    const culled = []; this.scene.traverse(o => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    this.render(); const cam = this.camera.position.clone(), look = this.look.clone(), f = this.finalPose();
    this.camera.position.copy(f.pos); this.camera.lookAt(f.look); this.render();
    culled.forEach(o => { o.frustumCulled = true; }); this.camera.position.copy(cam); this.look.copy(look); this.camera.lookAt(look);
  }
}
