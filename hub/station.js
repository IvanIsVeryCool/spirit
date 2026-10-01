import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from '/vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/jsm/postprocessing/OutputPass.js';

// A golden-hour Peninsula platform and a red-and-silver double-decker commuter train.
const CAR_L = 7.2, GAP = .36, W = 2.9, H = 4.05, BASE = .3, FLOOR = .55, DOOR_W = 1.3, DOOR_H = 2.1;
const COL = {
  skyTop: '#1c2a66', skyMid: '#7468ab', horizon: '#ffb07a', sun: '#ffd08e',
  body: 0xc8ccd3, red: 0xc9272c, dark: 0x16181f, concrete: 0x8d857a, warm: 0xffc58a
};
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const glow = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }); m.toneMapped = false; return m; };

/* dot-matrix LED sign, drawn into a canvas */
function drawLED(ctx, lines, { lit = '#ffad1f', dim = '#2b1a05' } = {}) {
  const CW = 160, CH = 32, P = 4, cv = ctx.canvas;
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

export class Station {
  constructor(canvas, { mobile, doors }) {
    this.mobile = mobile; this.data = doors; this.count = doors.length;
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

    // light: a low warm sun from the left, cool sky fill
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
    // a few tall palms
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
    // yellow tactile edge strip
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#e8b923'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#c99a12';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(8 + i * 16, 8 + j * 16, 4.5, 0, 7); x.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(400 / .6, 1); tex.colorSpace = THREE.SRGBColorSpace;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(400, .6), new THREE.MeshStandardMaterial({ map: tex, roughness: .7 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, FLOOR + .005, front + .3); s.add(strip);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(400, .1), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .6 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, FLOOR + .006, front + 1.2); s.add(line);
    const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, .01, 40), new THREE.MeshStandardMaterial({ color: 0x9e958a }), 70), m = new THREE.Matrix4();
    for (let i = 0; i < 70; i++) { m.makeTranslation(-140 + i * 4, FLOOR + .004, front + 21.6); joints.setMatrixAt(i, m); } s.add(joints);
  }
  _wires() {
    const s = this.scene, poleMat = new THREE.MeshStandardMaterial({ color: 0x6b717b, metalness: .7, roughness: .45 });
    const pts = [];
    for (let x = -120; x <= 120; x += 16) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(.28, 7.6, .28), poleMat); pole.position.set(x, 3.8, -7.2); pole.userData.cast = true; s.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 8), poleMat); arm.position.set(x, 6.7, -3.3); arm.userData.cast = true; s.add(arm);
    }
    // contact wire, sagging messenger wire and droppers over both tracks
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
    [-22.4, -7.4, 7.4, 22.4].forEach(x => { // lamp posts, placed between the doors
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 4.6, 8), metal); pole.position.y = 2.3; g.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.06, .06, .9), metal); arm.position.set(0, 4.55, -.42); g.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(.32, .12, .5), metal); head.position.set(0, 4.5, -.8); g.add(head);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.26, .02, .42), glow(COL.warm, 3.2)); lamp.position.set(0, 4.43, -.8); g.add(lamp);
      g.position.set(x, FLOOR, z + 7.2); g.traverse(o => { if (o.isMesh) o.userData.cast = true; }); s.add(g);
    });
    [-15, 0, 15].forEach(x => { // benches
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
    const body = new THREE.MeshStandardMaterial({ color: COL.body, metalness: .5, roughness: .42, envMapIntensity: .6 });
    const red = new THREE.MeshStandardMaterial({ color: COL.red, metalness: .3, roughness: .35, envMapIntensity: .7 });
    const dark = new THREE.MeshStandardMaterial({ color: COL.dark, metalness: .4, roughness: .6 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9da2ab, metalness: .6, roughness: .45 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0a0d14, metalness: .6, roughness: .08, emissive: new THREE.Color(0xffb46a), emissiveIntensity: .05, envMapIntensity: 1 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xd3d7de, metalness: .55, roughness: .3, envMapIntensity: .8 });
    const hw = W / 2, rr = .55, br = .12;
    const sh = new THREE.Shape();
    sh.moveTo(-hw + br, BASE); sh.lineTo(hw - br, BASE); sh.quadraticCurveTo(hw, BASE, hw, BASE + br); sh.lineTo(hw, H - rr);
    sh.quadraticCurveTo(hw, H, hw - rr, H); sh.lineTo(-hw + rr, H); sh.quadraticCurveTo(-hw, H, -hw, H - rr); sh.lineTo(-hw, BASE + br); sh.quadraticCurveTo(-hw, BASE, -hw + br, BASE);
    const shell = new THREE.ExtrudeGeometry(sh, { depth: CAR_L, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2, curveSegments: 10 });
    shell.rotateY(Math.PI / 2); shell.translate(-CAR_L / 2, 0, 0);
    const z = hw + .05, side = (geo, mat, x, y, dz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z + dz); return m; };
    const segL = CAR_L / 2 - DOOR_W / 2 - .12;
    this.cars = []; this.doors = [];
    for (let i = 0; i < this.count; i++) {
      const car = new THREE.Group(); car.position.x = (i - (this.count - 1) / 2) * (CAR_L + GAP);
      const sh0 = new THREE.Mesh(shell, body); sh0.userData.cast = true; car.add(sh0);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - .3, .05, W - .9), roofMat); roof.position.y = H + .02; car.add(roof);
      [-1.4, 1.2].forEach(x => { const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, .3, 1.3), roofMat); box.position.set(x, H + .17, 0); box.userData.cast = true; car.add(box); });
      [-1, 1].forEach(sd => {
        const bog = new THREE.Mesh(new THREE.BoxGeometry(2, .32, W - .6), dark); bog.position.set(sd * (CAR_L / 2 - 1.1), .2, 0); car.add(bog);
        [-.6, .6].forEach(dx => [-.74, .74].forEach(dz => { const wh = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .1, 16), dark); wh.rotation.x = Math.PI / 2; wh.position.set(sd * (CAR_L / 2 - 1.1) + dx, .24, dz); car.add(wh); }));
      });
      // livery: red skirt and stripe, broken by the door; lower and upper deck windows lit warm inside
      [-1, 1].forEach(sd => {
        const cx = sd * (DOOR_W / 2 + .12 + segL / 2);
        car.add(side(new THREE.BoxGeometry(segL, .42, .02), red, cx, BASE + .26));
        car.add(side(new THREE.BoxGeometry(segL, .07, .02), red, cx, 3.62));
        [1.42, 2.84].forEach(y => [.22, .5, .78].forEach(f => car.add(side(new THREE.BoxGeometry(segL * .24, .72, .03), glass, sd * (DOOR_W / 2 + .12 + (f + (y > 2 ? .04 : 0)) * segL), y))));
      });
      // door
      car.add(side(new THREE.BoxGeometry(DOOR_W + .14, DOOR_H + .1, .02), dark, 0, FLOOR + DOOR_H / 2, -.01));
      const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x000000) }); lightMat.toneMapped = false;
      const inner = side(new THREE.PlaneGeometry(DOOR_W - .04, DOOR_H - .04), lightMat, 0, FLOOR + DOOR_H / 2, .006); car.add(inner);
      const leaves = [-1, 1].map(sd => {
        const leaf = new THREE.Group();
        const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, DOOR_H, .05), doorMat); leaf.add(panel);
        const w = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2 - .2, .8, .02), glass); w.position.set(0, .3, .03); leaf.add(w);
        const seal = new THREE.Mesh(new THREE.BoxGeometry(.03, DOOR_H, .03), dark); seal.position.set(-sd * (DOOR_W / 4 - .015), 0, .03); leaf.add(seal);
        leaf.position.set(sd * DOOR_W / 4, FLOOR + DOOR_H / 2, z + .04); leaf.userData.sd = sd; car.add(leaf); return leaf;
      });
      // LED destination sign over the door
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 128;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const ledMat = new THREE.MeshBasicMaterial({ map: tex }); ledMat.toneMapped = false;
      car.add(side(new THREE.BoxGeometry(2.1, .6, .04), dark, 0, 3.1, .005));
      car.add(side(new THREE.PlaneGeometry(2, .5), ledMat, 0, 3.1, .03));
      // car number plate near the end
      const plate = this._plate(String(i + 1).padStart(2, '0'));
      car.add(side(new THREE.PlaneGeometry(.5, .25), new THREE.MeshBasicMaterial({ map: plate, transparent: true }), CAR_L / 2 - .55, 3.25, .01));
      // warm light spilling onto the platform
      const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6), new THREE.MeshBasicMaterial({ color: COL.warm, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: this._spillTex() }));
      spill.rotation.x = -Math.PI / 2; spill.position.set(0, FLOOR + .012, z + 1.35); spill.userData.noShadow = true; car.add(spill);
      let pl = null; if (!this.mobile) { pl = new THREE.PointLight(COL.warm, 0, 6, 1.6); pl.position.set(0, 1.6, z + .7); car.add(pl); }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + .6, DOOR_H + 1, .8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0, FLOOR + DOOR_H / 2 + .3, z + .2); hit.userData.door = i; hit.userData.noShadow = true; car.add(hit);
      train.add(car); this.cars.push(car);
      this.doors.push({ leaves, lightMat, spill, pl, hit, open: 0, target: 0, hover: 0, led: { ctx: cv.getContext('2d'), tex, mat: ledMat, page: 0, key: '' } });
      this.drawSign(i);
    }
    this._cab(body, red, dark);
    this._pantograph(dark);
    for (let i = 0; i < this.count - 1; i++) { // gangways
      const g = new THREE.Mesh(new THREE.BoxGeometry(GAP + .3, H - 1, W - .8), dark);
      g.position.set(this.cars[i].position.x + CAR_L / 2 + GAP / 2, BASE + (H - 1) / 2 + .2, 0); train.add(g);
    }
    const last = this.cars[this.count - 1];
    [-.85, .85].forEach(dz => { const t = new THREE.Mesh(new THREE.BoxGeometry(.04, .12, .22), glow(0xff2a2a, 3)); t.position.set(CAR_L / 2 + .06, 1.1, dz); last.add(t); });
  }
  _plate(text) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#1b1d24'; x.font = '800 44px "Archivo", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  _cab(body, red) {
    const first = this.cars[0], x0 = -CAR_L / 2, bv = .22, depth = W - 2 * bv;
    const sh = new THREE.Shape();
    sh.moveTo(.2, BASE + bv); sh.lineTo(-1.55, BASE + bv); sh.quadraticCurveTo(-1.85, BASE + bv, -1.85, .85);
    sh.lineTo(-1.78, 1.75); sh.lineTo(-.62, 3.5); sh.quadraticCurveTo(-.3, H - bv, .2, H - bv); sh.lineTo(.2, BASE + bv);
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bv, bevelThickness: bv, bevelSegments: 5, curveSegments: 12 });
    geo.translate(0, 0, -depth / 2);
    const nose = new THREE.Mesh(geo, red); nose.position.x = x0; nose.userData.cast = true; first.add(nose);
    // windshield laid on the sloped face
    const A = new THREE.Vector2(-1.78, 1.75), B = new THREE.Vector2(-.62, 3.5), dir = B.clone().sub(A).normalize(), n = new THREE.Vector2(-dir.y, dir.x);
    const off = bv + .012, a = A.clone().addScaledVector(dir, .18).addScaledVector(n, off), b = B.clone().addScaledVector(dir, -.12).addScaledVector(n, off), hz = depth / 2 + .02;
    const ws = new THREE.BufferGeometry();
    ws.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, -hz, b.x, b.y, -hz, b.x, b.y, hz, a.x, a.y, -hz, b.x, b.y, hz, a.x, a.y, hz], 3)); ws.computeVertexNormals();
    const shield = new THREE.Mesh(ws, new THREE.MeshStandardMaterial({ color: 0x0c0f16, metalness: .3, roughness: .05, envMapIntensity: 2, side: THREE.DoubleSide }));
    shield.position.x = x0; first.add(shield);
    [-.78, .78].forEach(dz => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(.06, .16, .34), glow(0xfff4dc, 6)); hl.position.set(x0 - 1.85 - bv - .01, 1.2, dz); first.add(hl);
      const mk = new THREE.Mesh(new THREE.BoxGeometry(.05, .08, .12), glow(0xffe2a8, 3)); mk.position.set(x0 - 1.82 - bv, 1.62, dz * 1.15); first.add(mk);
    });
    const band = new THREE.Mesh(new THREE.BoxGeometry(.05, .1, depth + bv), body); band.position.set(x0 - 1.86 - bv, .9, 0); first.add(band);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: .05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.rotation.z = -Math.PI / 2; beam.position.set(x0 - 1.9 - 7, 1.2, 0); beam.userData.noShadow = true; first.add(beam); this.headBeam = beam;
  }
  _pantograph(dark) {
    const car = this.cars[0], mat = new THREE.MeshStandardMaterial({ color: 0x5b616b, metalness: .8, roughness: .4 });
    const strut = (a, b, r = .035) => {
      const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 6), mat);
      m.position.copy(a).addScaledVector(v, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.userData.cast = true; car.add(m);
    };
    const x = 1.3, y0 = H + .05, top = 5.33;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, .14, 1.2), dark); base.position.set(x, y0 + .07, 0); car.add(base);
    [-.35, .35].forEach(zz => {
      strut(new THREE.Vector3(x - .55, y0 + .14, zz), new THREE.Vector3(x + .35, y0 + .62, zz * .4));
      strut(new THREE.Vector3(x + .35, y0 + .62, zz * .4), new THREE.Vector3(x - .15, top - .06, zz * .2));
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(.12, .05, 1.7), mat); head.position.set(x - .15, top, 0); car.add(head);
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
  // a car's LED sign: its title, then alternating status / car number
  drawSign(i) {
    const d = this.doors[i], info = this.data[i], L = d.led;
    const second = L.page % 2 ? `CAR ${String(i + 1).padStart(2, '0')}` : (info.href ? 'NOW BOARDING' : 'COMING SOON');
    if (second === L.key) return; L.key = second;
    drawLED(L.ctx, [info.title.toUpperCase(), second]);
    L.tex.needsUpdate = true;
  }
  redrawSigns() { this.doors.forEach((d, i) => { d.led.key = ''; this.drawSign(i); }); }

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
      const x = this.cars[this.focus].position.x, dist = 4.3 / Math.tan(halfH);
      this.camPos.set(x - 1.3, 2.6, dist); this.camLook.set(x, .5, 0);
    } else {
      const cx = -1.1, dist = Math.min(52, 19.4 / Math.tan(halfH));
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
      d.leaves.forEach(l => { l.position.x = l.userData.sd * (DOOR_W / 4 + o * (DOOR_W / 2 - .02) + Math.max(0, d.open - 1) * .25); l.position.z = W / 2 + .09 + Math.min(o * 6, 1) * .06; });
      d.hover += ((this.hover === i ? 1 : 0) - d.hover) * Math.min(1, dt * 6);
      const k = o * (1.15 + d.hover * 1.1);
      d.lightMat.color.setRGB(1 * k + .015, .82 * k + .012, .6 * k + .01);
      d.spill.material.opacity = o * (.28 + d.hover * .3);
      if (d.pl) d.pl.intensity = o * (5 + d.hover * 6);
      d.led.mat.color.setScalar(1.15 + d.hover * .9);
      const page = Math.floor(t / 2.6 + i * .3) % 2; if (page !== d.led.page) { d.led.page = page; this.drawSign(i); }
    });
    const c = this.camera;
    if (this.flight) {
      const f = this.flight, p = Math.min(1, (t - f.t0) / 1.6);
      if (p < .55) { const u = easeInOut(p / .55); c.position.lerpVectors(f.p0, f.p1, u); this.look.lerpVectors(f.l0, f.l1, u); }
      else { const u = Math.pow((p - .55) / .45, 2); c.position.lerpVectors(f.p1, f.p2, u); this.look.copy(f.l1); }
      if (p >= 1 && !f.fired) { f.fired = true; f.done && f.done(); }
    } else {
      this.parkedPose(false); this.par.lerp(this.mouse, .05);
      const k = 1 - Math.pow(.05, dt);
      c.position.x += (this.camPos.x + this.par.x * (this.mobile ? .3 : 1.2) - c.position.x) * k;
      c.position.y += (this.camPos.y + this.par.y * .5 - c.position.y) * k;
      c.position.z += (this.camPos.z - c.position.z) * k;
      this.look.lerp(this.camLook, 1 - Math.pow(.04, dt));
    }
    c.lookAt(this.look);
    const shake = Math.min(1, speed / 25); if (shake > .02) c.position.y += (Math.random() - .5) * .03 * shake;
    const pos = this.motes.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= speed * .003 * (pos[i + 2] < 4 ? 1 : .25) + .004; pos[i + 1] += Math.sin(t * .7 + i) * .0015; if (pos[i] < -35) pos[i] += 70; }
    this.motes.geometry.attributes.position.needsUpdate = true;
    this.sky.position.copy(c.position);
    this.composer.render();
  }
}
