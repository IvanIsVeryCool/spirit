import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from '/vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/jsm/postprocessing/OutputPass.js';
import { buildHand, loadPhotoHand, photoHand } from './hands.js';
import { CAR_L, GAP, W, H, BASE, FLOOR, DOOR_W, DOOR_H, NOSE_L, bodyGeometry, capGeometry, noseGeometry, nosePoint, paintBody, paintNose, windowTexture, interiorTexture, windowSlots } from './train.js';

// A golden-hour Peninsula platform and a red-and-silver double-decker commuter train.
const COL = {
  skyTop: '#1c2a66', skyMid: '#7468ab', horizon: '#ffb07a', sun: '#ffd08e',
  body: 0xc8ccd3, red: 0xc9272c, dark: 0x16181f, concrete: 0x8d857a, warm: 0xffc58a
};
const M_SOLE = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: .9 });
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const glow = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }); m.toneMapped = false; return m; };
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/* dot-matrix LED sign, drawn into a canvas */
function drawLED(ctx, lines, { lit = '#ffad1f', dim = '#2b1a05', CW = 160, CH = 32 } = {}) {
  const P = 4, cv = ctx.canvas;
  const src = drawLED.src || (drawLED.src = document.createElement('canvas')); src.width = CW; src.height = CH;
  const s = src.getContext('2d', { willReadFrequently: true }); s.clearRect(0, 0, CW, CH); s.fillStyle = '#fff'; s.textAlign = 'center'; s.textBaseline = 'middle';
  lines.forEach((t, i) => {
    let size = i === 0 ? 13 : 10; s.font = `bold ${size}px "DotGothic16", monospace`;
    while (s.measureText(t).width > CW - 6 && size > 7) { size--; s.font = `bold ${size}px "DotGothic16", monospace`; }
    s.fillText(t, CW / 2, lines.length === 1 ? CH / 2 : (i === 0 ? 10 : 24));
  });
  const d = s.getImageData(0, 0, CW, CH).data;
  ctx.fillStyle = '#07070a'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const on = d[(y * CW + x) * 4 + 3] > 110;
    ctx.fillStyle = on ? lit : dim;
    ctx.beginPath(); ctx.arc(x * P + P / 2, y * P + P / 2, on ? 1.7 : 1.2, 0, 7); ctx.fill();
  }
}

/* painted textures for the train */
function grilleTex() {
  return canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#7c838d'; x.fillRect(0, 0, w, h); x.fillStyle = '#4c525b'; for (let i = 2; i < h; i += 6) x.fillRect(4, i, w - 8, 3); });
}

export class Station {
  constructor(canvas, { mobile, doors, logo }) {
    this.mobile = mobile; this.data = doors; this.count = doors.length; this.logo = logo;
    this.hands = null; loadPhotoHand().then(h => { this.hands = h; }).catch(() => {}); // the photo-textured hands for the opening; drawn ones if they don't arrive
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    if (!mobile) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
    const s = this.scene = new THREE.Scene();
    s.fog = new THREE.Fog(new THREE.Color(COL.horizon).lerp(new THREE.Color(COL.skyMid), .35), 45, 230);
    this.pm = new THREE.PMREMGenerator(r);
    this.camera = new THREE.PerspectiveCamera(mobile ? 50 : 36, 1, .1, 900);
    this.clock = new THREE.Clock();
    this.mouse = new THREE.Vector2(); this.par = new THREE.Vector2();
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.hover = -1; this.focus = 0; this.flight = null; this.trainX = 70; this.arrival = null; this.sway = 0;

    this.sunDir = new THREE.Vector3(-.36, .15, -.92).normalize();
    s.add(new THREE.HemisphereLight(0x9fb2ff, 0x5a3b2c, .9));
    const sun = this.sunLight = new THREE.DirectionalLight(0xffc690, 2.1);
    sun.position.set(-32, 11, 16); s.add(sun); s.add(sun.target);
    if (!mobile) {
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 16, bottom: -12, near: 1, far: 100 });
      sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
    }
    const fill = new THREE.DirectionalLight(0x8d9cff, .5); fill.position.set(14, 8, 18); s.add(fill);

    this._sky(); this._hills(); this._trees(); this._tracks(); this._platform(); this._wires(); this._props(); this._train(); this._motes();
    s.traverse(o => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = !!o.userData.cast; o.receiveShadow = true; } });

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(s, this.camera));
    if (!mobile) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .45, .82); this.composer.addPass(this.bloom); }
    this.composer.addPass(new OutputPass());
    this.resize(); this.parkedPose(true);
  }

  /* ---------- world ---------- */
  _sky() {
    const u = {
      top: { value: new THREE.Color(COL.skyTop) }, mid: { value: new THREE.Color(COL.skyMid) }, hor: { value: new THREE.Color(COL.horizon) },
      sunCol: { value: new THREE.Color(COL.sun) }, sunDir: { value: this.sunDir }
    };
    const m = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `uniform vec3 top, mid, hor, sunCol, sunDir; varying vec3 vDir;
        void main(){ vec3 v = normalize(vDir); float h = v.y;
          vec3 c = mix(hor, mid, smoothstep(.0, .22, h)); c = mix(c, top, smoothstep(.18, .7, h));
          c = mix(c, hor * .82, smoothstep(.0, -.08, h));
          float s = max(dot(v, normalize(sunDir)), 0.);
          c += sunCol * (pow(s, 900.) * 4. + pow(s, 40.) * .32 + pow(s, 6.) * .12);
          gl_FragColor = vec4(c, 1.); }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), m); sky.userData.noShadow = true; sky.frustumCulled = false; sky.renderOrder = -1;
    this.scene.add(sky); this.sky = sky;
    // reflections come from this same sunset sky, so glass and metal pick up its colors
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
    const room = new RoomEnvironment(); room.scale.setScalar(.02); room.position.y = -1; envScene.add(room);
    this.scene.environment = this.pm.fromScene(envScene, .02, .1, 100).texture;
  }
  _hills() {
    const layers = [[-240, '#8a75a8', 30, 14], [-170, '#6b5a92', 22, 11], [-110, '#4b4274', 14, 8], [-70, '#35335a', 8, 5]];
    layers.forEach(([z, col, hgt, base], li) => {
      const sh = new THREE.Shape(), seed = li * 13.7; sh.moveTo(-500, -20);
      for (let x = -500; x <= 500; x += 6) {
        const y = base + hgt * (.5 + .3 * Math.sin(x * .011 + seed) + .15 * Math.sin(x * .031 + seed * 2) + .07 * Math.sin(x * .09 + seed * 3)) - hgt * .4;
        sh.lineTo(x, y);
      }
      sh.lineTo(500, -20); sh.closePath();
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: col, fog: false }));
      mesh.position.z = z; mesh.userData.noShadow = true; this.scene.add(mesh);
    });
  }
  _trees() {
    const n = this.mobile ? 40 : 80, geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x24402f, roughness: .95, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = 1.6 + Math.random() * 2.6;
      p.set(-90 + Math.random() * 180, s * .7 + Math.random(), -13 - Math.random() * 22);
      sc.set(s * (1 + Math.random() * .5), s * (.9 + Math.random() * .6), s);
      q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)); m.compose(p, q, sc); inst.setMatrixAt(i, m);
    }
    inst.userData.noShadow = true; this.scene.add(inst);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: .9 }), frondMat = new THREE.MeshStandardMaterial({ color: 0x2c4a2f, roughness: .9, side: THREE.DoubleSide, flatShading: true });
    [[-26, -13], [10, -15], [31, -12], [-48, -18]].forEach(([x, z]) => {
      const g = new THREE.Group(), h = 9 + Math.random() * 3;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .26, h, 7), trunkMat); trunk.position.y = h / 2; trunk.rotation.z = (Math.random() - .5) * .12; g.add(trunk);
      for (let k = 0; k < 9; k++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(.35, 3.4, 4, 1, true), frondMat);
        f.scale.set(1, 1, .18); f.position.y = h; f.rotation.set(0, k / 9 * Math.PI * 2, 0);
        f.rotateX(-1.9 - Math.random() * .4); f.translateY(1.5); g.add(f);
      }
      g.position.set(x, 0, z); g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; }); this.scene.add(g);
    });
  }
  _tracks() {
    const s = this.scene;
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(400, 30), new THREE.MeshStandardMaterial({ color: 0x5d534b, roughness: 1 }));
    bed.rotation.x = -Math.PI / 2; bed.position.set(0, -.02, -8); s.add(bed);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 200), new THREE.MeshStandardMaterial({ color: 0x3f4a33, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.06, -110); ground.userData.noShadow = true; s.add(ground);
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(.24, .1, 2.6), new THREE.MeshStandardMaterial({ color: 0x3b312a, roughness: .95 }), 1300);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .9, roughness: .3 });
    const m = new THREE.Matrix4(); let k = 0;
    [0, -4.6].forEach(z => {
      for (let x = -200; x < 200 && k < 1300; x += .62) { m.makeTranslation(x, .05, z); ties.setMatrixAt(k++, m); }
      [-.72, .72].forEach(dz => { const rail = new THREE.Mesh(new THREE.BoxGeometry(400, .12, .08), railMat); rail.position.set(0, .16, z + dz); s.add(rail); });
    });
    ties.count = k; s.add(ties);
    const fence = new THREE.Mesh(new THREE.BoxGeometry(400, 1.4, .04), new THREE.MeshStandardMaterial({ color: 0x2e3138, metalness: .5, roughness: .6, transparent: true, opacity: .55 }));
    fence.position.set(0, .7, -8.2); fence.userData.noShadow = true; s.add(fence);
  }
  _platform() {
    const s = this.scene, front = W / 2 + .12; this.front = front;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(400, 1.6, 60), new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: .92 }));
    slab.position.set(0, FLOOR - .8, front + 30); s.add(slab);
    const tex = canvasTex(64, 64, (x) => {
      x.fillStyle = '#e8b923'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#c99a12';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(8 + i * 16, 8 + j * 16, 4.5, 0, 7); x.fill(); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(400 / .6, 1);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(400, .6), new THREE.MeshStandardMaterial({ map: tex, roughness: .7 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, FLOOR + .005, front + .3); s.add(strip);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(400, .1), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .6 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, FLOOR + .006, front + 1.2); s.add(line);
    const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, .01, 40), new THREE.MeshStandardMaterial({ color: 0x766e64, roughness: .95 }), 70), m = new THREE.Matrix4();
    for (let i = 0; i < 70; i++) { m.makeTranslation(-140 + i * 4, FLOOR + .004, front + 21.6); joints.setMatrixAt(i, m); } s.add(joints);
  }
  _wires() {
    const s = this.scene, poleMat = new THREE.MeshStandardMaterial({ color: 0x6b717b, metalness: .7, roughness: .45 });
    const pts = [];
    for (let x = -120; x <= 120; x += 16) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(.28, 7.6, .28), poleMat); pole.position.set(x, 3.8, -7.2); pole.userData.cast = true; s.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 8), poleMat); arm.position.set(x, 6.7, -3.3); arm.userData.cast = true; s.add(arm);
    }
    [0, -4.6].forEach(z => {
      for (let x = -120; x < 120; x += 16) {
        pts.push(x, 5.35, z, x + 16, 5.35, z);
        for (let k = 0; k < 8; k++) {
          const a = x + k * 2, b = a + 2, sag = u => 6.45 - .5 * Math.sin(Math.PI * (u - x) / 16);
          pts.push(a, sag(a), z, b, sag(b), z);
          if (k) pts.push(a, sag(a), z, a, 5.35, z);
        }
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    s.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x22242b })));
  }
  _props() {
    const s = this.scene, metal = new THREE.MeshStandardMaterial({ color: 0x1f2a26, metalness: .5, roughness: .55 });
    const z = this.front;
    const P = CAR_L + GAP;
    [-3 * P, -P, P, 3 * P].forEach(x => { // lamp posts, placed between the doors
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 4.6, 8), metal); pole.position.y = 2.3; g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .9), metal); arm.position.set(0, 4.55, -.42); g.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(.32, .12, .5), metal); head.position.set(0, 4.5, -.8); g.add(head);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.26, .02, .42), glow(COL.warm, 3.2)); lamp.position.set(0, 4.43, -.8); g.add(lamp);
      g.position.set(x, FLOOR, z + 7.2); g.traverse(o => { if (o.isMesh) o.userData.cast = true; }); s.add(g);
    });
    [-2 * P, 0, 2 * P].forEach(x => { // benches (you sit on the middle one in the opening)
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, .08, .5), metal); seat.position.y = .48; g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, .5, .06), metal); back.position.set(0, .8, .24); g.add(back);
      [-.9, .9].forEach(dx => { const leg = new THREE.Mesh(new THREE.BoxGeometry(.06, .48, .44), metal); leg.position.set(dx, .24, 0); g.add(leg); });
      g.position.set(x, FLOOR, z + 5.8); g.traverse(o => { if (o.isMesh) o.userData.cast = true; }); s.add(g);
    });
  }
  _motes() {
    const n = this.mobile ? 300 : 700, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - .5) * 70; p[i * 3 + 1] = Math.random() * 7; p[i * 3 + 2] = -4 + Math.random() * 20; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd9a8, size: .045, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.motes);
  }

  /* ---------- the train ---------- */
  _train() {
    const train = this.train = new THREE.Group(); this.scene.add(train);
    const paint = paintBody(this.logo);
    const M = this.mats = {
      body: new THREE.MeshPhysicalMaterial({ map: paint.map, roughnessMap: paint.mr, metalnessMap: paint.mr, roughness: 1, metalness: 1, clearcoat: .35, clearcoatRoughness: .25, envMapIntensity: 1 }),
      cap: new THREE.MeshStandardMaterial({ color: 0xaeb3bb, metalness: .7, roughness: .4 }),
      dark: new THREE.MeshStandardMaterial({ color: COL.dark, metalness: .4, roughness: .6 }),
      under: new THREE.MeshStandardMaterial({ color: 0x24272e, metalness: .5, roughness: .7 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: .85, roughness: .35 }),
      gray: new THREE.MeshStandardMaterial({ color: 0x6d737c, metalness: .5, roughness: .5 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x8f949c, metalness: .6, roughness: .5 }),
      grille: new THREE.MeshStandardMaterial({ map: grilleTex(), metalness: .5, roughness: .6 }),
      gasket: new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: .8 }),
      door: new THREE.MeshPhysicalMaterial({ color: 0xc9ced5, metalness: .8, roughness: .3, clearcoat: .3 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xe8b923, roughness: .5 })
    };
    const winT = windowTexture();
    M.window = new THREE.MeshPhysicalMaterial({ map: winT, emissiveMap: winT, emissive: 0xffffff, emissiveIntensity: .22, roughness: .04, metalness: 0, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.6, alphaTest: .5 });
    this.interior = interiorTexture();
    const shell = bodyGeometry(), cap = capGeometry();
    this.cars = []; this.doors = [];
    for (let i = 0; i < this.count; i++) {
      const car = new THREE.Group(); car.position.x = (i - (this.count - 1) / 2) * (CAR_L + GAP);
      const body = new THREE.Mesh(shell, M.body); body.userData.cast = true; car.add(body);
      [-1, 1].forEach(sd => { if (i === 0 && sd < 0) return; const c = new THREE.Mesh(cap, M.cap); c.rotation.y = sd * Math.PI / 2; c.position.x = sd * CAR_L / 2; car.add(c); });
      this._roof(car); this._under(car); this._side(car, i);
      train.add(car); this.cars.push(car);
    }
    this._cab(); this._pantograph();
    for (let i = 0; i < this.count - 1; i++) this._gangway(this.cars[i].position.x + CAR_L / 2 + GAP / 2);
    const last = this.cars[this.count - 1];
    [-.85, .85].forEach(dz => { const t = new THREE.Mesh(new THREE.BoxGeometry(.04, .12, .22), glow(0xff2a2a, 3)); t.position.set(CAR_L / 2 + .02, 1.1, dz); last.add(t); });
  }
  _roof(car) {
    const M = this.mats;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - .3, .04, W - 1), M.roof); roof.position.y = H + .02; car.add(roof);
    // air-conditioning units with grilles, a walkway strip and roof hatches
    [-2, 2].forEach(x => {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.5, .32, 1.5), M.roof); ac.position.set(x, H + .18, 0); ac.userData.cast = true; car.add(ac);
      [-1, 1].forEach(sd => { const gr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .22), M.grille); gr.position.set(x, H + .19, sd * .76); if (sd < 0) gr.rotation.y = Math.PI; car.add(gr); });
      const top = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .05, 20), M.grille); top.position.set(x, H + .36, 0); car.add(top);
    });
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(.7, .06, .7), M.gray); hatch.position.set(0, H + .05, 0); car.add(hatch);
    // rain gutter along the roof edge
    const gut = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - .1, .04, .04), M.gray); gut.position.set(0, H - .32, W / 2 + .05); car.add(gut);
  }
  _under(car) {
    const M = this.mats;
    // two bogies, each with side frames, springs, axle boxes and two wheelsets
    [-1, 1].forEach(sd => {
      const bx = sd * (CAR_L / 2 - 1.25), g = new THREE.Group(); g.position.set(bx, 0, 0);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, .2, W - .5), M.under); frame.position.y = .32; g.add(frame);
      [-.82, .82].forEach(dz => {
        const sf = new THREE.Mesh(new THREE.BoxGeometry(2.2, .16, .12), M.under); sf.position.set(0, .3, dz); g.add(sf);
        [-.7, .7].forEach(dx => {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .1, 20), M.dark); wheel.rotation.x = Math.PI / 2; wheel.position.set(dx, .27, dz * .9); g.add(wheel);
          const rim = new THREE.Mesh(new THREE.TorusGeometry(.2, .025, 6, 20), M.steel); rim.position.set(dx, .27, dz * .9 + Math.sign(dz) * .055); g.add(rim);
          const box = new THREE.Mesh(new THREE.BoxGeometry(.24, .2, .16), M.gray); box.position.set(dx, .3, dz + Math.sign(dz) * .1); g.add(box);
          const spring = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .2, 8), M.steel); spring.position.set(dx, .48, dz); g.add(spring);
        });
        const damper = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .5, 8), M.yellow); damper.rotation.z = Math.PI / 2.6; damper.position.set(0, .42, dz + Math.sign(dz) * .1); g.add(damper);
      });
      car.add(g);
    });
    // equipment boxes and air tanks between the bogies
    [[-.6, .9, .34], [.7, 1.2, .3]].forEach(([x, len, hgt]) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(len, hgt, W - .9), M.under); box.position.set(x, BASE - hgt / 2 + .02, 0); car.add(box);
    });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 1.4, 14), M.gray); tank.rotation.z = Math.PI / 2; tank.position.set(-.1, .14, W / 2 - .55); car.add(tank);
  }
  _side(car, i) {
    const M = this.mats, z = W / 2 + .01;
    const side = (geo, mat, x, y, dz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z + dz); car.add(m); return m; };
    // flush tinted windows, set into the painted gaskets
    windowSlots().forEach(w => side(new THREE.PlaneGeometry(w.w, w.h), M.window, w.x, w.y, .004));
    // door: recess, interior, sliding stainless leaves with tall windows, grab handles, status lights, step
    side(new THREE.BoxGeometry(DOOR_W + .1, DOOR_H + .06, .02), M.dark, 0, FLOOR + DOOR_H / 2, -.006);
    const lightMat = new THREE.MeshBasicMaterial({ map: this.interior, color: 0x000000 }); lightMat.toneMapped = false;
    side(new THREE.PlaneGeometry(DOOR_W - .04, DOOR_H - .04), lightMat, 0, FLOOR + DOOR_H / 2, .006);
    const leaves = [-1, 1].map(sd => {
      const leaf = new THREE.Group();
      leaf.add(new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, DOOR_H, .045), M.door));
      const wg = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2 - .14, 1.02, .02), M.gasket); wg.position.set(0, .28, .024); leaf.add(wg);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W / 2 - .2, .96), M.window); w.position.set(0, .28, .036); leaf.add(w);
      const seal = new THREE.Mesh(new THREE.BoxGeometry(.03, DOOR_H, .03), M.dark); seal.position.set(-sd * (DOOR_W / 4 - .015), 0, .026); leaf.add(seal);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .015, 16), glow(0x5dff8f, .2)); btn.rotation.x = Math.PI / 2; btn.position.set(-sd * (DOOR_W / 4 - .1), -.12, .03); leaf.add(btn);
      leaf.position.set(sd * DOOR_W / 4, FLOOR + DOOR_H / 2, z + .03); leaf.userData.sd = sd; leaf.userData.btn = btn; car.add(leaf); return leaf;
    });
    [-1, 1].forEach(sd => side(new THREE.CylinderGeometry(.018, .018, 1.1, 8), M.steel, sd * (DOOR_W / 2 + .1), FLOOR + 1.15, .04));
    const statusMats = [-1, 1].map(sd => { const m = glow(0xffa31f, .3); side(new THREE.BoxGeometry(.09, .05, .02), m, sd * (DOOR_W / 2 + .1), FLOOR + DOOR_H + .12, .01); return m; });
    side(new THREE.BoxGeometry(DOOR_W + .1, .04, .22), M.steel, 0, FLOOR - .01, .1);
    side(new THREE.BoxGeometry(DOOR_W + .1, .045, .04), M.yellow, 0, FLOOR, .2);
    // LED destination sign over the door
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const ledMat = new THREE.MeshBasicMaterial({ map: tex }); ledMat.toneMapped = false;
    side(new THREE.BoxGeometry(2.1, .6, .04), M.dark, 0, 3.08, .005);
    side(new THREE.PlaneGeometry(2, .5), ledMat, 0, 3.08, .03);
    side(new THREE.PlaneGeometry(.5, .25), new THREE.MeshBasicMaterial({ map: this._plate(String(i + 1).padStart(2, '0')), transparent: true }), CAR_L / 2 - .55, 3.3, .005);
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6), new THREE.MeshBasicMaterial({ color: COL.warm, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: this._spillTex() }));
    spill.rotation.x = -Math.PI / 2; spill.position.set(0, FLOOR + .012, z + 1.35); spill.userData.noShadow = true; car.add(spill);
    let pl = null; if (!this.mobile) { pl = new THREE.PointLight(COL.warm, 0, 6, 1.6); pl.position.set(0, 1.6, z + .7); car.add(pl); }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + .6, DOOR_H + 1, .8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, FLOOR + DOOR_H / 2 + .3, z + .2); hit.userData.door = i; hit.userData.noShadow = true; car.add(hit);
    this.doors.push({ leaves, lightMat, spill, pl, hit, statusMats, open: 0, target: 0, hover: 0, led: { ctx: cv.getContext('2d'), tex, mat: ledMat, page: 0, key: '' } });
    this.drawSign(i);
  }
  _gangway(x) {
    const M = this.mats, g = new THREE.Group(); g.position.x = x;
    const core = new THREE.Mesh(new THREE.BoxGeometry(GAP + .3, H - 1.1, W - .7), M.dark); core.position.y = BASE + (H - 1.1) / 2 + .25; g.add(core);
    for (let k = 0; k < 5; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(.035, H - 1, W - .6), M.under); rib.position.set(-GAP / 2 - .1 + k * (GAP + .2) / 4, BASE + (H - 1) / 2 + .22, 0); g.add(rib); }
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(GAP + .5, .14, .3), M.under); coupler.position.y = .42; g.add(coupler);
    this.train.add(g);
  }
  _plate(text) {
    return canvasTex(128, 64, (x) => { x.fillStyle = '#1b1d24'; x.font = '800 44px "Archivo", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 34); });
  }
  _cab() {
    const M = this.mats, first = this.cars[0], x0 = -CAR_L / 2;
    const nose = new THREE.Mesh(noseGeometry(), new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, emissive: 0xffffff, emissiveIntensity: 2.2 }));
    nose.position.x = x0; nose.userData.cast = true; first.add(nose); this.noseMesh = nose;
    this._paintNose();
    // wipers resting at the bottom of the windshield
    [.36, .64].forEach(v => {
      const th = v * Math.PI * 2 - Math.PI / 2, a = nosePoint(.85, th, .02), b = nosePoint(.7, th - .25, .03);
      const wp = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, a.distanceTo(b), 6), M.dark);
      wp.position.copy(a).add(b).multiplyScalar(.5); wp.position.x += x0; wp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); first.add(wp);
    });
    // plow and coupler under the nose
    const plow = new THREE.Mesh(new THREE.BoxGeometry(.6, .3, W - .3), M.under); plow.position.set(x0 - NOSE_L + .55, .2, 0); plow.rotation.z = -.4; first.add(plow);
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(.5, .16, .28), M.steel); coupler.position.set(x0 - NOSE_L + .15, .45, 0); first.add(coupler);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, .32, 10), M.steel); horn.rotation.z = Math.PI / 2; horn.position.set(x0 - .2, H + .02, .4); first.add(horn);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: .05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.rotation.z = -Math.PI / 2; beam.position.set(x0 - NOSE_L - 7, 1.25, 0); beam.userData.noShadow = true; first.add(beam); this.headBeam = beam;
  }
  _paintNose() {
    const p = paintNose(this.logo, ctx => drawLED(ctx, ['SPIRIT CABINET', 'EXPRESS']));
    const m = this.noseMesh.material; ['map', 'emissiveMap', 'roughnessMap'].forEach(k => m[k] && m[k].dispose());
    m.map = p.map; m.emissiveMap = p.glow; m.roughnessMap = p.mr; m.needsUpdate = true;
  }
  _pantograph() {
    const M = this.mats, car = this.cars[0];
    const strut = (a, b, r = .035, mat = M.steel) => {
      const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 6), mat);
      m.position.copy(a).addScaledVector(v, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.userData.cast = true; car.add(m);
    };
    const x = 1.6, y0 = H + .05, top = 5.33, insMat = new THREE.MeshStandardMaterial({ color: 0xb24a3a, roughness: .5 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, .08, 1.1), M.gray); frame.position.set(x, y0 + .2, 0); car.add(frame);
    [[-.7, -.45], [-.7, .45], [.7, -.45], [.7, .45]].forEach(([dx, dz]) => { // insulators: stacked discs
      for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .035, 12), insMat); d.position.set(x + dx, y0 + .04 + k * .05, dz); car.add(d); }
    });
    [-.32, .32].forEach(zz => {
      strut(new THREE.Vector3(x - .6, y0 + .24, zz), new THREE.Vector3(x + .45, y0 + .72, zz * .5), .04);
      strut(new THREE.Vector3(x + .45, y0 + .72, zz * .5), new THREE.Vector3(x - .2, top - .06, zz * .25), .03);
    });
    strut(new THREE.Vector3(x - .5, y0 + .26, 0), new THREE.Vector3(x + .3, y0 + .62, 0), .02);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.14, .05, 1.5), M.dark); head.position.set(x - .2, top, 0); car.add(head);
    [-1, 1].forEach(sd => { const horn = new THREE.Mesh(new THREE.TorusGeometry(.12, .02, 6, 10, Math.PI / 2), M.steel); horn.position.set(x - .2, top - .1, sd * .75); horn.rotation.set(0, sd > 0 ? 0 : Math.PI, sd > 0 ? 0 : 0); car.add(horn); });
    // roof busbar running forward from the pantograph
    strut(new THREE.Vector3(x - .8, y0 + .2, .5), new THREE.Vector3(-CAR_L / 2 + .3, y0 + .2, .5), .025, M.gray);
  }
  _spillTex() {
    if (this._spill) return this._spill;
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 128);
    const h = x.createLinearGradient(0, 0, 64, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(.25, 'rgba(0,0,0,0)'); h.addColorStop(.75, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 128);
    return (this._spill = new THREE.CanvasTexture(c));
  }
  drawSign(i) {
    const d = this.doors[i], info = this.data[i], L = d.led;
    const second = L.page % 2 ? `CAR ${String(i + 1).padStart(2, '0')}` : (info.href ? 'NOW BOARDING' : 'COMING SOON');
    if (second === L.key) return; L.key = second;
    drawLED(L.ctx, [info.title.toUpperCase(), second]);
    L.tex.needsUpdate = true;
  }
  redrawSigns() {
    this.doors.forEach((d, i) => { d.led.key = ''; this.drawSign(i); });
    if (this.noseMesh) this._paintNose();
  }

  /* ---------- first-person opening: you sit on the bench and wait ---------- */
  _rig(ticketCanvas) {
    const g = new THREE.Group(), z0 = this.front + 5.8;
    this.seat = new THREE.Vector3(0, 2.0, z0 + .08);
    // the ticket, held in both hands
    const rig = new THREE.Group(); g.add(rig);
    const tt = new THREE.CanvasTexture(ticketCanvas); tt.colorSpace = THREE.SRGBColorSpace; tt.anisotropy = 8;
    const pg = new THREE.PlaneGeometry(.3, .13, 12, 1), pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i); pp.setZ(i, -Math.pow(x / .15, 2) * .014); }
    pg.computeVertexNormals();
    rig.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: tt, roughness: .85, side: THREE.DoubleSide, alphaTest: .5 })));
    const along = (mesh, a, b) => { const v = new THREE.Vector3().subVectors(b, a); mesh.position.copy(a).addScaledVector(v, .5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize()); return v.length(); };
    if (this.hands) rig.add(photoHand(this.hands, 1), photoHand(this.hands, -1, { watch: true }));
    else rig.add(buildHand(1), buildHand(-1, { watch: true }));
    const fillL = new THREE.PointLight(0xffd2a8, .05, 1.2, 2); fillL.position.set(.1, .2, .5); rig.add(fillL); // a little light on your hands
    rig.position.set(0, 1.33, z0 - (this.mobile ? .38 : .32)); rig.lookAt(this.seat); rig.rotateX(-.12);
    if (this.mobile) rig.scale.setScalar(.62); // a narrow screen sees less, so hold it a little further off
    this.rig = rig; this.rigBase = rig.quaternion.clone(); this.rigPos = rig.position.clone();
    // knees and sneakers below
    const denim = new THREE.MeshStandardMaterial({ color: 0x34405e, roughness: .9 }), shoe = new THREE.MeshStandardMaterial({ color: 0xf1ede6, roughness: .7 });
    [-1, 1].forEach(sd => {
      const hip = new THREE.Vector3(sd * .13, 1.13, z0 + .1), knee = new THREE.Vector3(sd * .15, 1.16, z0 - .4), foot = new THREE.Vector3(sd * .16, FLOOR + .1, z0 - .5);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(.075, 1, 4, 12), denim); thigh.scale.y = along(thigh, hip, knee) / 1.15; g.add(thigh);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(.06, 1, 4, 12), denim); shin.scale.y = along(shin, knee, foot) / 1.1; g.add(shin);
      const sn = new THREE.Mesh(new THREE.BoxGeometry(.11, .09, .28), shoe); sn.position.set(sd * .16, FLOOR + .05, z0 - .58); g.add(sn);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(.115, .025, .29), M_SOLE); sole.position.set(sd * .16, FLOOR + .012, z0 - .58); g.add(sole);
    });
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.scene.add(g); this.introGroup = g;
  }
  startIntro(ticketCanvas, cb = {}) {
    if (!this.introGroup) this._rig(ticketCanvas);
    this.introGroup.visible = true;
    this.trainX = 70; this.arrival = null;
    this.intro = { t0: this.clock.elapsedTime, cb, fired: {} };
    this.look.set(0, 1.5, 3); this.camera.position.set(0, 2.85, this.seat.z + .75); this.camera.lookAt(this.look);
  }
  skipIntro() {
    const I = this.intro; if (!I) return;
    this.intro = null; this.introGroup.visible = false;
    if (!I.fired.arrive) { I.fired.arrive = 1; I.cb.arrive && I.cb.arrive(true); }
    if (this.arrival || this.trainX > 0) { const stop = (this.arrival && this.arrival.onStop) || I.cb.stop; this.park(); stop && stop(); }
    this.blendUntil = this.clock.elapsedTime + 2.5;
    I.cb.end && I.cb.end();
  }
  _introFrame(t, dt) {
    const I = this.intro, e = t - I.t0, cb = I.cb;
    const fire = (k, at, fn) => { if (e >= at && !I.fired[k]) { I.fired[k] = 1; fn && fn(); } };
    fire('sit', .25, cb.sit); fire('paper', 2.5, cb.paper); fire('bells', 3.4, cb.bells);
    fire('arrive', 5.2, () => { this.arrive(6, cb.stop); cb.arrive && cb.arrive(false); });
    fire('stand', 12.1, cb.stand);
    // where the eyes are: sit down, breathe, then stand up when the doors open
    const stand0 = new THREE.Vector3(0, 2.86, this.seat.z + .75), up = new THREE.Vector3(-.4, 3.0, this.seat.z + 1.1), c = this.camera;
    if (e < 1.3) c.position.lerpVectors(stand0, this.seat, easeInOut(e / 1.3));
    else if (e < 12.1) c.position.copy(this.seat);
    else c.position.lerpVectors(this.seat, up, easeInOut(Math.min(1, (e - 12.1) / 1.2)));
    c.position.y += Math.sin(t * 1.7) * .005 + (e > 1.1 && e < 1.5 ? -Math.sin((e - 1.1) / .4 * Math.PI) * .03 : 0);
    // where the head turns: down at the ticket, up, a look left down the platform, then the horn pulls it right to the train
    const front = this.cars[0].position.x + this.trainX - CAR_L / 2 - NOSE_L + .3, tgt = new THREE.Vector3();
    if (e < 1.0) tgt.set(0, 1.5, this.seat.z - 3.5);
    else if (e < 3.5) tgt.set(.02 + Math.sin(e * .9) * .02, 1.31, this.seat.z - .42);
    else if (e < 4.6) tgt.set(.8, 1.95, 0);
    else if (e < 5.8) tgt.set(-11, 2.3, 0);
    else if (e < 6.3) tgt.set(-6, 2.1, 0);
    else if (e < 11.4) tgt.set(Math.max(-2.5, Math.min(18, front)), 2.0, 0);
    else tgt.set(-1.6, 2.25, 0);
    const k = 1 - Math.pow(e < 6.3 ? .012 : .03, dt);
    this.look.lerp(tgt, k);
    c.lookAt(this.look);
    // the ticket gets a small fidget, then the hands drop away as you stand
    const fid = e > 2.5 && e < 3.3 ? Math.sin((e - 2.5) / .8 * Math.PI) : 0;
    this.rig.quaternion.copy(this.rigBase); this.rig.rotateZ(fid * .12); this.rig.rotateX(Math.sin(t * 1.7) * .02);
    this.rig.position.copy(this.rigPos); if (e > 12.1) this.rig.position.y -= Math.pow(Math.min(1, (e - 12.1) / .6), 2) * .6;
    if (e > 13.3) { this.intro = null; this.introGroup.visible = false; this.blendUntil = t + 2.8; cb.end && cb.end(); }
  }

  /* ---------- choreography ---------- */
  doorX(i) { return this.cars[i].position.x + this.trainX; }
  arrive(dur = 6, onStop) { this.trainX = 70; this.arrival = { t0: this.clock.elapsedTime, dur, onStop }; }
  park() { this.arrival = null; this.trainX = 0; }
  openDoors(stagger = .16) { this.doors.forEach((d, i) => setTimeout(() => { d.target = 1; }, i * stagger * 1000)); }
  setFocus(i) { this.focus = i; }
  setHover(i) { this.hover = i; }
  setPointer(nx, ny) { this.mouse.set(nx, ny); }
  pick(nx, ny) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = rc.intersectObjects(this.doors.map(d => d.hit))[0];
    return hit ? hit.object.userData.door : -1;
  }
  parkedPose(snap) {
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2), halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    if (this.mobile) {
      const x = this.cars[this.focus].position.x, dist = (CAR_L / 2 + .7) / Math.tan(halfH);
      this.camPos.set(x - 1.3, 2.6, dist); this.camLook.set(x, .5, 0);
    } else {
      const half = (this.count * CAR_L + (this.count - 1) * GAP) / 2 + NOSE_L / 2, cx = -NOSE_L / 2, dist = Math.min(60, (half + 3.2) / Math.tan(halfH));
      this.camPos.set(cx - 1.6, 3.1, dist); this.camLook.set(cx, 2.35, 0);
    }
    if (snap) { this.camera.position.copy(this.camPos); this.look.copy(this.camLook); this.camera.lookAt(this.look); }
  }
  board(i, done) {
    const x = this.doorX(i), z = W / 2 + .05;
    this.flight = { t0: this.clock.elapsedTime, p0: this.camera.position.clone(), l0: this.look.clone(),
      p1: new THREE.Vector3(x, 1.75, z + 3.4), p2: new THREE.Vector3(x, 1.65, z + .2), l1: new THREE.Vector3(x, 1.65, 0), done };
    this.doors[i].target = 1.25;
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.composer.setSize(w, h); if (this.bloom) this.bloom.resolution.set(w / 2, h / 2);
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), .1), t = this.clock.elapsedTime;
    let speed = 0;
    if (this.arrival) {
      const a = this.arrival, p = Math.min(1, (t - a.t0) / a.dur), prev = this.trainX;
      this.trainX = 70 * Math.pow(1 - p, 2.6); speed = (prev - this.trainX) / Math.max(dt, 1e-3);
      if (p >= 1) { this.arrival = null; this.sway = 1; a.onStop && a.onStop(); }
    }
    this.sway *= .95;
    this.train.position.x = this.trainX;
    this.train.position.y = Math.sin(t * 31) * Math.min(.01, speed * .0005);
    this.train.rotation.x = Math.sin(t * 7) * .004 * this.sway;
    this.headBeam.material.opacity = .05 + Math.min(.05, speed * .002);
    this.doors.forEach((d, i) => {
      const goal = Math.min(1.25, d.target + (this.hover === i && d.target >= 1 ? .08 : 0));
      d.open += (goal - d.open) * Math.min(1, dt * 4);
      const o = easeInOut(Math.min(1, d.open));
      d.leaves.forEach(l => {
        l.position.x = l.userData.sd * (DOOR_W / 4 + o * (DOOR_W / 2 - .02) + Math.max(0, d.open - 1) * .25);
        l.position.z = W / 2 + .09 + Math.min(o * 6, 1) * .06;
        l.userData.btn.material.color.setRGB(.36 * (.2 + o * 2.2), 1 * (.2 + o * 2.2), .56 * (.2 + o * 2.2));
      });
      d.hover += ((this.hover === i ? 1 : 0) - d.hover) * Math.min(1, dt * 6);
      const k = o * (1.1 + d.hover * 1.0);
      d.lightMat.color.setScalar(k + .02);
      d.statusMats.forEach(m => m.color.setRGB(o > .05 ? .36 * 3 : 1 * .4, o > .05 ? 1 * 3 : .64 * .4, o > .05 ? .56 * 3 : .12 * .4));
      d.spill.material.opacity = o * (.28 + d.hover * .3);
      if (d.pl) d.pl.intensity = o * (5 + d.hover * 6);
      d.led.mat.color.setScalar(1.15 + d.hover * .9);
      const page = Math.floor(t / 2.6 + i * .3) % 2; if (page !== d.led.page) { d.led.page = page; this.drawSign(i); }
    });
    const c = this.camera;
    if (this.intro) { this._introFrame(t, dt); }
    else if (this.flight) {
      const f = this.flight, p = Math.min(1, (t - f.t0) / 1.6);
      if (p < .55) { const u = easeInOut(p / .55); c.position.lerpVectors(f.p0, f.p1, u); this.look.lerpVectors(f.l0, f.l1, u); }
      else { const u = Math.pow((p - .55) / .45, 2); c.position.lerpVectors(f.p1, f.p2, u); this.look.copy(f.l1); }
      if (p >= 1 && !f.fired) { f.fired = true; f.done && f.done(); }
    } else {
      this.parkedPose(false); this.par.lerp(this.mouse, .05);
      const k = 1 - Math.pow(this.blendUntil > t ? .35 : .05, dt);
      c.position.x += (this.camPos.x + this.par.x * (this.mobile ? .3 : 1.2) - c.position.x) * k;
      c.position.y += (this.camPos.y + this.par.y * .5 - c.position.y) * k;
      c.position.z += (this.camPos.z - c.position.z) * k;
      this.look.lerp(this.camLook, 1 - Math.pow(this.blendUntil > t ? .3 : .04, dt));
    }
    if (!this.intro) c.lookAt(this.look);
    const shake = Math.min(1, speed / 25) * (this.intro ? .5 : 1); if (shake > .02) c.position.y += (Math.random() - .5) * .03 * shake;
    const pos = this.motes.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= speed * .003 * (pos[i + 2] < 4 ? 1 : .25) + .004; pos[i + 1] += Math.sin(t * .7 + i) * .0015; if (pos[i] < -35) pos[i] += 70; }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.sky.position.copy(c.position);
    this.composer.render();
  }
}
