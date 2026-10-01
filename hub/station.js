import * as THREE from 'three';
import { RoomEnvironment } from '/vendor/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from '/vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/jsm/postprocessing/OutputPass.js';

const CAR_L = 4.6, GAP = .42, W = 2.5, H = 2.9, DOOR_W = 1.24, DOOR_H = 2.05;
const BG = 0x04081a;
const easeOut3 = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const glow = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }); m.toneMapped = false; return m; };

export class Station {
  constructor(canvas, { mobile, count }) {
    this.mobile = mobile; this.count = count;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(BG); s.fog = new THREE.FogExp2(BG, mobile ? .035 : .03);
    const pm = new THREE.PMREMGenerator(r); s.environment = pm.fromScene(new RoomEnvironment(), .04).texture;
    this.camera = new THREE.PerspectiveCamera(mobile ? 50 : 34, 1, .1, 200);
    this.clock = new THREE.Clock();
    this.mouse = new THREE.Vector2(); this.par = new THREE.Vector2();
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.shake = 0; this.hover = -1; this.focus = 0; this.flight = null;

    s.add(new THREE.HemisphereLight(0x6f8fff, 0x05060f, .55));
    const key = new THREE.DirectionalLight(0xc8dcff, 1.6); key.position.set(-8, 12, 10); s.add(key);
    const rim = new THREE.DirectionalLight(0x3e79ff, 1.2); rim.position.set(10, 4, -8); s.add(rim);

    this._platform(); this._hall(); this._train(); this._dust();
    if (!mobile) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(s, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .6, .4, .7);
      this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    }
    this.resize();
    this.parkedPose(true);
    this.trainX = 60; // the platform starts empty
  }

  /* ---------- the station ---------- */
  _platform() {
    const s = this.scene, front = W / 2 + .14, depth = 10;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x0b1130, roughness: .82, metalness: .1, envMapIntensity: .3 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(140, 2, depth), concrete);
    plat.position.set(0, -.75, front + depth / 2); s.add(plat);
    // glowing platform edge and a row of tactile studs
    const edge = new THREE.Mesh(new THREE.BoxGeometry(140, .03, .1), glow(0xbfd8ff, 2.2)); edge.position.set(0, .27, front + .08); s.add(edge);
    const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .035, .02, 8), new THREE.MeshStandardMaterial({ color: 0x8fb4ff, roughness: .4, metalness: .3, emissive: 0x1b3cbf, emissiveIntensity: .4 }), 1400);
    const m = new THREE.Matrix4(); let k = 0;
    for (let x = -70; x < 70 && k < 1400; x += .2) for (let z = 0; z < 3 && k < 1400; z++) { m.makeTranslation(x + (z % 2) * .1, .26, front + .35 + z * .16); studs.setMatrixAt(k++, m); }
    studs.count = k; s.add(studs);
    // track bed and rails
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(140, 8), new THREE.MeshStandardMaterial({ color: 0x03050f, roughness: 1 }));
    bed.rotation.x = -Math.PI / 2; bed.position.set(0, -1.1, 0); s.add(bed);
    [-.75, .75].forEach(z => { const rail = new THREE.Mesh(new THREE.BoxGeometry(140, .08, .08), new THREE.MeshStandardMaterial({ color: 0x5a6a9a, metalness: .9, roughness: .25 })); rail.position.set(0, -1.02, z); s.add(rail); });
    this.platformFront = front;
  }
  _hall() {
    const s = this.scene;
    // back wall with tall light slats behind the tracks
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(140, 22), new THREE.MeshStandardMaterial({ color: 0x050a20, roughness: .9 }));
    wall.position.set(0, 6, -7); s.add(wall);
    const slat = new THREE.InstancedMesh(new THREE.BoxGeometry(.06, 4.2, .05), glow(0x3e79ff, .7), 40);
    const m = new THREE.Matrix4(); for (let i = 0; i < 40; i++) { m.makeTranslation(-78 + i * 4, 3.2, -6.9); slat.setMatrixAt(i, m); } s.add(slat);
    const band = new THREE.Mesh(new THREE.BoxGeometry(140, .05, .05), glow(0x9cc4ff, 1)); band.position.set(0, 5.6, -6.9); s.add(band);
    // canopy light panels over the platform
    const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, .05, .5), glow(0xdbe8ff, 1.5), 40);
    for (let i = 0; i < 40; i++) { m.makeTranslation(-78 + i * 4, 7.2, this.platformFront + 2.6); panels.setMatrixAt(i, m); } s.add(panels);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(140, .3, .6), new THREE.MeshStandardMaterial({ color: 0x0a1030, metalness: .6, roughness: .5 }));
    beam.position.set(0, 7.45, this.platformFront + 2.6); s.add(beam);
  }
  _dust() {
    const n = this.mobile ? 500 : 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - .5) * 60; p[i * 3 + 1] = Math.random() * 9 - .5; p[i * 3 + 2] = -6 + Math.random() * 18; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color: 0xa8ccff, size: .035, transparent: true, opacity: .6, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(g, mat); this.scene.add(this.dust);
  }

  /* ---------- the train ---------- */
  _train() {
    const train = this.train = new THREE.Group(); this.scene.add(train);
    const body = new THREE.MeshStandardMaterial({ color: 0x101a44, metalness: .72, roughness: .3, envMapIntensity: .55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x05081a, metalness: .4, roughness: .7 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x1b2a68, metalness: .7, roughness: .28, envMapIntensity: .6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x07102e, metalness: .3, roughness: .08, emissive: 0x2a4fe0, emissiveIntensity: .14, envMapIntensity: 1.2 });
    // cross-section: flat floor, rounded roof
    const sh = new THREE.Shape(), hw = W / 2, rr = .75, br = .14;
    sh.moveTo(-hw + br, 0); sh.lineTo(hw - br, 0); sh.quadraticCurveTo(hw, 0, hw, br); sh.lineTo(hw, H - rr);
    sh.quadraticCurveTo(hw, H, hw - rr, H); sh.lineTo(-hw + rr, H); sh.quadraticCurveTo(-hw, H, -hw, H - rr); sh.lineTo(-hw, br); sh.quadraticCurveTo(-hw, 0, -hw + br, 0);
    const shell = new THREE.ExtrudeGeometry(sh, { depth: CAR_L, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 2, curveSegments: 12 });
    shell.rotateY(Math.PI / 2); shell.translate(-CAR_L / 2, 0, 0);
    const z = hw + .06; // just outside the bevelled shell
    this.cars = []; this.doors = [];
    for (let i = 0; i < this.count; i++) {
      const car = new THREE.Group(); car.position.x = (i - (this.count - 1) / 2) * (CAR_L + GAP);
      car.add(new THREE.Mesh(shell, body));
      const under = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - .5, .55, W - .5), dark); under.position.y = -.28; car.add(under);
      // light lines that run the length of the car
      // the light line breaks around the door
      const segL = (CAR_L - .1) / 2 - (DOOR_W / 2 + .1);
      [-1, 1].forEach(sd => { const stripe = new THREE.Mesh(new THREE.BoxGeometry(segL, .045, .02), glow(0x3e79ff, 3)); stripe.position.set(sd * (DOOR_W / 2 + .1 + segL / 2), .9, z + .04); car.add(stripe); });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - .2, .03, .02), glow(0xbfd8ff, 2)); roof.position.set(0, H - .42, z + .02); car.add(roof);
      // windows either side of the door
      [-1, 1].forEach(sd => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.22, .82, .04), glass); win.position.set(sd * 1.48, 1.78, z + .02); car.add(win);
      });
      // door: an opening that glows when the leaves slide apart
      const frame = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + .14, DOOR_H + .1, .03), dark); frame.position.set(0, .12 + DOOR_H / 2, z - .006); car.add(frame);
      const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfe2ff) }); lightMat.toneMapped = false;
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W - .04, DOOR_H - .04), lightMat); inner.position.set(0, .12 + DOOR_H / 2, z + .016); car.add(inner);
      const leaves = [-1, 1].map(sd => {
        const leaf = new THREE.Group();
        const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, DOOR_H, .06), doorMat); leaf.add(panel);
        const w = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2 - .2, .62, .02), glass); w.position.set(0, .38, .035); leaf.add(w);
        const edgeLight = new THREE.Mesh(new THREE.BoxGeometry(.02, DOOR_H - .1, .02), glow(0x9cc4ff, 1.6)); edgeLight.position.set(-sd * (DOOR_W / 4 - .01), 0, .04); leaf.add(edgeLight);
        leaf.position.set(sd * DOOR_W / 4, .12 + DOOR_H / 2, z + .045); car.add(leaf); leaf.userData.sd = sd; return leaf;
      });
      // light spilling onto the platform
      const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.MeshBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: this._spillTex() }));
      spill.rotation.x = -Math.PI / 2; spill.position.set(0, .28, z + 1.35); car.add(spill);
      let pl = null; if (!this.mobile) { pl = new THREE.PointLight(0x9cc4ff, 0, 6, 1.6); pl.position.set(0, 1.4, z + .7); car.add(pl); }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + .5, DOOR_H + .6, .6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, .12 + DOOR_H / 2, z + .2); hit.userData.door = i; car.add(hit);
      train.add(car); this.cars.push(car);
      this.doors.push({ leaves, inner, lightMat, spill, pl, hit, open: 0, target: 0, hover: 0 });
    }
    // the front of the train: a rounded nose with a headlight
    // hemisphere bulges along its local +z; turned so it points down the track (-x)
    const first = this.cars[0], nose = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI, 0, Math.PI), body);
    nose.rotation.y = -Math.PI / 2; nose.scale.set(W / 2 + .05, H / 2 + .05, 2.1); nose.position.set(-CAR_L / 2 + .02, H / 2, 0); first.add(nose);
    const vis = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI, .5, .7), glass);
    vis.rotation.y = -Math.PI / 2; vis.scale.set(W / 2 + .09, H / 2 + .09, 2.16); vis.position.set(-CAR_L / 2 + .02, H / 2, 0); first.add(vis);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.26, .07, W * .62), glow(0xe6f0ff, 4)); head.position.set(-CAR_L / 2 - 1.86, .92, 0); first.add(head);
    const last = this.cars[this.count - 1], tail = new THREE.Mesh(new THREE.BoxGeometry(.04, .6, W * .6), glow(0x3e79ff, 2.5)); tail.position.set(CAR_L / 2 + .06, 1.4, 0); last.add(tail);
    // gangways between cars
    for (let i = 0; i < this.count - 1; i++) { const g = new THREE.Mesh(new THREE.BoxGeometry(GAP + .2, H - .7, W - .7), dark); g.position.set(this.cars[i].position.x + CAR_L / 2 + GAP / 2, (H - .7) / 2 + .2, 0); train.add(g); }
    this.trainX = 0; this.arrival = null;
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
  doorX(i) { return this.cars[i].position.x + this.trainX; }

  /* ---------- choreography ---------- */
  arrive(dur = 4.6, onStop) { this.trainX = 60; this.arrival = { t0: this.clock.elapsedTime, dur, onStop }; }
  park() { this.arrival = null; this.trainX = 0; this.sway = 0; }
  openDoors(stagger = .14) { this.doors.forEach((d, i) => setTimeout(() => { d.target = 1; }, i * stagger * 1000)); }
  setFocus(i) { this.focus = i; }
  setHover(i) { this.hover = i; }
  pick(nx, ny) {
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hit = rc.intersectObjects(this.doors.map(d => d.hit))[0];
    return hit ? hit.object.userData.door : -1;
  }
  project(i) {
    const v = new THREE.Vector3(0, .12 + DOOR_H + .55, W / 2 + .1); this.cars[i].localToWorld(v); v.project(this.camera);
    return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight, vis: v.z < 1 };
  }
  parkedPose(snap) {
    if (this.mobile) { const x = this.cars[this.focus].position.x; this.camPos.set(x - 1, 1.7, 12.2); this.camLook.set(x, 1.05, 0); }
    else { const fit = Math.max(1, 1.75 / this.camera.aspect); this.camPos.set(-3.6, 2.6, 22 * fit); this.camLook.set(.4, .6, 0); }
    if (snap) { this.camera.position.copy(this.camPos); this.look.copy(this.camLook); }
  }
  // fly the camera to a door and through it
  board(i, done) {
    const x = this.doorX(i), z = W / 2;
    const p0 = this.camera.position.clone(), l0 = this.look.clone();
    const p1 = new THREE.Vector3(x, 1.2, z + 2.8), p2 = new THREE.Vector3(x, 1.15, z + .22), l1 = new THREE.Vector3(x, 1.15, 0);
    this.flight = { t0: this.clock.elapsedTime, p0, l0, p1, p2, l1, done };
    this.doors[i].target = 1.25;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
  }
  setPointer(nx, ny) { this.mouse.set(nx, ny); }

  render() {
    const dt = Math.min(this.clock.getDelta(), .1), t = this.clock.elapsedTime;
    // train motion: rolls in and brakes to a stop
    let speed = 0;
    if (this.arrival) {
      const a = this.arrival, p = Math.min(1, (t - a.t0) / a.dur);
      const prev = this.trainX; this.trainX = 60 * Math.pow(1 - p, 3); speed = (prev - this.trainX) / Math.max(dt, 1e-3);
      if (p >= 1) { this.arrival = null; this.sway = 1; a.onStop && a.onStop(); }
    }
    this.sway = (this.sway || 0) * .94;
    this.train.position.x = this.trainX;
    this.train.position.y = Math.sin(t * 38) * Math.min(.012, speed * .0006);
    this.train.rotation.z = Math.sin(t * 9) * .006 * this.sway;
    this.shake = Math.min(1, speed / 30);
    // doors
    this.doors.forEach((d, i) => {
      const goal = Math.min(1.25, d.target + (this.hover === i && d.target >= 1 ? .1 : 0));
      d.open += (goal - d.open) * Math.min(1, dt * 4.5);
      const o = easeInOut(Math.min(1, d.open));
      d.leaves.forEach(l => { l.position.x = l.userData.sd * (DOOR_W / 4 + o * (DOOR_W / 2 - .02) + Math.max(0, d.open - 1) * .2); });
      const hov = this.hover === i ? 1 : 0; d.hover += (hov - d.hover) * Math.min(1, dt * 6);
      const k = o * (1.6 + d.hover * 1.4);
      d.lightMat.color.setRGB(.55 * k + .02, .72 * k + .03, 1 * k + .06);
      d.spill.material.opacity = o * (.35 + d.hover * .35);
      if (d.pl) d.pl.intensity = o * (4 + d.hover * 5);
    });
    // camera: parked pose, pointer parallax, a little shake while the train passes, or flying through a door
    const c = this.camera;
    if (this.flight) {
      const f = this.flight, p = Math.min(1, (t - f.t0) / 1.5);
      if (p < .55) { const u = easeInOut(p / .55); c.position.lerpVectors(f.p0, f.p1, u); this.look.lerpVectors(f.l0, f.l1, u); }
      else { const u = Math.pow((p - .55) / .45, 2); c.position.lerpVectors(f.p1, f.p2, u); this.look.copy(f.l1); }
      if (p >= 1 && !f.fired) { f.fired = true; f.done && f.done(); }
    } else {
      this.parkedPose(false);
      this.par.lerp(this.mouse, .05);
      const k = 1 - Math.pow(.05, dt);
      c.position.x += (this.camPos.x + this.par.x * (this.mobile ? .3 : 1.1) - c.position.x) * k;
      c.position.y += (this.camPos.y + this.par.y * .5 - c.position.y) * k;
      c.position.z += (this.camPos.z - c.position.z) * k;
      this.look.lerp(this.camLook, 1 - Math.pow(.04, dt));
    }
    c.lookAt(this.look);
    if (this.shake > .01) { c.position.y += (Math.random() - .5) * .025 * this.shake; c.rotation.z += (Math.random() - .5) * .002 * this.shake; }
    // dust drifts, and gets pulled along by the passing train
    const pos = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] -= speed * .004 * (pos[i + 2] < 3 ? 1 : .3) + .002; pos[i + 1] += Math.sin(t + i) * .0008;
      if (pos[i] < -30) pos[i] += 60;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, c);
  }
}
