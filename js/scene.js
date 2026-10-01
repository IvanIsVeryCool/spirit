import * as THREE from '../vendor/three.module.min.js';

const VERT = /* glsl */`
attribute vec3 aFrom; attribute vec3 aTo; attribute vec3 aCFrom; attribute vec3 aCTo; attribute vec3 aOffset;
attribute float aRand; attribute float aDelay;
uniform float uProgress, uTime, uSize, uPixelRatio, uScatter, uFocus;
uniform vec2 uShift;
varying vec3 vColor; varying float vAlpha;
float ease(float t){ return t < .5 ? 4.*t*t*t : 1. - pow(-2.*t + 2., 3.) / 2.; }
void main(){
  float p = clamp((uProgress - aDelay * .38) / .62, 0., 1.);
  float e = ease(p);
  vec3 pos = mix(aFrom, aTo, e);
  float fly = sin(p * 3.14159);
  pos += fly * uScatter * (.4 + aRand) * vec3(sin(aRand * 41. + uTime * .7), cos(aRand * 29. + uTime * .9), sin(aRand * 17. - uTime * .6) * 1.6);
  pos += .028 * vec3(sin(uTime * 1.1 + aRand * 20.), cos(uTime * .9 + aRand * 13.), sin(uTime * .8 + aRand * 7.));
  pos += aOffset;
  float stir = min(length(aOffset), 1.2);
  vec4 mv = modelViewMatrix * vec4(pos, 1.);
  gl_Position = projectionMatrix * mv;
  gl_Position.xy += uShift * gl_Position.w;
  float depth = -mv.z;
  float dof = abs(depth - uFocus);
  gl_PointSize = uSize * (.55 + aRand * .9) * uPixelRatio / depth * (1. + dof * .45) * (1. + stir * .9);
  vColor = mix(aCFrom, aCTo, e) * (1. + stir * 2.4);
  vAlpha = (.55 + .45 * sin(uTime * 1.7 + aRand * 60.)) / (1. + dof * dof * .2) * smoothstep(34., 8., depth);
}`;
const FRAG = /* glsl */`
uniform vec3 uColorMul; uniform float uOpacity;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - .5; float r = length(c);
  if (r > .5) discard;
  float core = smoothstep(.5, .0, r);
  float a = pow(core, 1.6) * vAlpha * uOpacity;
  gl_FragColor = vec4(vColor * uColorMul * (.7 + core * .8), a);
}`;

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const hex = h => new THREE.Color(h);
const PALETTE = { white: hex('#F2F7FF'), ice: hex('#A8D4FF'), blue: hex('#4C7DFF'), deep: hex('#2346E0') };
export const CLASS_COLORS = { sr: hex('#7EA2FF'), jr: hex('#3E79FF'), so: hex('#8ED2FF'), fr: hex('#E6F2FF') };

export class Scene {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.mobile = opts.mobile;
    this.N = this.mobile ? 7000 : 16000;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.6 : 1.75);
    this.renderer.setPixelRatio(this.dpr);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 0, 12);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.mouse = new THREE.Vector2(0, 0); this.tilt = new THREE.Vector2(0, 0);
    this.pointer = { ndc: new THREE.Vector2(), active: false, prev: null, vel: new THREE.Vector3() };
    this.raycaster = new THREE.Raycaster(); this.inv = new THREE.Matrix4(); this.shockState = null;
    this.camTarget = { x: 0, y: 0, z: 12, lookY: 0 };
    this.morph = { start: 0, dur: 1, active: false, landed: true };
    this.split = 0; this.extraSplit = 0;
    this.onLand = null;
    this.anchors = {};
    this.clock = new THREE.Clock();
    this._buildParticles();
    this._buildStars();
    this.resize();
  }

  _buildParticles() {
    const N = this.N, g = new THREE.BufferGeometry();
    const rnd = () => Math.random();
    const from = new Float32Array(N * 3), to = new Float32Array(N * 3), cf = new Float32Array(N * 3), ct = new Float32Array(N * 3);
    const rand = new Float32Array(N), delay = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // start as a wide, sparse cloud
      const r = 6 + rnd() * 10, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
      from[i * 3] = r * Math.sin(ph) * Math.cos(th); from[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); from[i * 3 + 2] = r * Math.cos(ph) - 4;
      to[i * 3] = from[i * 3]; to[i * 3 + 1] = from[i * 3 + 1]; to[i * 3 + 2] = from[i * 3 + 2];
      const c = PALETTE.ice; cf[i * 3] = ct[i * 3] = c.r; cf[i * 3 + 1] = ct[i * 3 + 1] = c.g; cf[i * 3 + 2] = ct[i * 3 + 2] = c.b;
      rand[i] = rnd(); delay[i] = rnd();
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
    g.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
    g.setAttribute('aCFrom', new THREE.BufferAttribute(cf, 3));
    g.setAttribute('aCTo', new THREE.BufferAttribute(ct, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
    g.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1));
    this.offAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3); this.offAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aOffset', this.offAttr);
    this.vel = new Float32Array(N * 3); this.energy = 0; this.stir = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    this.geo = g;
    this.uniforms = {
      uProgress: { value: 1 }, uTime: { value: 0 }, uSize: { value: this.mobile ? 58 : 52 }, uPixelRatio: { value: this.dpr },
      uScatter: { value: 1.2 }, uFocus: { value: 12 }
    };
    const make = (mul, shift, opacity) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...this.uniforms, uColorMul: { value: new THREE.Vector3(...mul) }, uShift: { value: new THREE.Vector2(...shift) }, uOpacity: { value: opacity } }
    });
    this.mainMat = make([1, 1, 1], [0, 0], 0.9);
    this.group.add(new THREE.Points(g, this.mainMat));
    this.splitMats = [];
    if (!this.mobile) {
      // chromatic fringe layers: red and cyan copies nudged apart while things move
      this.splitMats = [make([1, .12, .2], [0, 0], .45), make([.1, .55, 1], [0, 0], .45)];
      this.splitMats.forEach(m => this.group.add(new THREE.Points(g, m)));
    }
  }

  _buildStars() {
    const n = this.mobile ? 500 : 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - .5) * 60; p[i * 3 + 1] = (Math.random() - .5) * 36; p[i * 3 + 2] = -8 - Math.random() * 30; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fbfff, size: 0.06, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.stars);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.visH = 2 * 12 * Math.tan(THREE.MathUtils.degToRad(17.5));
    this.visW = this.visH * this.camera.aspect;
  }

  /* ---------- shape targets ---------- */
  async loadLogo(url) {
    const img = new Image(); img.src = url; await img.decode();
    const S = 220, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, S, S);
    const d = cx.getImageData(0, 0, S, S).data, pts = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (d[(y * S + x) * 4 + 3] > 110) pts.push(x, y);
    this.logoPixels = { pts, S };
  }
  _fromPixels(pix, width, cx, cy, depth, colorFn) {
    const N = this.N, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), n = pix.pts.length / 2;
    const k = width / pix.S;
    for (let i = 0; i < N; i++) {
      const j = (Math.random() * n) | 0;
      const px = pix.pts[j * 2] + Math.random(), py = pix.pts[j * 2 + 1] + Math.random();
      pos[i * 3] = cx + (px - pix.S / 2) * k; pos[i * 3 + 1] = cy - (py - pix.S / 2) * k; pos[i * 3 + 2] = (Math.random() - .5) * depth;
      const c = colorFn(i, px / pix.S, py / pix.S); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return { pos, col };
  }
  logoTarget(cy = 0.35, block = false) {
    const narrow = this.visW < 7, w = block ? (narrow ? this.visW * .64 : Math.min(3.4, this.visW * .5)) : Math.min(4.3, this.visW * .78);
    const tmp = new THREE.Color();
    const t = this._fromPixels(this.logoPixels, w, 0, cy, 0.0, (i, u, v) => tmp.copy(PALETTE.white).lerp(PALETTE.ice, Math.min(1, v * 1.2 + Math.random() * .3)).lerp(PALETTE.blue, Math.random() < .12 ? .7 : 0));
    // give the logo real thickness, denser on its front and back faces
    for (let i = 0; i < this.N; i++) { const r = Math.random() * 2 - 1; t.pos[i * 3 + 2] = Math.sign(r) * Math.pow(Math.abs(r), .55) * 0.32; }
    if (block) this._iceBlock(t, Math.floor(this.N * 0.72), w * (narrow ? 1.1 : 1.24), w * (narrow ? 1.18 : 1.15), narrow ? 1.2 : 1.5, cy);
    return t;
  }
  // a frosted cube of particles: crisp edges, faint faces, a few motes trapped inside
  _iceBlock(t, start, W, H, D, cy) {
    const hx = W / 2, hy = H / 2, hz = D / 2, N = this.N;
    const c = new THREE.Color(), corners = [-1, 1];
    const edges = [];
    corners.forEach(a => corners.forEach(b => { edges.push([[-1, a, b], [1, a, b]]); edges.push([[a, -1, b], [a, 1, b]]); edges.push([[a, b, -1], [a, b, 1]]); }));
    const put = (i, x, y, z, col, b) => { t.pos[i * 3] = x; t.pos[i * 3 + 1] = cy + y; t.pos[i * 3 + 2] = z; t.col[i * 3] = col.r * b; t.col[i * 3 + 1] = col.g * b; t.col[i * 3 + 2] = col.b * b; };
    for (let i = start; i < N; i++) {
      const roll = Math.random();
      if (roll < .5) {
        const [e0, e1] = edges[(Math.random() * 12) | 0], k = Math.random(), j = () => (Math.random() - .5) * .03;
        put(i, (e0[0] + (e1[0] - e0[0]) * k) * hx + j(), (e0[1] + (e1[1] - e0[1]) * k) * hy + j(), (e0[2] + (e1[2] - e0[2]) * k) * hz + j(), c.copy(PALETTE.ice).lerp(PALETTE.white, Math.random() * .5), .75);
      } else if (roll < .88) {
        const ax = (Math.random() * 3) | 0, sgn = Math.random() < .5 ? -1 : 1;
        // frost gathers toward the edges of each face
        const f = () => { const r = Math.random() * 2 - 1; return Math.sign(r) * Math.pow(Math.abs(r), .35); };
        const v = [f(), f(), f()]; v[ax] = sgn;
        put(i, v[0] * hx, v[1] * hy, v[2] * hz, PALETTE.ice, .28 + Math.random() * .2);
      } else {
        put(i, (Math.random() - .5) * W * .9, (Math.random() - .5) * H * .9, (Math.random() - .5) * D * .9, PALETTE.blue, .5);
      }
    }
  }
  textTarget(str, cy = 0.6) {
    const cv = document.createElement('canvas'), W = 900, H = 220; cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    let size = 170; cx.font = `800 ${size}px Unbounded, "Arial Black", sans-serif`;
    while (cx.measureText(str).width > W * 0.94 && size > 40) { size -= 6; cx.font = `800 ${size}px Unbounded, "Arial Black", sans-serif`; }
    cx.fillText(str, W / 2, H / 2 + 6);
    const d = cx.getImageData(0, 0, W, H).data, pts = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 120) pts.push(x, y + (W - H) / 2);
    const tmp = new THREE.Color();
    return this._fromPixels({ pts, S: W }, Math.min(9, this.visW * 0.86), 0, cy, 0.3, (i, u) => tmp.copy(PALETTE.white).lerp(PALETTE.ice, u * .8 + Math.random() * .2));
  }
  // the logo at the size and spot of an element on screen (used to hand off from the loader)
  logoAtRect(rect) {
    const k = this.visH / window.innerHeight, tmp = new THREE.Color();
    const cx = (rect.left + rect.width / 2 - window.innerWidth / 2) * k, cy = -(rect.top + rect.height / 2 - window.innerHeight / 2) * k;
    return this._fromPixels(this.logoPixels, rect.width * k, cx, cy, 0.05, () => tmp.copy(PALETTE.white));
  }
  setInstant(target) {
    const g = this.geo;
    g.attributes.aFrom.array.set(target.pos); g.attributes.aTo.array.set(target.pos);
    g.attributes.aCFrom.array.set(target.col); g.attributes.aCTo.array.set(target.col);
    ['aFrom', 'aTo', 'aCFrom', 'aCTo'].forEach(a => { g.attributes[a].needsUpdate = true; });
    this.uniforms.uProgress.value = 1; this.morph.active = false; this.morph.landed = true;
  }
  pillarsTarget(rows) {
    const N = this.N, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const narrow = this.visW < 7;
    const spacing = narrow ? this.visW * 0.22 : Math.min(2.1, this.visW * 0.16), base = narrow ? -2.55 : -2.35, maxH = narrow ? 2.8 : 3.35;
    const max = Math.max(1, ...rows.map(r => Math.max(0, r.pts)));
    const any = rows.some(r => r.pts > 0);
    const pillars = rows.map((r, i) => {
      const h = 0.45 + (any ? maxH * Math.max(0, r.pts) / max : 0);
      return { r, h, x: (i - (rows.length - 1) / 2) * spacing + (narrow ? 0 : this.visW * 0.13), rad: Math.min(0.48, spacing * 0.24), rot: Math.random() * Math.PI, weight: h + 0.6 };
    });
    const totalW = pillars.reduce((s, p) => s + p.weight, 0);
    const counts = pillars.map(p => Math.floor(N * 0.9 * p.weight / totalW));
    this.anchors = {};
    let i = 0;
    const put = (x, y, z, c, bright) => {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      col[i * 3] = Math.min(1, c.r * bright); col[i * 3 + 1] = Math.min(1, c.g * bright); col[i * 3 + 2] = Math.min(1, c.b * bright); i++;
    };
    pillars.forEach((p, pi) => {
      const c = CLASS_COLORS[p.r.id], lead = any && p.r.rank === 1;
      const tip = p.rad * 1.5;
      this.anchors[p.r.id] = new THREE.Vector3(p.x, base + p.h + tip + 0.25, 0);
      this.anchors[p.r.id + '-base'] = new THREE.Vector3(p.x, base - 0.25, 0);
      const hexPt = (k, t, rad) => { const a0 = p.rot + k * Math.PI / 3, a1 = a0 + Math.PI / 3; return [Math.cos(a0) * rad * (1 - t) + Math.cos(a1) * rad * t, Math.sin(a0) * rad * (1 - t) + Math.sin(a1) * rad * t]; };
      for (let n = 0; n < counts[pi]; n++) {
        const roll = Math.random(), k = (Math.random() * 6) | 0;
        if (roll < 0.34) { // vertical edges
          const [ex, ez] = hexPt(k, 0, p.rad), y = Math.random() * p.h;
          put(p.x + ex, base + y, ez, c, 1.05 + (lead ? .25 : 0) + .3 * y / p.h);
        } else if (roll < 0.78) { // faces
          const [fx, fz] = hexPt(k, Math.random(), p.rad * (0.94 + Math.random() * .06)), y = Math.random() * p.h;
          put(p.x + fx, base + y, fz, c, .6 + (lead ? .2 : 0) + .4 * y / p.h);
        } else if (roll < 0.94) { // crystal tip
          const t = Math.pow(Math.random(), .7), [fx, fz] = hexPt(k, Math.random(), p.rad * (1 - t));
          put(p.x + fx, base + p.h + t * tip, fz, c, 1.15 + (lead ? .35 : 0));
        } else { // frost on the floor
          const a = Math.random() * Math.PI * 2, rr = p.rad * (1.1 + Math.random() * 1.6);
          put(p.x + Math.cos(a) * rr, base + (Math.random() - .5) * .04, Math.sin(a) * rr * .6, PALETTE.ice, .35);
        }
      }
    });
    // whatever is left becomes drifting dust
    for (; i < N;) put((Math.random() - .5) * this.visW * 1.2, (Math.random() - .5) * this.visH, -2 - Math.random() * 6, PALETTE.blue, .35);
    return { pos, col };
  }
  ringTarget() {
    const N = this.N, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const narrow = this.visW < 7, cx = narrow ? 0 : this.visW * 0.2, tilt = 1.08, tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const arm = i % 3, r = 0.6 + 4.2 * Math.sqrt(Math.random());
      const a = arm * (Math.PI * 2 / 3) + r * 0.75 + (Math.random() - .5) * (0.9 / r + .25);
      let x = Math.cos(a) * r, z = Math.sin(a) * r, y = (Math.random() - .5) * 0.18 * (1.4 - r / 5);
      const y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
      pos[i * 3] = cx + x; pos[i * 3 + 1] = y2 - 0.2; pos[i * 3 + 2] = z2 - 1.5;
      const c = tmp.copy(PALETTE.white).lerp(PALETTE.ice, Math.min(1, r / 2.5)).lerp(PALETTE.deep, Math.max(0, (r - 2.5) / 2.2));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    return { pos, col };
  }

  /* ---------- morphing ---------- */
  morphTo(target, { duration = 1.9, scatter = 1.2 } = {}) {
    const g = this.geo, N = this.N;
    const from = g.attributes.aFrom.array, to = g.attributes.aTo.array, cf = g.attributes.aCFrom.array, ct = g.attributes.aCTo.array, dl = g.attributes.aDelay.array;
    const prog = this.uniforms.uProgress.value;
    for (let i = 0; i < N; i++) { // freeze wherever each particle is right now
      const p = Math.min(1, Math.max(0, (prog - dl[i] * .38) / .62)), e = ease(p);
      for (let k = 0; k < 3; k++) {
        const j = i * 3 + k;
        from[j] = from[j] + (to[j] - from[j]) * e; cf[j] = cf[j] + (ct[j] - cf[j]) * e;
        to[j] = target.pos[j]; ct[j] = target.col[j];
      }
    }
    ['aFrom', 'aTo', 'aCFrom', 'aCTo'].forEach(a => { g.attributes[a].needsUpdate = true; });
    this.uniforms.uProgress.value = 0; this.uniforms.uScatter.value = scatter;
    this.morph = { start: this.clock.elapsedTime, dur: duration, active: true, landed: false };
  }

  setCamera(x, y, z, lookY) { Object.assign(this.camTarget, { x, y, z, lookY }); }
  setPointer(nx, ny, active) {
    this.mouse.set(nx, ny); this.pointer.ndc.set(nx, ny);
    if (!active) this.pointer.prev = null;
    this.pointer.active = active;
  }
  _localRay() {
    this.group.updateMatrixWorld(); this.inv.copy(this.group.matrixWorld).invert();
    this.raycaster.setFromCamera(this.pointer.ndc, this.camera);
    const o = this.raycaster.ray.origin.clone().applyMatrix4(this.inv), d = this.raycaster.ray.direction.clone().transformDirection(this.inv);
    return { o, d, hit: o.clone().addScaledVector(d, -o.z / d.z) };
  }
  // a click sends a ring of force out through the particles
  shock(nx, ny) {
    const keep = this.pointer.ndc.clone(); this.pointer.ndc.set(nx, ny);
    const { hit } = this._localRay(); this.pointer.ndc.copy(keep);
    this.shockState = { c: hit, start: this.clock.elapsedTime };
  }
  _physics() {
    const N = this.N, off = this.offAttr.array, vel = this.vel;
    const t = this.clock.elapsedTime, P = this.pointer;
    let sh = this.shockState;
    if (sh && t - sh.start > 1.3) sh = this.shockState = null;
    if (!P.active && !sh && this.energy < 2e-5) { this.stir = 0; return; }
    let ox = 0, oy = 0, oz = 0, dx = 0, dy = 0, dz = 1, mvx = 0, mvy = 0, mvz = 0, speed = 0;
    if (P.active) {
      const r = this._localRay(); ox = r.o.x; oy = r.o.y; oz = r.o.z; dx = r.d.x; dy = r.d.y; dz = r.d.z;
      if (P.prev) { P.vel.subVectors(r.hit, P.prev).clampLength(0, .6); } else P.vel.set(0, 0, 0);
      P.prev = r.hit; mvx = P.vel.x; mvy = P.vel.y; mvz = P.vel.z; speed = Math.min(1, P.vel.length() * 7);
    }
    this.stir += ((P.active ? speed : 0) - this.stir) * .2;
    const R = this.mobile ? 1.15 : .95, R2 = R * R;
    const push = .006 + speed * .045, swirl = .004 + speed * .035, drag = .22;
    let sx = 0, sy = 0, sz = 0, sr = 0, sp = 0;
    if (sh) { const age = t - sh.start; sx = sh.c.x; sy = sh.c.y; sz = sh.c.z; sr = age * 7.5; sp = .2 * Math.pow(1 - age / 1.3, 2); }
    const from = this.geo.attributes.aFrom.array, to = this.geo.attributes.aTo.array, dl = this.geo.attributes.aDelay.array;
    const prog = this.uniforms.uProgress.value;
    const k = .045, damp = .87;
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      let p = (prog - dl[i] * .38) / .62; p = p < 0 ? 0 : p > 1 ? 1 : p;
      const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const px = from[j] + (to[j] - from[j]) * e + off[j], py = from[j + 1] + (to[j + 1] - from[j + 1]) * e + off[j + 1], pz = from[j + 2] + (to[j + 2] - from[j + 2]) * e + off[j + 2];
      let fx = 0, fy = 0, fz = 0;
      if (P.active) {
        const vx = px - ox, vy = py - oy, vz = pz - oz, tt = vx * dx + vy * dy + vz * dz;
        const cx = vx - dx * tt, cy = vy - dy * tt, cz = vz - dz * tt, d2 = cx * cx + cy * cy + cz * cz;
        if (d2 < R2) {
          const d = Math.sqrt(d2) + 1e-4; let f = 1 - d / R; f *= f;
          fx += (cx / d) * f * push; fy += (cy / d) * f * push; fz += (cz / d) * f * push;
          fx += ((dy * cz - dz * cy) / d) * f * swirl; fy += ((dz * cx - dx * cz) / d) * f * swirl; fz += ((dx * cy - dy * cx) / d) * f * swirl;
          fx += mvx * f * drag; fy += mvy * f * drag; fz += mvz * f * drag;
        }
      }
      if (sh) {
        const wx = px - sx, wy = py - sy, wz = pz - sz, dd = Math.sqrt(wx * wx + wy * wy + wz * wz) + 1e-4, q = (dd - sr) / .7, band = Math.exp(-q * q);
        if (band > .01) { const f = band * sp / dd; fx += wx * f; fy += wy * f; fz += wz * f + band * sp * .5; }
      }
      let a = (vel[j] + fx - off[j] * k) * damp, b = (vel[j + 1] + fy - off[j + 1] * k) * damp, c = (vel[j + 2] + fz - off[j + 2] * k) * damp;
      vel[j] = a; vel[j + 1] = b; vel[j + 2] = c;
      off[j] += a; off[j + 1] += b; off[j + 2] += c;
      energy += Math.abs(a) + Math.abs(b) + Math.abs(c) + Math.abs(off[j]) * .05 + Math.abs(off[j + 1]) * .05 + Math.abs(off[j + 2]) * .05;
    }
    this.energy = energy / N;
    if (this.energy < 2e-5 && !P.active && !sh) { off.fill(0); vel.fill(0); }
    this.offAttr.needsUpdate = true;
  }
  project(id) {
    const a = this.anchors[id]; if (!a) return null;
    const v = a.clone().applyMatrix4(this.group.matrixWorld).project(this.camera);
    return { x: (v.x * .5 + .5) * window.innerWidth, y: (-v.y * .5 + .5) * window.innerHeight };
  }

  render(scrollVel = 0, spin = 0) {
    const t = this.clock.elapsedTime, dt = Math.min(this.clock.getDelta(), .05);
    this.uniforms.uTime.value = t;
    if (this.morph.active) {
      const p = Math.min(1, (t - this.morph.start) / this.morph.dur);
      this.uniforms.uProgress.value = p;
      if (p >= .78 && !this.morph.landed) { this.morph.landed = true; this.onLand && this.onLand(); }
      if (p >= 1) this.morph.active = false;
    }
    const mp = this.uniforms.uProgress.value, flight = Math.sin(Math.min(1, mp) * Math.PI);
    // chromatic fringe grows while particles fly or the page scrolls fast
    this.split += ((flight * 0.009 + Math.min(.008, Math.abs(scrollVel) * .00004) + this.extraSplit) - this.split) * .12;
    if (this.splitMats.length) { this.splitMats[0].uniforms.uShift.value.set(this.split, 0); this.splitMats[1].uniforms.uShift.value.set(-this.split, this.split * .3); }
    this._physics();
    // camera eases toward its section pose, plus a little pointer parallax
    const c = this.camera, ct = this.camTarget, k = 1 - Math.pow(.02, dt);
    c.position.x += (ct.x + this.mouse.x * .45 - c.position.x) * k;
    c.position.y += (ct.y + this.mouse.y * .3 - c.position.y) * k;
    c.position.z += (ct.z - c.position.z) * k;
    c.lookAt(0, ct.lookY, 0);
    this.uniforms.uFocus.value = c.position.length();
    // the whole scene leans toward the pointer so its depth reads
    this.tilt.x += (this.mouse.x - this.tilt.x) * .05; this.tilt.y += (this.mouse.y - this.tilt.y) * .05;
    this.group.rotation.y = Math.sin(t * .22) * .14 + spin + this.tilt.x * .38;
    this.group.rotation.x = -this.tilt.y * .2 + Math.sin(t * .17) * .03;
    this.stars.rotation.z = t * .006; this.stars.position.y = -window.scrollY * .0015;
    this.renderer.render(this.scene, c);
  }
}
