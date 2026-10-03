import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from '/vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/jsm/postprocessing/OutputPass.js';
import { mergeStatic, addPeople, updatePeople, addPlatformProps, addBackground, updateBackground } from './scenery.js';
import { CAR_L, GAP, W, H, BASE, FLOOR, DOOR_W, DOOR_H, NOSE_L, bodyGeometry, capGeometry, noseGeometry, noseLiningGeometry, nosePoint, paintBody, paintNose, windowSlots } from './train.js';
import { buildInterior, CAB_DOOR } from './interior.js';
import { CABINET } from './doors.js';
import { Crowd } from './crowd.js';
import { limbGeometry, aimBasis, library, Person } from './people.js';
import { addCity, updateCity, cityLoaded } from './city.js';
import { pavers, concrete, ballast, grass, chainlink, tactile, tiled } from './surfaces.js';
import { Reader, NextStops, newsVisit, eventsVisit, galleryVisit } from './scenes.js';

// A golden-hour Peninsula platform and a red-and-silver double-decker commuter train.
const COL = {
  skyTop: '#1c2a66', skyMid: '#7468ab', horizon: '#ffb07a', sun: '#ffd08e',
  body: 0xc8ccd3, red: 0xc9272c, dark: 0x16181f, concrete: 0x8d857a, warm: 0xffc58a
};
const M_SOLE = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: .9 });
const T_FOV_MIN = 55; // the cab view's narrowest field of view
const INTRO_D = 2.3; // the opening's cassette-player moment, before the ticket: everything after it is shifted by this
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
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = .84; // a little under, so the evening reads as evening
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
    s.add(new THREE.HemisphereLight(0x9fb2ff, 0x5a3b2c, .72));
    const sun = this.sunLight = new THREE.DirectionalLight(0xffc690, 1.85);
    sun.position.set(-32, 11, 16); s.add(sun); s.add(sun.target);
    if (!mobile) {
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 16, bottom: -12, near: 1, far: 100 });
      sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
    }
    const fill = new THREE.DirectionalLight(0x8d9cff, .5); fill.position.set(14, 8, 18); s.add(fill);

    Object.assign(this, { FLOOR, CAR_L, NOSE_L, P: CAR_L + GAP });
    this._sky(); this._hills(); this._trees(); this._tracks(); this._platform(); this._wires(); this._props(); this._train(); this._motes(); this._flyer(); this._officer();
    const propGroup = addPlatformProps(this); addPeople(this); addBackground(this); this.city = addCity(this); this.crowd = new Crowd(this);
    s.traverse(o => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = !!o.userData.cast; o.receiveShadow = true; } });
    // hundreds of small static parts become one draw call per material
    this.cars.forEach(c => { c.userData.keep = true; }); mergeStatic(this.train);
    this.cars.forEach(c => { c.userData.keep = false; mergeStatic(c); });
    mergeStatic(propGroup); mergeStatic(this.wireGroup);
    this.reader = new Reader(this); // the newsletter in your hands (Weekly Newsletter), hidden until you sit down to read it
    // frame-time watch: drop the resolution a notch on slower machines instead of stuttering
    this.prMax = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75); this.pr = this.prMax; this.ft = { last: 0, avg: 16, check: 0, calm: 0 };

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(s, this.camera));
    if (!mobile) { this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .4, .45, .84); this.composer.addPass(this.bloom); }
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
    if (cityLoaded()) return; // Kenney's Nature Kit trees and palms (city.js); these are the fallback
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
    // the ballast bed, the grass beyond, concrete sleepers (surfaces.js)
    this.surf = this.surf || { conc: concrete(this.mobile ? 128 : 256) };
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(400, 10.4), new THREE.MeshStandardMaterial({ roughness: 1, ...tiled(ballast(this.mobile ? 256 : 512), 400, 10.4) })); // from the platform to the fence
    bed.rotation.x = -Math.PI / 2; bed.position.set(0, -.02, -3.4); s.add(bed);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 204), new THREE.MeshStandardMaterial({ roughness: 1, ...tiled(grass(this.mobile ? 256 : 512), 600, 204) }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.06, -110.4); // grass from just behind the fence back ground.userData.noShadow = true; s.add(ground);
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(.24, .1, 2.6), new THREE.MeshStandardMaterial({ color: 0x8c8780, roughness: .95, map: this.surf.conc.map, normalMap: this.surf.conc.normalMap }), 1300);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .9, roughness: .3 });
    const m = new THREE.Matrix4(); let k = 0;
    [0, -4.6].forEach(z => {
      for (let x = -200; x < 200 && k < 1300; x += .62) { m.makeTranslation(x, .05, z); ties.setMatrixAt(k++, m); }
      [-.72, .72].forEach(dz => { const rail = new THREE.Mesh(new THREE.BoxGeometry(400, .12, .08), railMat); rail.position.set(0, .16, z + dz); s.add(rail); });
    });
    ties.count = k; s.add(ties);
    // a chain-link fence on posts, with a top rail
    const fence = new THREE.Mesh(new THREE.PlaneGeometry(400, 1.4), new THREE.MeshStandardMaterial({ ...tiled(chainlink(), 400, 1.4), alphaTest: .5, side: THREE.DoubleSide, metalness: .6, roughness: .45 }));
    fence.position.set(0, .7, -8.2); fence.userData.noShadow = true; s.add(fence);
    const galv = new THREE.MeshStandardMaterial({ color: 0x8d939b, metalness: .7, roughness: .4 });
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(.03, .03, 1.5, 6), galv, 134); let kp = 0;
    for (let x = -199.5; x < 200; x += 3) { m.makeTranslation(x, .75, -8.2); posts.setMatrixAt(kp++, m); } posts.count = kp; posts.userData.noShadow = true; s.add(posts);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, 400, 6), galv); top.rotation.z = Math.PI / 2; top.position.set(0, 1.42, -8.2); top.userData.noShadow = true; s.add(top);
  }
  _platform() {
    const s = this.scene, front = W / 2 + .12; this.front = front;
    // concrete paving slabs on top (surfaces.js), cast concrete down the edge
    this.surf = this.surf || { conc: concrete(this.mobile ? 128 : 256) };
    const top = new THREE.MeshStandardMaterial({ ...tiled(pavers(this.mobile ? 512 : 1024), 400, 60), roughness: 1, normalScale: new THREE.Vector2(.8, .8) });
    const edge = new THREE.MeshStandardMaterial({ ...tiled(this.surf.conc, 400, 1.6), color: 0x9a948c, roughness: .9 }), side = new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: .92 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(400, 1.6, 60), [side, side, top, side, side, edge]);
    slab.position.set(0, FLOOR - .8, front + 30); s.add(slab);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(400, .6), new THREE.MeshStandardMaterial({ ...tiled(tactile(), 400, .6), roughness: .65 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(0, FLOOR + .005, front + .3); s.add(strip);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(400, .1), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: .6 }));
    line.rotation.x = -Math.PI / 2; line.position.set(0, FLOOR + .006, front + 1.2); s.add(line);
  }
  _wires() {
    const scene = this.scene, s = new THREE.Group(), poleMat = new THREE.MeshStandardMaterial({ color: 0x6b717b, metalness: .7, roughness: .45 }); scene.add(s); this.wireGroup = s;
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
    // tinted glass you can see through: the lit decks and the passengers inside show, with the evening sky on top
    M.window = new THREE.MeshPhysicalMaterial({ color: 0x262c3a, transparent: true, opacity: .5, depthWrite: false, roughness: .06, metalness: 0, clearcoat: .8, clearcoatRoughness: .05, envMapIntensity: .9 });
    const shell = bodyGeometry({ windows: true }), cap = capGeometry();
    this.stops = new NextStops(this); // the Events car's next-stops screen
    this.cars = []; this.doors = [];
    for (let i = 0; i < this.count; i++) {
      const car = new THREE.Group(); car.position.x = (i - (this.count - 1) / 2) * (CAR_L + GAP);
      const body = new THREE.Mesh(shell, M.body); body.userData.cast = true; car.add(body);
      [-1, 1].forEach(sd => { if ((i === 0 && sd < 0) || (i === this.count - 1 && sd > 0)) return; const c = new THREE.Mesh(cap, M.cap); c.rotation.y = sd * Math.PI / 2; c.position.x = sd * CAR_L / 2; car.add(c); });
      this._roof(car); this._under(car); this._side(car, i);
      train.add(car); this.cars.push(car);
    }
    // a cab at each end, so the train can run either way: the leading one (headlights) and the trailing one (red lights),
    // which you can walk into from the last car (Meet the Cabinet)
    this._cab(this.cars[0], -1); this._cab(this.cars[this.count - 1], 1); this._cabRoom(this.cars[this.count - 1]); this._paintNose(); this._pantograph();
    for (let i = 0; i < this.count - 1; i++) this._gangway(this.cars[i].position.x + CAR_L / 2 + GAP / 2);
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
          const spring = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .12, 8), M.steel); spring.position.set(dx, .36, dz); g.add(spring); // kept below the lower deck's floor
        });
        const damper = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .5, 8), M.yellow); damper.rotation.z = Math.PI / 2.6; damper.position.set(0, .28, dz + Math.sign(dz) * .1); g.add(damper);
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
    // door: a frame around the real opening, sliding stainless leaves with tall windows, grab handles, status lights, step
    [-1, 1].forEach(sd => side(new THREE.BoxGeometry(.05, DOOR_H + .05, .03), M.dark, sd * (DOOR_W / 2 + .025), FLOOR + DOOR_H / 2 + .025, .005));
    side(new THREE.BoxGeometry(DOOR_W + .1, .05, .03), M.dark, 0, FLOOR + DOOR_H + .025, .005);
    const leaves = [-1, 1].map(sd => {
      const leaf = new THREE.Group();
      leaf.add(new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, DOOR_H, .045), M.door));
      const wg = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2 - .14, 1.02, .02), M.gasket); wg.position.set(0, .28, .024); leaf.add(wg);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W / 2 - .2, .96), M.window); w.position.set(0, .28, .036); leaf.add(w);
      const seal = new THREE.Mesh(new THREE.BoxGeometry(.03, DOOR_H, .03), M.dark); seal.position.set(-sd * (DOOR_W / 4 - .015), 0, .026); leaf.add(seal);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .015, 16), glow(0x5dff8f, .2)); btn.rotation.x = Math.PI / 2; btn.position.set(-sd * (DOOR_W / 4 - .1), -.12, .03); leaf.add(btn);
      leaf.position.set(sd * DOOR_W / 4, FLOOR + DOOR_H / 2, z + .03); leaf.userData.keep = true; leaf.userData.sd = sd; leaf.userData.btn = btn; car.add(leaf); return leaf;
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
    const plateMat = new THREE.MeshBasicMaterial({ map: this._plate(String(i + 1).padStart(2, '0')), transparent: true });
    side(new THREE.PlaneGeometry(.5, .25), plateMat, CAR_L / 2 - .55, 3.3, .005);
    // the vestibule, stairs and seats behind the door, lit by baked light
    const scene = this.data[i].scene, inside = buildInterior(car, { ledMat, plateMat, idx: i, cab: i === this.count - 1, free: scene === 'newsletter', screen: scene === 'events' ? this.stops.mat : null });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6), new THREE.MeshBasicMaterial({ color: COL.warm, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: this._spillTex() }));
    spill.rotation.x = -Math.PI / 2; spill.position.set(0, FLOOR + .012, z + 1.35); spill.userData.noShadow = true; spill.userData.keep = true; car.add(spill);
    let pl = null; if (!this.mobile) { pl = new THREE.PointLight(COL.warm, 0, 6, 1.6); pl.position.set(0, 1.6, z + .7); car.add(pl); }
    const hit = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + .6, DOOR_H + 1, .8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, FLOOR + DOOR_H / 2 + .3, z + .2); hit.userData.door = i; hit.userData.keep = true; hit.userData.noShadow = true; car.add(hit);
    this.doors.push({ leaves, inside, spill, pl, hit, statusMats, open: 0, target: 0, hover: 0, led: { ctx: cv.getContext('2d'), tex, mat: ledMat, page: 0, key: '' } });
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
  // dir -1: the leading cab on the front of the first car; +1: the trailing cab on the back of the last (the same nose, mirrored)
  _cab(car, dir) {
    const M = this.mats, g = new THREE.Group(); g.position.x = dir * CAR_L / 2; g.scale.x = -dir; car.add(g); // nose-local: the nose runs toward -x
    const nose = new THREE.Mesh(noseGeometry(), new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, emissive: 0xffffff, emissiveIntensity: 2.2 }));
    nose.userData.cast = true; nose.userData.keep = true; g.add(nose);
    if (dir < 0) this.noseMesh = nose; else this.tailMesh = nose;
    // wipers resting at the bottom of the windshield
    [.36, .64].forEach(v => {
      const th = v * Math.PI * 2 - Math.PI / 2, a = nosePoint(.85, th, .02), b = nosePoint(.7, th - .25, .03);
      const wp = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, a.distanceTo(b), 6), M.dark);
      wp.position.copy(a).add(b).multiplyScalar(.5); wp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(wp);
    });
    // plow and coupler under the nose
    const plow = new THREE.Mesh(new THREE.BoxGeometry(.6, .3, W - .3), M.under); plow.position.set(-NOSE_L + .55, .2, 0); plow.rotation.z = -.4; g.add(plow);
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(.5, .16, .28), M.steel); coupler.position.set(-NOSE_L + .15, .45, 0); g.add(coupler);
    if (dir > 0) return;
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, .32, 10), M.steel); horn.rotation.z = Math.PI / 2; horn.position.set(-.2, H + .02, .4); g.add(horn);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: .05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.rotation.z = -Math.PI / 2; beam.position.set(-NOSE_L - 7, 1.25, 0); beam.userData.noShadow = true; beam.userData.keep = true; g.add(beam); this.headBeam = beam;
  }
  // The trailing cab, inside: the nose lined, its windshield and side windows open onto the evening, a floor, the driver's
  // desk with its screens, a ceiling light, and the cabinet (the "crew", from CABINET in doors.js) waiting for you.
  _cabRoom(car) {
    const g = new THREE.Group(); g.position.x = CAR_L / 2; g.scale.x = -1; car.add(g); // nose-local, mirrored like the nose
    const geo = noseLiningGeometry(.07), pos = geo.attributes.position, col = new Float32Array(pos.count * 3), base = new THREE.Color(0x5a5f6b);
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k), x = -pos.getX(k), lit = .42 + .5 * Math.min(1, Math.max(0, (y - .3) / 3.2)) + .25 * Math.max(0, 1 - Math.abs(x - .7) / 1.2) * Math.min(1, Math.max(0, (y - 2.2) / 1.2)); col.set([base.r * lit, base.g * lit, base.b * lit * 1.04], k * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const a = document.createElement('canvas'); a.width = a.height = 512; const x = a.getContext('2d'), U = u => u * 512, R = v => (1 - v) * 512;
    x.fillStyle = '#fff'; x.fillRect(0, 0, 512, 512); x.fillStyle = '#000';
    const hole = (s0, s1, v0, v1, r) => { x.beginPath(); x.roundRect(U(s0), R(v1), U(s1) - U(s0), R(v0) - R(v1), r); x.fill(); };
    hole(.5, .84, .32, .68, 10); hole(.21, .41, .17, .24, 5); hole(.21, .41, .76, .83, 5);
    const am = new THREE.CanvasTexture(a);
    const lining = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, alphaMap: am, alphaTest: .5 }));
    lining.userData.keep = true; lining.userData.noShadow = true; g.add(lining);
    const flat = (w, h, d, c, px, py, pz, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c })); m.position.set(px, py, pz); m.userData.noShadow = true; parent.add(m); return m; };
    const END = CAR_L / 2 - .22;
    flat(2.2 + .22, .07, 2.5, 0x3b3f48, -(2.2 - .22) / 2, .395, 0);                    // floor, from the saloon's end wall to the desk
    flat(.45, .72, 1.9, 0x2a2d34, -2.02, .79, 0);                                         // the driver's desk
    const desk = flat(.5, .05, 1.92, 0x1d1f25, -1.9, 1.2, 0); desk.rotation.z = -.35;
    [[-.45, 0x7fd0ff], [0, 0xffc46b], [.45, 0x9cff9a]].forEach(([z, c]) => { const sc = new THREE.Mesh(new THREE.PlaneGeometry(.32, .2), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(.75) })); sc.position.set(.03, .035, z); sc.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); desk.add(sc); });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(.9, .03, .22), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.32, 1.05) })); lamp.material.toneMapped = false; lamp.position.set(-.75, 3.62, 0); g.add(lamp);
    // the crew: Mini Characters for now (CABINET in doors.js says who), lit a little from within so the dim cab doesn't lose them
    const mat = library().material.clone(); mat.emissiveMap = mat.map; mat.emissive = new THREE.Color(.3, .27, .25);
    const n = CABINET.length;
    this.crew = CABINET.map((m, i) => {
      const spread = Math.min(this.mobile ? 1.05 : 1.8, .58 * (n - 1)), z = n > 1 ? (i / (n - 1) - .5) * spread : 0, p = new Person(m.kind);
      p.mesh.material = mat; p.pose('idle', { fade: 0, phase: i * .37 }); p.root.scale.multiplyScalar(.88); // the size of the passengers
      p.root.position.set(CAR_L / 2 + 1.55 - Math.abs(z) * .25, FLOOR - .12, z); p.root.rotation.y = -Math.PI / 2; // facing the windshield until you come in
      p.root.visible = false; car.add(p.root); p.info = m; p.turn = 0;
      return p;
    });
    this.cabCar = car; // the cab door's leaf comes from buildInterior (this.doors[last].inside.cabDoor)
  }
  _paintNose() {
    [[this.noseMesh, false], [this.tailMesh, true]].forEach(([mesh, tail]) => {
      if (!mesh) return;
      const p = paintNose(this.logo, ctx => drawLED(ctx, ['SPIRIT CABINET', 'EXPRESS']), { tail });
      const m = mesh.material; ['map', 'emissiveMap', 'roughnessMap'].forEach(k => m[k] && m[k].dispose());
      m.map = p.map; m.emissiveMap = p.glow; m.roughnessMap = p.mr; m.needsUpdate = true;
    });
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
    const second = L.page % 2 ? `CAR ${String(i + 1).padStart(2, '0')}` : (info.href || info.scene ? 'NOW BOARDING' : 'COMING SOON');
    if (second === L.key) return; L.key = second;
    drawLED(L.ctx, [info.title.toUpperCase(), second]);
    L.tex.needsUpdate = true;
  }
  redrawSigns() {
    this.doors.forEach((d, i) => { d.led.key = ''; this.drawSign(i); });
    if (this.noseMesh) this._paintNose();
    if (this.flyer) this._paintBanner();
    if (this.stops) this.stops.draw(1);
    if (this.copSign) this.drawCopSign(this.copRows || []);
  }
  // A small plane towing a "NUEVA SPIRIT" banner across the sky behind the train, every half minute or so
  // (not during the opening). Our own plane: white, a red stripe, a spinning propeller. The banner ripples as it's towed.
  _flyer() {
    const g = new THREE.Group(), plane = new THREE.Group(); g.add(plane); this.scene.add(g);
    const white = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: .6, metalness: .05, envMapIntensity: .5 }), red = new THREE.MeshStandardMaterial({ color: 0xc9272c, roughness: .5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: .2, metalness: .3 }), grey = new THREE.MeshStandardMaterial({ color: 0x6b707a, roughness: .5, metalness: .5 });
    const part = (geo, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; plane.add(o); return o; };
    // the plane flies toward +x: fuselage along x, nose at +x
    part(new THREE.CylinderGeometry(.42, .2, 6.4, 12), white, 0, 0, 0, Math.PI / 2);                 // fuselage, tapering to the tail
    part(new THREE.SphereGeometry(.44, 12, 8), white, 3.2, 0, 0).scale.set(1.2, 1, 1);               // nose
    part(new THREE.BoxGeometry(5.2, .05, .16), red, -.2, -.06, .42);                                  // the red stripe, both sides
    part(new THREE.BoxGeometry(5.2, .05, .16), red, -.2, -.06, -.42);
    part(new THREE.BoxGeometry(1.3, .42, .74), dark, 1.6, .38, 0);                                    // canopy
    part(new THREE.BoxGeometry(1.5, .1, 10.4), white, 1.2, .3, 0);                                    // wing
    [-1, 1].forEach(sd => part(new THREE.BoxGeometry(1.52, .11, .7), red, 1.2, .3, sd * 4.9));       // red wingtips
    part(new THREE.BoxGeometry(.9, .07, 3.4), white, -2.9, .1, 0);                                    // tailplane
    part(new THREE.BoxGeometry(1.1, 1.3, .08), red, -2.95, .7, 0).rotation.z = .25;                   // fin
    [-1, 1].forEach(sd => { part(new THREE.CylinderGeometry(.04, .04, .9, 6), grey, 1.6, -.7, sd * .7); part(new THREE.CylinderGeometry(.2, .2, .1, 12), dark, 1.6, -1.12, sd * .7).rotation.x = Math.PI / 2; });
    const prop = new THREE.Group(); prop.position.set(3.75, 0, 0); plane.add(prop);
    [0, Math.PI / 2].forEach(r => { const b = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.1, .14), dark); b.rotation.x = r; prop.add(b); });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24), new THREE.MeshBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.y = Math.PI / 2; prop.add(disc); prop.userData.keep = true;
    // the tow line and the banner behind it (its leading edge on a weighted pole)
    const L = 15, BH = 2.7, lead = -3.4 - 9;
    const line = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 9.2, 4), grey); line.rotation.z = Math.PI / 2 + .09; line.position.set(-3.4 - 4.6, -.45, 0); g.add(line);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, BH + .3, 6), grey); pole.position.set(lead, -1.0 - BH / 2, 0); g.add(pole);
    const geo = new THREE.PlaneGeometry(L, BH, 30, 3); geo.translate(-L / 2, 0, 0);
    const banner = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: .8, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: .08 }));
    banner.position.set(lead, -1.0 - BH / 2, 0); banner.userData.keep = true; g.add(banner);
    g.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
    mergeStatic(plane);
    // phones see a narrow slice of sky lower down: there it flies lower, closer and slower, across the middle of the view
    this.flyer = { g, prop, banner, base: Float32Array.from(geo.attributes.position.array), L, span: this.mobile ? 48 : 150, v: this.mobile ? 6.5 : 15, y: this.mobile ? 12.8 : 15.5, z: this.mobile ? -28 : -34, gap: 32, next: 6, on: false };
    g.position.set(-999, 0, 0);
    this._paintBanner();
  }
  _paintBanner() {
    const W = 2048, H = Math.round(2048 * 2.7 / 15), c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    // blue cloth, white hems, the logo in a white-edged square and the name in white
    const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2a5fc4'); bg.addColorStop(1, '#1b4499'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.9)'; x.fillRect(0, 10, W, 8); x.fillRect(0, H - 18, W, 8);
    const S = H - 100, L0 = 50, T = 50; x.strokeStyle = '#fff'; x.lineWidth = 10; x.beginPath(); x.roundRect(L0 + 5, T + 5, S - 10, S - 10, 18); x.stroke();
    if (this.logo) x.drawImage(this.logo, L0 + S * .14, T + S * .14, S * .72, S * .72);
    const tx = L0 + S + 60, fs = Math.round(S * .78); x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
    x.font = `900 ${fs}px Archivo, "Arial Black", sans-serif`; try { x.fontStretch = 'expanded'; } catch (e) {}
    const w = x.measureText('NUEVA SPIRIT').width, k = Math.min(1, (W - tx - 60) / w);
    x.save(); x.translate(tx, T + S * .5 + fs * .36); x.scale(k, 1); x.fillText('NUEVA SPIRIT', 0, 0); x.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = this.flyer.banner.material; if (m.map) m.map.dispose(); m.map = t; m.emissiveMap = t; m.needsUpdate = true;
  }
  _flyby(t, dt) {
    const F = this.flyer; if (!F) return;
    if (!F.on) {
      if (this.intro || t < F.next) return;
      const cx = this.mobile ? this.camera.position.x : 0; F.x0 = cx - F.span; F.x1 = cx + F.span;
      F.on = true; F.t0 = t; this.onFlyby && this.onFlyby((F.x1 - F.x0) / F.v, F.span / F.v);
    }
    const e = t - F.t0, x = F.x0 + e * F.v;
    if (x > F.x1) { F.on = false; F.next = t + F.gap; F.g.position.x = -999; return; }
    F.g.position.set(x, F.y + Math.sin(e * .7) * .35, F.z); F.g.rotation.x = Math.sin(e * .9) * .04;
    F.prop.rotation.x += dt * 70;
    // the banner ripples, more toward its free end, and sags a little
    const pos = F.banner.geometry.attributes.position, b = F.base;
    for (let i = 0; i < pos.count; i++) {
      const bx = b[i * 3], f = -bx / F.L;
      pos.setZ(i, Math.sin(bx * .9 + e * 7) * .28 * f + Math.sin(bx * .37 - e * 3.1) * .12 * f);
      pos.setY(i, b[i * 3 + 1] - f * f * .35);
    }
    pos.needsUpdate = true;
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
    // your own hands: the arms (sleeve and blocky fist) of the character you are on the bench, gripping the ticket's ends.
    // Each arm runs from below and behind the ticket up to its edge; rig space faces the eye (+z toward you).
    // a copy of the people's material that glows a little, so hands this close aren't lost in the backlight of the sunset
    const armMat = library().material.clone(); armMat.emissiveMap = armMat.map; armMat.emissive = new THREE.Color(.28, .24, .22);
    [-1, 1].forEach(sd => {
      const bone = sd < 0 ? 'arm-right' : 'arm-left', { geometry, tip, material } = limbGeometry(0, bone);
      const k = .88, grip = new THREE.Vector3(sd * .17, -.02, -.03); // fists a touch bigger than life, the toy proportion
      const dir = new THREE.Vector3(-sd * .22, .62, -.75).normalize(), shoulder = grip.clone().addScaledVector(dir, -tip.length() * k);
      const arm = new THREE.Mesh(geometry, armMat);
      arm.quaternion.copy(aimBasis(tip, new THREE.Vector3(0, 1, 0), dir, new THREE.Vector3(0, .3, 1)));
      arm.scale.setScalar(k); arm.position.copy(shoulder); rig.add(arm);
    });
    // two holds: low on your lap, and lifted up in front of your face to read
    rig.position.set(0, 1.33, z0 - (this.mobile ? .38 : .32)); rig.lookAt(this.seat); rig.rotateX(-.12);
    if (this.mobile) rig.scale.setScalar(.62); // a narrow screen sees less, so hold it a little further off
    this.rig = rig; this.rigBase = rig.quaternion.clone(); this.rigPos = rig.position.clone();
    rig.position.set(.03, 1.84, z0 - (this.mobile ? .58 : .5)); rig.lookAt(this.seat); rig.rotateX(.06);
    this.rigUpQ = rig.quaternion.clone(); this.rigUp = rig.position.clone();
    rig.position.copy(this.rigPos); rig.quaternion.copy(this.rigBase);
    this._player(g, armMat, z0);
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
  // Before the ticket: your cassette player. Our own design (Spirit Line red, a silver face, a window onto the tape,
  // piano keys along the top, the headphone cable running up). One hand holds it, the other presses play, the reels turn.
  _player(g, armMat, z0) {
    const P = new THREE.Group(), S = 1.8, B = new THREE.Group(); g.add(P); B.scale.setScalar(S); P.add(B); // B: the player, in toy proportion to your fists
    const red = new THREE.MeshStandardMaterial({ color: 0xb8262b, roughness: .4, metalness: .25 }), face = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: .35, metalness: .7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: .5 }), keyMat = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: .3, metalness: .6 });
    const box = (w, h, d, m, x, y, z, parent = B) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
    box(.118, .086, .03, red, 0, 0, 0);                    // body
    box(.106, .072, .002, face, 0, -.002, .0155);          // brushed face
    box(.084, .042, .001, dark, 0, .002, .0162);           // tape window
    // the cassette behind the window: a label and two reels with three spokes, turning when it plays
    const lc = document.createElement('canvas'); lc.width = 256; lc.height = 128; const x = lc.getContext('2d');
    x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#c9272c'; x.fillRect(0, 84, 256, 14); x.fillStyle = '#2a2a33'; x.fillRect(0, 98, 256, 4);
    x.strokeStyle = 'rgba(40,40,50,.35)'; x.lineWidth = 2; [24, 38, 52].forEach(y => { x.beginPath(); x.moveTo(14, y); x.lineTo(242, y); x.stroke(); });
    x.fillStyle = '#1a1a20'; x.beginPath(); x.roundRect(58, 44, 140, 36, 18); x.fill();
    const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.08, .04), new THREE.MeshStandardMaterial({ map: lt, roughness: .7 })); label.position.set(0, .002, .017); B.add(label);
    const reelMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .5 });
    this.reels = [-1, 1].map(sd => {
      const r = new THREE.Group(); r.position.set(sd * .021, .0035, .0177); B.add(r);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.0055, .0055, .002, 16), reelMat); hub.rotation.x = Math.PI / 2; r.add(hub);
      for (let k = 0; k < 3; k++) { const sp = box(.0016, .0042, .0022, dark, 0, 0, 0, r); sp.rotation.z = k * Math.PI * 2 / 3; sp.translateY(.0036); }
      return r;
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(.084, .042), new THREE.MeshPhysicalMaterial({ color: 0x223, transparent: true, opacity: .22, roughness: .05, clearcoat: 1, envMapIntensity: 1 }));
    glass.position.set(0, .002, .0192); B.add(glass);
    // piano keys along the top: rewind, play, fast-forward, stop; play is the one you press
    this.keys = [-.033, -.011, .011, .033].map((kx, i) => box(.019, .01, .018, i === 1 ? red : keyMat, kx, .047, .002));
    [0x15161a, 0xffffff, 0x15161a, 0x15161a].forEach((c, i) => { const t = new THREE.Mesh(new THREE.ConeGeometry(.003, .005, 3), new THREE.MeshBasicMaterial({ color: c })); t.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); t.position.set(0, .0051, 0); this.keys[i].add(t); }); // each key's symbol rides on it
    // the headphone cable, from the jack up toward your headphones
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(-.045, .045, -.004), new THREE.Vector3(-.05, .07, 0), new THREE.Vector3(-.045, .15, .04), new THREE.Vector3(-.02, .36, .16)]);
    B.add(new THREE.Mesh(new THREE.TubeGeometry(cable, 24, .0015, 6), dark));
    // your hands: the right one holds it, the left one comes in to press play
    const arm = bone => { const { geometry, tip } = limbGeometry(0, bone), m = new THREE.Mesh(geometry, armMat); m.scale.setScalar(.88); P.add(m); return { m, tip }; };
    const hold = arm('arm-left'), grip = new THREE.Vector3(.118, -.02, -.012), hdir = new THREE.Vector3(-.2, .62, -.75).normalize();
    hold.m.quaternion.copy(aimBasis(hold.tip, new THREE.Vector3(0, 1, 0), hdir, new THREE.Vector3(0, .3, 1))); hold.m.position.copy(grip).addScaledVector(hdir, -hold.tip.length() * .88);
    this.presser = { ...arm('arm-right'), shoulder: new THREE.Vector3(-.26, -.42, .3) };
    // held low out of view, and up in front of you
    P.position.set(.02, 1.25, z0 - .3); P.lookAt(this.seat); this.plDown = { p: P.position.clone(), q: P.quaternion.clone() };
    P.position.set(.01, 1.8, z0 - (this.mobile ? .56 : .46)); P.lookAt(this.seat); P.rotateX(.1); this.plUp = { p: P.position.clone(), q: P.quaternion.clone() };
    if (this.mobile) P.scale.setScalar(.75);
    this.player = P; this._press(0);
  }
  // the pressing fist: k = 0 resting out of view, 1 over the play key, 2 pressing it down
  _press(k) {
    const pr = this.presser, rest = new THREE.Vector3(-.2, -.26, .12), over = new THREE.Vector3(-.03, .17, .06), down = new THREE.Vector3(-.026, .1, .004); // the play key's top is at y .094
    const target = k <= 1 ? rest.clone().lerp(over, k) : over.clone().lerp(down, k - 1);
    const dir = target.clone().sub(pr.shoulder).normalize();
    pr.m.quaternion.copy(aimBasis(pr.tip, new THREE.Vector3(0, 1, 0), dir, new THREE.Vector3(0, .3, 1)));
    pr.m.position.copy(target).addScaledVector(dir, -pr.tip.length() * .88);
    this.keys[1].position.y = .047 - Math.max(0, k - 1) * .005;
  }
  startIntro(ticketCanvas, cb = {}) {
    if (!this.introGroup) this._rig(ticketCanvas);
    this.introGroup.visible = true; this._me(false);
    this.trainX = 70; this.arrival = null; this.approachAt(this.clock.elapsedTime + INTRO_D + 5.2);
    this.flight = null; this.doors.forEach(d => { d.target = 0; d.open = 0; });
    this.intro = { t0: this.clock.elapsedTime, cb, fired: {} };
    this.look.set(0, 1.5, 3); this.camera.position.set(0, 2.85, this.seat.z + .75); this.camera.lookAt(this.look);
    // the head: yaw/pitch driven by springs, so turns ease in, overshoot a touch and settle like a real neck
    const d = this.look.clone().sub(this.camera.position).normalize();
    this.head = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(d.y), vy: 0, vp: 0, roll: 0, jy: 0, jp: 0, next: 0 };
  }
  skipIntro() {
    const I = this.intro; if (!I) return;
    this.intro = null; this.introGroup.visible = false; this._me(true);
    if (!I.fired.arrive) { I.fired.arrive = 1; I.cb.arrive && I.cb.arrive(true); }
    if (this.arrival || this.trainX > 0) { const stop = (this.arrival && this.arrival.onStop) || I.cb.stop; this.park(); stop && stop(); }
    this.blendUntil = this.clock.elapsedTime + 2.5;
    I.cb.end && I.cb.end();
  }
  _me(on) { if (this.listener) this.listener.root.visible = on; }
  _introFrame(t, dt) {
    const I = this.intro, e = t - I.t0, cb = I.cb, D = INTRO_D, E = e - D; // E: the ticket and the train, after the cassette player
    const fire = (k, at, fn) => { if (e >= at && !I.fired[k]) { I.fired[k] = 1; fn && fn(); } };
    fire('sit', .25, cb.sit); fire('press', 2.32, cb.press); fire('start', 2.45, cb.start); // the song starts as the tape gets up to speed
    fire('lift', D + 1.15, cb.paper); fire('paper', D + 2.6, cb.paper); fire('bells', D + 3.4, cb.bells);
    fire('arrive', D + 5.2, () => { this.arrive(6, cb.stop, I.t0 + D + 5.2); cb.arrive && cb.arrive(false); });
    // when the doors open, the view lifts out of your head and pulls back: you stay on the bench, headphones on
    fire('leave', D + 12.1, () => { this.introGroup.visible = false; this._me(true); cb.leave && cb.leave(); });
    // where the eyes are: sit down, breathe, then rise up and back
    const stand0 = new THREE.Vector3(0, 2.86, this.seat.z + .75), back = new THREE.Vector3(.5, 2.4, this.seat.z + 2.3), c = this.camera;
    if (e < 1.3) c.position.lerpVectors(stand0, this.seat, easeInOut(e / 1.3));
    else if (E < 12.1) c.position.copy(this.seat);
    else { const u = easeInOut(Math.min(1, (E - 12.1) / 1.5)); c.position.lerpVectors(this.seat, back, u); c.position.y += Math.sin(Math.PI * Math.min(1, u * 1.4)) * .3; } // up over your head, then back
    c.position.y += Math.sin(t * 1.7) * .005 + (e > 1.1 && e < 1.5 ? -Math.sin((e - 1.1) / .4 * Math.PI) * .03 : 0);
    // the cassette player: up from your lap as you settle, a press on play (the key goes down, the reels start), then away
    const up = e < .9 ? 0 : e < 1.7 ? easeInOut((e - .9) / .8) : e < 2.95 ? 1 : e < 3.45 ? 1 - easeInOut((e - 2.95) / .5) : 0;
    const P = this.player; P.visible = e < 3.5;
    P.position.lerpVectors(this.plDown.p, this.plUp.p, up); P.position.z += Math.sin(up * Math.PI) * .04; P.quaternion.slerpQuaternions(this.plDown.q, this.plUp.q, up);
    P.rotateZ(Math.sin(up * Math.PI) * .05 + (e > 2.2 && e < 2.5 ? -Math.sin((e - 2.2) / .3 * Math.PI) * .02 : 0)); // a little give as you press
    this._press(e < 1.85 ? 0 : e < 2.2 ? easeInOut((e - 1.85) / .35) : e < 2.32 ? 1 + easeInOut((e - 2.2) / .12) : e < 2.42 ? 2 : e < 2.75 ? 2 - 2 * easeInOut((e - 2.42) / .33) : 0);
    if (e < 2.75 && e > 2.42) this.keys[1].position.y = .047 - .005; // play stays down while it plays
    else if (e >= 2.75) this.keys[1].position.y = .042;
    const spin = e < 2.35 ? 0 : Math.min(1, (e - 2.35) / .35); this.reels.forEach((r, i) => { r.rotation.z -= dt * 7 * spin * (i ? 1 : 1.25); });
    this.rig.visible = E > 1.0; // the ticket waits on your lap until the player is put away
    // the ticket: on your lap as you sit, lifted up to your face and looked over, then lowered as the train is coming
    const lift = E < 1.1 ? 0 : E < 2.05 ? easeInOut((E - 1.1) / .95) : E < 3.55 ? 1 : E < 4.5 ? 1 - easeInOut((E - 3.55) / .95) : 0;
    const fid = E > 2.6 && E < 3.4 ? Math.sin((E - 2.6) / .8 * Math.PI) : 0, read = Math.max(0, Math.min(1, (E - 1.8) / .5)) * Math.max(0, Math.min(1, (3.6 - E) / .4));
    this.rig.position.lerpVectors(this.rigPos, this.rigUp, lift);
    this.rig.position.z += Math.sin(lift * Math.PI) * .05; // it comes up toward you in an arc, not a straight line
    this.rig.quaternion.slerpQuaternions(this.rigBase, this.rigUpQ, lift);
    // reading it: one slow tilt toward the light and a little turn toward the stamp; held this close, anything quicker reads as shaking
    this.rig.rotateY(Math.sin((E - 1.8) * .9) * .06 * read); this.rig.rotateX(Math.sin(t * 1.1) * .006 - read * .04 * Math.sin((E - 2) * .7));
    this.rig.rotateZ(fid * .03 + Math.sin(lift * Math.PI) * .05);
    // where the attention goes: ahead as you sit, the player and the press, then the ticket as it comes up, then the train
    const front = this.cars[0].position.x + this.trainX - CAR_L / 2 - NOSE_L + .3, tgt = new THREE.Vector3();
    let tracking = false, reading = false;
    if (e < 1.0) tgt.set(0, 1.5, this.seat.z - 3.5);
    else if (E < 1.0) { tgt.lerpVectors(this.plDown.p, this.plUp.p, .55 + .45 * up); tgt.y += .01; reading = true; }
    else if (E < 3.6) { tgt.lerpVectors(this.rigPos, this.rigUp, .5 + .5 * lift); tgt.y -= .01; reading = true; } // the ticket comes up to meet the eyes
    // one long, smooth turn up and to the right, toward where the train comes from, that then follows its nose in
    else if (E < 11.4) { tgt.set(Math.max(-2.5, Math.min(18, front)), 2.0, 0); tracking = true; I.turn = I.turn || e; }
    else tgt.set(-1.2, 1.95, 0);
    this._head(tgt, t, dt, tracking, reading);
    if (E > 13.6) { this.intro = null; this.introGroup.visible = false; this._me(true); this.blendUntil = t + 2.8; cb.end && cb.end(); }
  }

  // A first-person head: springs on yaw and pitch (a quick start, a soft landing, a hint of overshoot),
  // tiny glances while it rests, a dip during big turns, a lean into the turn, and slow breathing sway.
  _head(tgt, t, dt, tracking, reading) {
    const h = this.head, c = this.camera, d = tgt.clone().sub(c.position).normalize();
    let ty = Math.atan2(-d.x, -d.z), tp = Math.asin(Math.max(-1, Math.min(1, d.y)));
    if (!tracking && !reading && t > h.next) { // little glances while holding a look (not while reading: the ticket would jump about)
      const k = 1;
      h.jy = (Math.random() - .5) * .05 * k; h.jp = (Math.random() - .5) * .03 * k; h.next = t + .7 + Math.random() * 1.3;
    }
    if (tracking || reading) { h.jy *= .9; h.jp *= .9; }
    ty += h.jy; tp += h.jp;
    const err = Math.abs(ty - h.yaw);
    tp -= Math.min(1, err / .7) * .05; // the head drops slightly mid-turn
    // the big turn off the ticket is slow and unhurried (critically damped, no overshoot), then it tracks more tightly
    const ramp = this.intro && this.intro.turn ? Math.min(1, (t - this.intro.t0 - this.intro.turn) / 2.6) : 1;
    const w = tracking ? 2.2 + 3.3 * ramp * ramp : reading ? 3.2 : 4.6, z = tracking || reading ? 1 : .78; // no overshoot while reading
    for (let n = Math.ceil(dt / .02), i = 0; i < n; i++) {
      const s = dt / n;
      h.vy += (w * w * (ty - h.yaw) - 2 * z * w * h.vy) * s; h.yaw += h.vy * s;
      h.vp += (w * w * (tp - h.pitch) - 2 * z * w * h.vp) * s; h.pitch += h.vp * s;
    }
    h.roll += (Math.max(-.06, Math.min(.06, -h.vy * .045)) - h.roll) * Math.min(1, dt * 6);
    const yaw = h.yaw + Math.sin(t * .53) * .004 + Math.sin(t * 1.37 + 1) * .0025;
    const pitch = h.pitch + Math.sin(t * 1.7) * .006 + Math.sin(t * .41 + 2) * .003; // breathing
    c.rotation.set(pitch, yaw, h.roll + Math.sin(t * .37) * .004, 'YXZ');
    // keep a look point in front of the eyes, so the hand-off to the platform view is seamless
    this.look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(8).add(c.position);
  }

  /* ---------- choreography ---------- */
  doorX(i) { return this.cars[i].position.x + this.trainX; }
  arrive(dur = 6, onStop, t0 = this.clock.elapsedTime) { this.approach = null; this.trainX = 70; this.arrival = { t0, dur, onStop }; }
  // before it brakes, the train is already on its way in at full speed (the speed the braking curve starts from),
  // so wherever you look down the line it's moving, never standing and then setting off
  approachAt(t0, dur = 6) { this.approach = { t0, v: 70 * 2.6 / dur }; }
  park() { this.arrival = null; this.approach = null; this.trainX = 0; }
  openDoors(stagger = .16) { this.doors.forEach((d, i) => setTimeout(() => { d.target = 1; }, i * stagger * 1000)); }
  setFocus(i) { this.focus = i; }
  setHover(i) { this.hover = i; }
  setPointer(nx, ny) { this.mouse.set(nx, ny); }
  // The officer on the platform: stands his post, watches the comings and goings; click him (or his label) for the standings.
  // A Mini Character in a dark suit with a police cap (peaked, a gold badge), looking toward you.
  _officer() {
    const p = new Person(6), H = p.bones.head, F = FLOOR;
    const navy = new THREE.MeshStandardMaterial({ color: 0x1f2b4d, roughness: .55 }), black = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: .3, metalness: .2 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0ac3c, roughness: .3, metalness: .85 }), band = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: .6 });
    const cg = new THREE.Group(); cg.position.set(0, .3, .005); cg.scale.setScalar(.78); H.add(cg); // sits down on his hair (the head is about .37 wide, its top .33 above the neck)
    const cap = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.userData.keep = true; o.userData.cast = true; cg.add(o); return o; };
    cap(new THREE.BoxGeometry(.5, .1, .5), navy, 0, .05, 0);              // crown
    cap(new THREE.BoxGeometry(.56, .06, .56), navy, 0, .12, .01);         // the flared top
    cap(new THREE.BoxGeometry(.505, .035, .505), band, 0, -.015, 0);      // band
    cap(new THREE.BoxGeometry(.48, .025, .2), black, 0, -.035, .3).rotation.x = .18; // peak
    cap(new THREE.BoxGeometry(.1, .11, .02), gold, 0, .06, .262);         // badge
    const x = this.mobile ? this.cars[0].position.x + 1.15 : 1.5 * this.P + 1.7, z = this.front + (this.mobile ? 6.6 : 8); // clear ground in front of him, for the camera
    p.root.position.set(x, F, z); p.root.rotation.y = Math.PI - (this.mobile ? -.05 : .32); p.pose('idle', { fade: 0 }); this.scene.add(p.root);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(x, F + 1.1, z); hit.userData.keep = true; hit.userData.noShadow = true; this.scene.add(hit);
    this.cop = { p, hit, sign: 0 };
    // the sign he holds up with the standings: a foam board, its face painted on a canvas (drawCopSign)
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 668;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const face = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(.9, .9, .9) }); face.toneMapped = false; // readable in any light, under the bloom threshold
    const board = new THREE.MeshStandardMaterial({ color: 0xd9c7a4, roughness: .9 });
    const SW = .64, SH = .42, sg = new THREE.Group(); // he's a small man: held at his chest it covers him from the chin down sg.visible = false;
    sg.add(new THREE.Mesh(new THREE.BoxGeometry(SW, SH, .018), [board, board, board, board, face, board]));
    sg.traverse(o => { if (o.isMesh) { o.userData.keep = true; o.castShadow = true; } });
    this.scene.add(sg);
    this.copSign = { g: sg, cv, tex, w: SW, h: SH };
    this.drawCopSign([]);
  }
  // the sign's face: SPIRIT POINTS, then each class in order with its points (rows from ranked() in points/js/data.js)
  drawCopSign(rows) {
    this.copRows = rows; const S = this.copSign, x = S.cv.getContext('2d'), W = S.cv.width, H = S.cv.height;
    const COL = { sr: '#d2433b', jr: '#e0a12e', so: '#2f9c7e', fr: '#4f7fd2' }, D = '"Archivo", "Arial Narrow", Arial, sans-serif';
    x.fillStyle = '#fbf8f1'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#c9272c'; x.fillRect(0, 0, W, 132);
    if (this.logo) { const t = document.createElement('canvas'); t.width = t.height = 128; const tx = t.getContext('2d'); tx.drawImage(this.logo, 0, 0, 128, 128); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#fff'; tx.fillRect(0, 0, 128, 128); x.drawImage(t, 42, 28, 76, 76); }
    x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.font = `900 64px ${D}`; try { x.fontStretch = 'expanded'; } catch (e) {}
    x.fillText('SPIRIT POINTS', 140, 70); try { x.fontStretch = 'normal'; } catch (e) {}
    if (!rows.length) {
      x.fillStyle = '#16181f'; x.font = `800 56px ${D}`; x.textAlign = 'center'; x.fillText('No scores yet', W / 2, 330);
      x.fillStyle = '#6b6e78'; x.font = `600 34px ${D}`; x.fillText('Check back after the first event', W / 2, 400); x.textAlign = 'left';
    } else {
      const max = Math.max(1, ...rows.map(r => r.pts)), rh = (H - 132 - 40) / rows.length;
      rows.forEach((r, i) => {
        const y = 132 + 20 + rh * (i + .5), lead = r.rank === 1;
        if (lead) { x.fillStyle = 'rgba(255,196,64,.18)'; x.fillRect(0, y - rh / 2 + 4, W, rh - 8); }
        x.fillStyle = lead ? '#c9272c' : '#16181f'; x.font = `900 ${lead ? 70 : 60}px ${D}`; x.textAlign = 'center'; x.fillText(String(r.rank), 82, y - 6);
        x.textAlign = 'left'; x.fillStyle = '#16181f'; x.font = `800 ${lead ? 58 : 52}px ${D}`; x.fillText(r.name.toUpperCase(), 150, y - 14);
        x.textAlign = 'right'; x.font = `900 ${lead ? 62 : 54}px ${D}`; x.fillText(r.pts.toLocaleString('en-US'), W - 48, y - 12); x.textAlign = 'left';
        x.fillStyle = 'rgba(22,24,31,.1)'; x.fillRect(150, y + 26, W - 198, 12);
        x.fillStyle = COL[r.id] || '#16181f'; x.fillRect(150, y + 26, (W - 198) * r.pts / max, 12);
      });
    }
    x.strokeStyle = '#16181f'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10);
    S.tex.needsUpdate = true;
  }
  pickCop(nx, ny) { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera); return rc.intersectObject(this.cop.hit).length > 0; }
  // where his label goes on screen (CSS px): just over his cap
  // where the sound button goes: just above the headphone listener's head (CSS pixels), while he's in view
  listenerTag() {
    const me = this.listener; if (!me || !me.root.visible) return { on: false };
    const v = new THREE.Vector3(); me.bones.head.getWorldPosition(v); v.y += .62; v.project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, on: v.z < 1 && Math.abs(v.x) < .92 && v.y > -.8 && v.y < .8 };
  }
  copTag() {
    const v = new THREE.Vector3(); this.cop.p.bones.head.getWorldPosition(v); v.y += .95; v.project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, on: v.z < 1 && Math.abs(v.x) < 1.1 && v.y > -1.1 && v.y < 1.1 };
  }
  // zoom in to him (and back out, with endCop): he holds up the sign with the standings, his face just above it
  talkToCop() {
    const C = this.cop, head = C.p.bones.head.getWorldPosition(new THREE.Vector3()), yaw = C.p.root.rotation.y, f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const side = new THREE.Vector3(f.z, 0, -f.x), dist = this.mobile ? 2.1 : 2.15;
    C.trip = { t0: this.clock.elapsedTime, p0: this.camera.position.clone(), l0: this.look.clone(), p1: head.clone().addScaledVector(f, dist).addScaledVector(side, .08).add(new THREE.Vector3(0, .02, 0)), l1: head.clone().add(new THREE.Vector3(0, this.mobile ? .08 : .12, 0)) };
  }
  endCop() { if (!this.cop.trip) return; this.cop.trip = null; this.blendUntil = this.clock.elapsedTime + 2.2; }
  _copFrame(t, dt) {
    const C = this.cop, p = C.p, c = this.camera, T = C.trip;
    p.update(dt); p.root.updateMatrixWorld(true);
    // he keeps an eye on you (within a comfortable turn), and nods along while he talks
    const v = p.bones.head.getWorldPosition(new THREE.Vector3()), d = c.position.clone().sub(v).applyQuaternion(p.root.getWorldQuaternion(new THREE.Quaternion()).invert());
    const yaw = Math.max(-.7, Math.min(.7, Math.atan2(-d.x, -d.z))), pitch = -Math.max(-.4, Math.min(.4, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    p.look.yaw += (yaw - p.look.yaw) * Math.min(1, dt * 3); p.look.pitch += (pitch - p.look.pitch) * Math.min(1, dt * 4);
    // the sign: up from low in front of him as you arrive, held at his chest with both hands, down again as you leave
    const e = T ? t - T.t0 : 0, want = T && e > 1.05 ? 1 : 0;
    C.sign += (want - C.sign) * Math.min(1, dt * (want ? 5.5 : 7));
    const S = this.copSign, k = easeInOut(Math.min(1, C.sign)); S.g.visible = C.sign > .02;
    if (S.g.visible) {
      const f = new THREE.Vector3(-Math.sin(p.root.rotation.y), 0, -Math.cos(p.root.rotation.y)), side = new THREE.Vector3(f.z, 0, -f.x), up = new THREE.Vector3(0, 1, 0);
      const low = v.clone().addScaledVector(up, -.5).addScaledVector(f, .2), high = v.clone().addScaledVector(up, -.19).addScaledVector(f, .46);
      S.g.position.lerpVectors(low, high, k); S.g.position.y += Math.sin(Math.PI * k) * .06;
      S.g.lookAt(S.g.position.clone().add(f)); S.g.rotateX(1.25 * (1 - k)); S.g.rotateZ(Math.sin(t * 1.2) * .012 * k + (1 - k) * .1);
      S.g.updateMatrixWorld(true);
      // both arms out to it, the hands behind the board
      const grip = sd => new THREE.Vector3(sd * (S.w / 2 - .1), -.04, -.05).applyMatrix4(S.g.matrixWorld); // his hands behind it (his toy fists would cover the names)
      const gl = grip(-1), gr = grip(1), sh = p.bones['arm-left'].getWorldPosition(new THREE.Vector3());
      const leftNearer = sh.distanceTo(gl) < sh.distanceTo(gr);
      p.aim('arm-left', leftNearer ? gl : gr); p.aim('arm-right', leftNearer ? gr : gl);
    }
    if (!T) return false;
    const u = easeInOut(Math.min(1, e / 1.6));
    c.position.lerpVectors(T.p0, T.p1, u); c.position.y += Math.sin(Math.PI * u) * .25; this.look.lerpVectors(T.l0, T.l1, u);
    return true;
  }
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
      const half = (this.count * CAR_L + (this.count - 1) * GAP) / 2 + NOSE_L, cx = 0, dist = Math.min(60, (half + 3.2) / Math.tan(halfH));
      this.camPos.set(cx - 1.6, 3.1, dist); this.camLook.set(cx, 2.35, 0);
    }
    if (snap) { this.camera.position.copy(this.camPos); this.look.copy(this.camLook); this.camera.lookAt(this.look); }
  }
  // Meet the Cabinet: in through the door, along the lower deck's aisle to the back of the car, the cab door slides open,
  // the crew turn round, and you step in to meet them. cb: door() as the door opens, arrive() once you're in.
  visit(i, cb = {}, opt = {}) {
    const kind = this.data[i].scene;
    if (kind === 'newsletter' || kind === 'events' || kind === 'gallery') { // the other in-train visits (scenes.js)
      this.trip = kind === 'newsletter' ? newsVisit(this, i, cb, opt.standings) : kind === 'events' ? eventsVisit(this, i, cb) : galleryVisit(this, i, cb);
      this.doors[i].target = 1.25; return;
    }
    const car = this.cars[i], L = (x, y, z) => car.localToWorld(new THREE.Vector3(x, y, z)), z = W / 2 + .05, D = CAB_DOOR, dz = (D.z0 + D.z1) / 2;
    this.trip = {
      t0: this.clock.elapsedTime, i, cb, p0: this.camera.position.clone(), l0: this.look.clone(),
      p1: L(0, 1.75, z + 3.4), l1: L(0, 1.6, -1.4),
      // the walk: from the vestibule round the partition, down the step and along the aisle to the cab door
      walk: new THREE.CatmullRomCurve3([L(0, 1.62, .35), L(.55, 1.6, -.15), L(1.15, 1.56, -.45), L(1.9, 1.5, dz), L(3.3, 1.5, dz)]),
      into: new THREE.CatmullRomCurve3([L(3.3, 1.5, dz), L(3.72, 1.5, dz), L(3.86, 1.42, -.14)]),
      door: L(D.x, 1.35, dz), crew: L(CAR_L / 2 + 1.45, 1.05, 0), fired: {}, fov: this.camera.fov
    };
    // a wider view once you're in the cab, so the whole crew fits (about 80 degrees across, within reason on a tall phone)
    const a = this.camera.aspect; this.trip.fovIn = Math.min(84, Math.max(T_FOV_MIN, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(40)) / a))));
    this.trip.walkLen = this.trip.walk.getLength();
    this.doors[i].target = 1.25;
    this.crew.forEach(p => { p.root.visible = true; p.turn = 0; p.root.rotation.y = -Math.PI / 2; p.look.yaw = p.look.pitch = 0; });
  }
  endVisit() {
    const T = this.trip; if (!T) return;
    this.trip = null; this.doors[T.i].target = 1; this.camera.fov = T.fov; this.camera.updateProjectionMatrix();
    if (T.end) T.end();
    else { const leaf = this.doors[this.count - 1].inside.cabDoor; if (leaf) leaf.position.z = (CAB_DOOR.z0 + CAB_DOOR.z1) / 2; this.crew.forEach(p => { p.root.visible = false; }); }
    this.parkedPose(true); this.blendUntil = this.clock.elapsedTime + 1;
  }
  // the newsletter's pages and the events screen: turn or step (d = 1 or -1), and where you are
  sceneStep(d) { return !!(this.trip && this.trip.step && this.trip.step(d)); }
  sceneLabel() { return this.trip && this.trip.label ? this.trip.label() : null; }
  // where each crew member's name goes on screen (CSS pixels), above their head
  crewTags() {
    const v = new THREE.Vector3();
    return this.crew.map(p => {
      p.bones.head.getWorldPosition(v); v.y += .5; v.project(this.camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, on: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
    });
  }
  _trip(t, dt) {
    const T = this.trip, e = t - T.t0, c = this.camera, fire = (k, at, fn) => { if (e >= at && !T.fired[k]) { T.fired[k] = 1; fn && fn(); } };
    const leaf = this.doors[this.count - 1].inside.cabDoor, D = CAB_DOOR;
    let bob = 0;
    if (e < 1.9) { // up to the door and in, as when boarding
      const p = e / 1.9, start = T.walk.getPointAt(0);
      if (p < .5) { const u = easeInOut(p / .5); c.position.lerpVectors(T.p0, T.p1, u); this.look.lerpVectors(T.l0, T.l1, u); }
      else { const u = easeInOut((p - .5) / .5); c.position.lerpVectors(T.p1, start, u); this.look.copy(T.l1); }
    } else if (e < 4.6) { // along the aisle, looking where you're going, then at the door
      const u = easeInOut((e - 1.9) / 2.7), p = T.walk.getPointAt(u), ahead = T.walk.getPointAt(Math.min(1, u + .22)).setY(1.45);
      c.position.copy(p); bob = Math.sin(u * T.walkLen * Math.PI * 1.7) * .012 * Math.sin(Math.PI * u);
      const toDoor = Math.max(0, Math.min(1, (u - .55) / .4)), turn = Math.min(1, (e - 1.9) / .7);
      this.look.lerpVectors(T.l1, ahead, easeInOut(turn)).lerp(T.door, easeInOut(toDoor));
    } else if (e < 5.45) { c.position.copy(T.walk.getPointAt(1)); this.look.copy(T.door); } // the door slides open
    else if (e < 6.95) { // step through into the cab
      const u = easeInOut((e - 5.45) / 1.5); c.position.copy(T.into.getPointAt(u)); bob = Math.sin(u * Math.PI * 3) * .01 * Math.sin(Math.PI * u);
      this.look.lerpVectors(T.door, T.crew, easeInOut(Math.min(1, u * 1.4)));
    } else { c.position.copy(T.into.getPointAt(1)); c.position.y += Math.sin(t * 1.3) * .004; this.look.copy(T.crew); }
    c.position.y += bob;
    const f = T.fov + (T.fovIn - T.fov) * easeInOut(Math.max(0, Math.min(1, (e - 4.9) / 2))); if (Math.abs(c.fov - f) > .01) { c.fov = f; c.updateProjectionMatrix(); }
    // the door
    fire('door', 4.55, T.cb.door);
    const open = e < 4.6 ? 0 : easeInOut(Math.min(1, (e - 4.6) / .8));
    if (leaf) leaf.position.z = (D.z0 + D.z1) / 2 - open * (D.z1 - D.z0 + .06);
    // the crew turn round as the door opens, then watch you; a couple of them wave
    const cam = c.position, v = new THREE.Vector3(), q = new THREE.Quaternion();
    this.crew.forEach((p, k) => {
      const tt = Math.max(0, Math.min(1, (e - 4.75 - k * .14) / .75)); p.root.rotation.y = -Math.PI / 2 + easeInOut(tt) * Math.PI;
      if (tt > 0 && tt < 1 && p.poseName !== 'walk') p.pose('walk', { fade: .2, speed: .6 }); else if (tt >= 1 && p.poseName !== 'idle') p.pose('idle', { fade: .4 });
      p.update(dt); p.root.updateMatrixWorld(true);
      // head: toward you once they've turned
      p.bones.head.getWorldPosition(v); const d = cam.clone().sub(v); p.root.getWorldQuaternion(q); d.applyQuaternion(q.invert());
      const w = tt, yaw = Math.max(-.8, Math.min(.8, Math.atan2(-d.x, -d.z))) * w, pitch = -Math.max(-.5, Math.min(.5, Math.atan2(d.y, Math.hypot(d.x, d.z)))) * w;
      p.look.yaw += (yaw - p.look.yaw) * Math.min(1, dt * 5); p.look.pitch += (pitch - p.look.pitch) * Math.min(1, dt * 5);
      // a wave (the first and third), for a couple of seconds after you come in
      const wv = (k === 0 || k === 2) ? Math.max(0, Math.min(1, (e - 6.3 - k * .25) / .3)) * Math.max(0, Math.min(1, (9.4 - e) / .4)) : 0;
      if (wv > 0) {
        const sh = p.bones['arm-left']; sh.getWorldPosition(v); const head = p.bones.head.getWorldPosition(new THREE.Vector3()), out = v.clone().sub(head).setY(0).normalize();
        const side = new THREE.Vector3(0, 1, 0).cross(out).normalize(), tgt = v.clone().addScaledVector(out, .22 * wv).add(new THREE.Vector3(0, .55 * wv, 0)).addScaledVector(side, Math.sin(t * 9) * .1 * wv);
        p.aim('arm-left', tgt);
      }
    });
    fire('arrive', 6.95, T.cb.arrive);
  }
  board(i, done) {
    const x = this.doorX(i), z = W / 2 + .05;
    this.flight = { x, t0: this.clock.elapsedTime, p0: this.camera.position.clone(), l0: this.look.clone(),
      p1: new THREE.Vector3(x, 1.75, z + 3.4), p2: new THREE.Vector3(x, 1.62, .35), l1: new THREE.Vector3(x, 1.6, -1.4), done };
    this.doors[i].target = 1.25;
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.pr || Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 1.75));
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); if (this.bloom) this.bloom.resolution.set(w / 2, h / 2);
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), .1), t = this.clock.elapsedTime;
    let speed = 0;
    if (this.approach && !this.arrival) { this.trainX = Math.min(165, 70 + this.approach.v * (this.approach.t0 - t)); speed = this.trainX < 165 ? this.approach.v : 0; } // the rails end at 200
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
      // the interior lights come up as the doors open, and glow warmer while you point at the door
      const lit = (.72 + .28 * o) * (1 + d.hover * .45); // on all the time now (you see in through the windows); a little brighter as the doors open
      d.inside.base.color.setScalar(lit); d.inside.seat.color.setScalar(lit); d.inside.glow.color.setRGB(1.6, 1.35, 1.02).multiplyScalar(lit * (1 + d.hover * .4));
      d.statusMats.forEach(m => m.color.setRGB(o > .05 ? .36 * 3 : 1 * .4, o > .05 ? 1 * 3 : .64 * .4, o > .05 ? .56 * 3 : .12 * .4));
      d.spill.material.opacity = o * (.28 + d.hover * .3);
      if (d.pl) d.pl.intensity = o * (5 + d.hover * 6);
      d.led.mat.color.setScalar(1.15 + d.hover * .9);
      const page = Math.floor(t / 2.6 + i * .3) % 2; if (page !== d.led.page) { d.led.page = page; this.drawSign(i); }
    });
    const c = this.camera;
    if (this.intro) { this._introFrame(t, dt); }
    else if (this.trip) { if (this.trip.frame) this.trip.frame(t, dt); else this._trip(t, dt); }
    else if (this.cop && this.cop.trip) this._copFrame(t, dt);
    else if (this.flight) {
      // line up in front of the door, then glide through it into the vestibule
      const f = this.flight, p = Math.min(1, (t - f.t0) / 1.9);
      if (p < .5) { const u = easeInOut(p / .5); c.position.lerpVectors(f.p0, f.p1, u); this.look.lerpVectors(f.l0, f.l1, u); }
      else { const u = easeInOut((p - .5) / .5); c.position.lerpVectors(f.p1, f.p2, u); this.look.copy(f.l1); }
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
    if (this.trip && this.trip.after) this.trip.after(t); // the newspaper follows your eyes
    // the ground rumbles and the air stirs only once the train is close (alongside, or its nose within ~25 m)
    const gap = this.cars[0].position.x + this.trainX - CAR_L / 2 - NOSE_L - c.position.x, near = Math.max(0, Math.min(1, 1 - (gap - 6) / 20));
    const shake = Math.min(1, speed / 25) * near * (this.intro ? .5 : 1); if (shake > .02) c.position.y += (Math.random() - .5) * .03 * shake;
    const pos = this.motes.geometry.attributes.position.array, gust = speed * near;
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= gust * .003 * (pos[i + 2] < 4 ? 1 : .25) + .004; pos[i + 1] += Math.sin(t * .7 + i) * .0015; if (pos[i] < -35) pos[i] += 70; }
    this.motes.geometry.attributes.position.needsUpdate = true;
    updatePeople(this, t, dt); updateBackground(this, t, dt); this._flyby(t, dt); if (this.cop && !this.cop.trip) this._copFrame(t, dt); this.crowd.update(t, dt); updateCity(this.city, t, dt);
    this.sky.position.copy(c.position);
    this._adapt();
    this.composer.render();
  }
  // keep frames smooth: if they're consistently slow, render at a slightly lower resolution
  _adapt() {
    const f = this.ft, now = performance.now(), d = now - f.last; f.last = now;
    if (d <= 0 || d > 250) return; // first frame, or the tab was in the background
    f.avg += (d - f.avg) * .05;
    if (now < f.check) return; f.check = now + 1500;
    if (f.avg > 24 && this.pr > (this.mobile ? .75 : 1)) { this.pr = Math.max(this.mobile ? .75 : 1, this.pr - .25); f.calm = now + 8000; this.resize(); }
    else if (f.avg < 12 && this.pr < this.prMax && now > f.calm) { this.pr = Math.min(this.prMax, this.pr + .25); f.calm = now + 8000; this.resize(); }
  }
  // Called behind the loading screen: build the opening's hands and ticket, then draw every object once
  // (the train included, wherever it is) so shaders compile and textures upload now, not mid-arrival.
  async warm(ticketCanvas) {
    if (!this.introGroup) this._rig(ticketCanvas);
    const crew = this.crew || []; crew.forEach(p => { p.root.visible = true; }); // the cab's crew, hidden until you visit, are drawn once too
    this.copSign.g.visible = true;
    this.reader.g.visible = true; this.reader.frame(this.camera); this.reader.state.up = 1; this.reader.state.open = 1; this.reader.update(this.camera, 0); // and the newspaper
    try { if (this.renderer.compileAsync) { this.introGroup.visible = true; await this.renderer.compileAsync(this.scene, this.camera); } } catch (e) {}
    const culled = []; this.scene.traverse(o => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
    const x = this.train.position.x, cam = this.camera.position.clone(), q = this.camera.quaternion.clone();
    this.introGroup.visible = true;
    [0, 70].forEach(tx => { this.train.position.x = tx; this.composer.render(); });
    // and once from the bench, so the close-up of the hands is ready too
    this.camera.position.copy(this.seat); this.camera.lookAt(0, 1.3, this.seat.z - .5); this.composer.render();
    culled.forEach(o => { o.frustumCulled = true; });
    this.train.position.x = x; this.camera.position.copy(cam); this.camera.quaternion.copy(q);
    this.introGroup.visible = false; crew.forEach(p => { p.root.visible = false; }); this.reader.g.visible = false; this.copSign.g.visible = false; this.warmed = true;
  }
}
