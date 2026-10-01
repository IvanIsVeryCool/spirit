import * as THREE from 'three';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';

// Smooth, tapered tubes along a curve, with rounded ends: the building block for fingers, wrists and sleeves.
export function tube(points, radii, { segs = 8, radial = 14, capEnd = true, capStart = false, rib = 0, ribFrom = 0 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const N = segs * (points.length - 1), frames = curve.computeFrenetFrames(N, false);
  const pos = [], uv = [], idx = [];
  const radiusAt = t => {
    const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)), k = f - i;
    let r = radii[i] + (radii[i + 1] - radii[i]) * k;
    if (rib && t >= ribFrom) r *= 1 + .06 * Math.sin(t * rib);
    return r;
  };
  const ring = (p, n, b, r, u) => {
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(p.x + r * (c * n.x + s * b.x), p.y + r * (c * n.y + s * b.y), p.z + r * (c * n.z + s * b.z));
      uv.push(u, j / radial);
    }
  };
  let rings = 0;
  const startRings = () => {
    if (!capStart) return;
    const p = curve.getPointAt(0), tg = frames.tangents[0], r0 = radiusAt(0);
    for (let k = 4; k >= 1; k--) { const ph = k / 4 * Math.PI / 2; ring(p.clone().addScaledVector(tg, -r0 * Math.sin(ph)), frames.normals[0], frames.binormals[0], Math.max(1e-4, r0 * Math.cos(ph)), 0); rings++; }
  };
  startRings();
  for (let i = 0; i <= N; i++) { const t = i / N; ring(curve.getPointAt(t), frames.normals[i], frames.binormals[i], radiusAt(t), t); rings++; }
  if (capEnd) {
    const p = curve.getPointAt(1), tg = frames.tangents[N], r1 = radiusAt(1);
    for (let k = 1; k <= 5; k++) { const ph = k / 5 * Math.PI / 2; ring(p.clone().addScaledVector(tg, r1 * Math.sin(ph) * .9), frames.normals[N], frames.binormals[N], Math.max(1e-4, r1 * Math.cos(ph)), 1); rings++; }
  }
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// an ellipsoid blob, stretched and turned to sit between two points
function blob(center, scale, quat, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat);
  m.position.copy(center); m.scale.copy(scale); if (quat) m.quaternion.copy(quat); return m;
}

function skinTextures() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#c98f6b'; x.fillRect(0, 0, 256, 256);
  const d = x.getImageData(0, 0, 256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - .5) * 14; d.data[i] += n + 4; d.data[i + 1] += n; d.data[i + 2] += n * .8; }
  x.putImageData(d, 0, 0);
  // faint creases across the knuckles (the u axis runs along each finger)
  x.strokeStyle = 'rgba(120,60,45,.28)'; x.lineWidth = 1.2;
  [.34, .36, .66, .68].forEach(u => { x.beginPath(); x.moveTo(u * 256, 0); x.lineTo(u * 256 + (Math.random() - .5) * 6, 256); x.stroke(); });
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const r = document.createElement('canvas'); r.width = r.height = 128; const y = r.getContext('2d'), e = y.createImageData(128, 128);
  for (let i = 0; i < e.data.length; i += 4) { const v = 140 + Math.random() * 70; e.data[i] = e.data[i + 1] = e.data[i + 2] = v; e.data[i + 3] = 255; }
  y.putImageData(e, 0, 0); const rough = new THREE.CanvasTexture(r); rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}
function knitTexture(base, line) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 64, 64); x.fillStyle = line;
  for (let i = 0; i < 64; i += 4) for (let j = 0; j < 64; j += 4) { x.globalAlpha = .25 + Math.random() * .2; x.fillRect(j, i, 2, 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 3); return t;
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const sk = skinTextures();
  MATS = {
    skin: new THREE.MeshPhysicalMaterial({ map: sk.map, roughnessMap: sk.rough, roughness: .66, specularIntensity: .35, sheen: .12, sheenColor: new THREE.Color(0x8a3a2a), sheenRoughness: .8 }),
    nail: new THREE.MeshPhysicalMaterial({ color: 0xf0c3b0, roughness: .25, clearcoat: .7, clearcoatRoughness: .15 }),
    lunula: new THREE.MeshStandardMaterial({ color: 0xf7e3d8, roughness: .4 }),
    sleeve: new THREE.MeshStandardMaterial({ map: knitTexture('#28304d', '#3a4468'), roughness: .95 }),
    cuff: new THREE.MeshStandardMaterial({ map: knitTexture('#b4242a', '#d4474b'), roughness: .95 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: .7 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: .9, roughness: .25 }),
    face: null
  };
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#f4efe6'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.strokeStyle = '#16181f';
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.lineWidth = i % 3 ? 2 : 4; x.beginPath(); x.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); x.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); x.stroke(); }
  const now = new Date(), hA = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2 - Math.PI / 2, mA = now.getMinutes() / 60 * Math.PI * 2 - Math.PI / 2;
  x.lineCap = 'round'; x.lineWidth = 5; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(hA) * 28, 64 + Math.sin(hA) * 28); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(mA) * 42, 64 + Math.sin(mA) * 42); x.stroke();
  x.fillStyle = '#c9272c'; x.beginPath(); x.arc(64, 64, 4, 0, 7); x.fill();
  const ft = new THREE.CanvasTexture(c); ft.colorSpace = THREE.SRGBColorSpace;
  MATS.face = new THREE.MeshPhysicalMaterial({ map: ft, roughness: .2, clearcoat: 1, clearcoatRoughness: .05 });
  return MATS;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// a smooth loft between two ellipses: the back of the hand fanning from the wrist out to the knuckles
function loft(c0, c1, maj0, maj1, min0, min1, a0, a1, b0, b1, rings = 12, radial = 26) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, s = t * t * (3 - 2 * t);
    const c = c0.clone().lerp(c1, t), A = a0.clone().lerp(a1, s).normalize(), B = b0.clone().lerp(b1, s).normalize();
    const ra = maj0 + (maj1 - maj0) * s, rb = min0 + (min1 - min0) * s;
    for (let j = 0; j <= radial; j++) {
      const th = j / radial * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th);
      // a rounded-rectangle-ish section: flatter across the back and palm
      const k = Math.pow(Math.abs(ca), .8) * Math.sign(ca), l = Math.pow(Math.abs(sa), .9) * Math.sign(sa);
      pos.push(c.x + A.x * ra * k + B.x * rb * l, c.y + A.y * ra * k + B.y * rb * l, c.z + A.z * ra * k + B.z * rb * l);
      uv.push(t, j / radial);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

/**
 * One hand pinching the edge of a ticket. Built for the right hand in "rig space" (ticket in the XY plane,
 * front facing +z, right edge at x = +.15); side = -1 mirrors it for the left hand.
 * The palm faces you, the four fingers wrap behind the ticket, and the thumb crosses over the front.
 */
export function buildHand(side = 1, { watch = false } = {}) {
  const M = mats(), g = new THREE.Group();
  const P = (x, y, z) => V(side * x, y, z);
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
  const mcp = [P(.176, .031, -.024), P(.179, .009, -.027), P(.177, -.012, -.026), P(.172, -.031, -.023)];
  const fingers = [
    { pts: [mcp[0], P(.136, .036, -.018), P(.111, .037, -.013), P(.095, .037, -.0095)], r: [.0096, .0087, .0078, .0071] },
    { pts: [mcp[1], P(.134, .011, -.02), P(.106, .011, -.0135), P(.088, .01, -.0095)], r: [.01, .0091, .0081, .0073] },
    { pts: [mcp[2], P(.135, -.014, -.019), P(.109, -.015, -.0135), P(.093, -.015, -.0095)], r: [.0095, .0086, .0077, .007] },
    { pts: [mcp[3], P(.139, -.035, -.017), P(.12, -.036, -.013), P(.107, -.036, -.0095)], r: [.0084, .0075, .0067, .0061] }
  ];
  fingers.forEach(f => add(tube(f.pts, [f.r[0] * 1.05, f.r[1] * 1.04, f.r[2] * 1.03, f.r[3]], { segs: 7, radial: 14 }), M.skin));
  // the back of the hand, from the wrist out to the knuckle line
  const wrist = P(.252, -.036, .02), knuckles = mcp[0].clone().add(mcp[3]).multiplyScalar(.5).add(P(.004, 0, 0));
  const along = knuckles.clone().sub(wrist).normalize();
  const majK = mcp[0].clone().sub(mcp[3]).normalize(), minK = new THREE.Vector3().crossVectors(along, majK).normalize();
  const majW = V(0, 1, 0).addScaledVector(along, -along.y).normalize(), minW = new THREE.Vector3().crossVectors(along, majW).normalize();
  add(loft(wrist, knuckles, .024, .037, .02, .0135, majW, majK, minW, minK), M.skin);
  // thumb: rises from the index side of the wrist and crosses over the front of the ticket
  const thumbPts = [P(.232, -.006, .022), P(.2, .016, .031), P(.168, .027, .022), P(.142, .03, .011)];
  add(tube(thumbPts, [.0165, .0138, .012, .0108], { segs: 8, radial: 16 }), M.skin);
  // the fleshy pad between thumb and palm
  const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 18), M.skin);
  pad.position.copy(P(.229, -.016, .016)); pad.scale.set(.022, .016, .012);
  pad.quaternion.setFromUnitVectors(V(1, 0, 0), thumbPts[1].clone().sub(wrist).normalize()); g.add(pad);
  // thumbnail, facing you
  const tip = thumbPts[3], dirT = tip.clone().sub(thumbPts[2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dirT);
  const nailPos = tip.clone().addScaledVector(dirT, -.0045).add(V(0, 0, .0087));
  g.add(blob(nailPos, V(.0068, .0088, .0018), q, M.nail));
  g.add(blob(nailPos.clone().addScaledVector(dirT, -.0058).add(V(0, 0, .0003)), V(.0042, .002, .0014), q, M.lunula));
  // wrist and forearm run back toward you
  const fore = [P(.236, -.03, .012), wrist.clone().add(P(.012, -.012, .012)), P(.29, -.12, .14), P(.34, -.3, .42)];
  add(tube(fore, [.024, .026, .031, .036], { segs: 8, radial: 18, capEnd: false }), M.skin);
  if (watch) {
    const wPos = fore[1].clone().lerp(fore[2], .18), wDir = fore[2].clone().sub(fore[1]).normalize();
    const band = new THREE.Mesh(new THREE.TorusGeometry(.029, .0055, 10, 28), M.strap);
    band.position.copy(wPos); band.quaternion.setFromUnitVectors(V(0, 0, 1), wDir); g.add(band);
    const up = new THREE.Vector3().crossVectors(wDir, V(side, 0, 0)).normalize(); if (up.z < 0) up.negate();
    const at = wPos.clone().addScaledVector(up, .031);
    const caseM = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .007, 28), M.steel); caseM.position.copy(at); caseM.quaternion.setFromUnitVectors(V(0, 1, 0), up); g.add(caseM);
    const face = new THREE.Mesh(new THREE.CircleGeometry(.0138, 28), M.face); face.position.copy(at.clone().addScaledVector(up, .0037)); face.quaternion.setFromUnitVectors(V(0, 0, 1), up); g.add(face);
  }
  // knitted sleeve with a ribbed cuff, pushed up a little past the wrist
  const s0 = fore[1].clone().lerp(fore[2], .34), s1 = fore[2].clone().lerp(fore[3], .12), s2 = fore[3].clone().add(P(.02, -.03, .06));
  add(tube([s0, s0.clone().lerp(s1, .5), s1], [.035, .039, .042], { segs: 6, radial: 22, capEnd: false, rib: 140 }), M.cuff);
  add(tube([s1, s1.clone().lerp(s2, .5), s2], [.045, .054, .062], { segs: 8, radial: 22, capEnd: false }), M.sleeve);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// ---- the rigged hand models (MIT, from the WebXR input-profiles hand set), posed around the ticket ----
let MODELS = null;
export function loadHandModels() {
  if (!MODELS) {
    const l = new GLTFLoader();
    MODELS = Promise.all(['right', 'left'].map(n => l.loadAsync(`/assets/hands/${n}.glb`).then(g => g.scene)))
      .then(([right, left]) => ({ right, left }));
  }
  return MODELS;
}

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const SEG = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
const TSEG = ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'];
const X = V(1, 0, 0), Y = V(0, 1, 0);
// rotate a joint and everything past it, about one of that joint's own axes (bones here are a flat list, so we do the chain ourselves)
function bend(ch, k, axisLocal, deg) {
  const b = ch[k]; if (!deg) return;
  const q = new THREE.Quaternion().setFromAxisAngle(axisLocal.clone().applyQuaternion(b.quaternion).normalize(), deg * Math.PI / 180);
  const p = b.position.clone();
  for (let i = k; i < ch.length; i++) { ch[i].position.sub(p).applyQuaternion(q).add(p); ch[i].quaternion.premultiply(q); }
}
const frameOf = (F, R, side) => {
  F = F.clone().normalize(); R = R.clone().addScaledVector(F, -R.dot(F)).normalize();
  const D = new THREE.Vector3().crossVectors(F, R).multiplyScalar(side);
  return new THREE.Matrix4().makeBasis(F, R, D);
};

// Pose: holding the ticket's edge, thumb on the front, fingers wrapped behind. Angles are degrees of flexion.
export const GRIP = {
  F: [-.85, .3, -.42], R: [.3, .95, .25], knuckle: [.17, 0, -.04],
  fingers: { 'index-finger': [10, 22, 10, -4], 'middle-finger': [12, 24, 10, 0], 'ring-finger': [14, 26, 12, 4], 'pinky-finger': [18, 28, 12, 9] },
  thumb: [40, 0, 10, 15]
};

function skinMat() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#c99072'; x.fillRect(0, 0, 256, 256);
  const d = x.getImageData(0, 0, 256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - .5) * 10; d.data[i] += n + 3; d.data[i + 1] += n; d.data[i + 2] += n * .8; }
  x.putImageData(d, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({ map, roughness: .62, specularIntensity: .3, sheen: .25, sheenColor: new THREE.Color(0xb0503a), sheenRoughness: .7 });
}

export function modelHand(model, side = 1, { watch = false, pose = GRIP } = {}) {
  const M = mats(), g = new THREE.Group(), root = model;
  const bones = {}; root.traverse(o => { if (o.isBone || /finger|thumb|wrist/.test(o.name)) bones[o.name] = o; });
  const skin = skinMat();
  root.traverse(o => { if (o.isSkinnedMesh || o.isMesh) { o.material = skin; o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });
  const wrist = bones.wrist;
  // the hand's own frame in its bind pose: fingers, thumb side, back of hand
  const kn = FINGERS.map(f => bones[`${f}-phalanx-proximal`].position);
  const knB = kn.reduce((a, b) => a.clone().add(b)).multiplyScalar(.25);
  const Fb = knB.clone().sub(wrist.position), Rb = kn[0].clone().sub(kn[3]);
  // fingers and thumb
  FINGERS.forEach(f => {
    const ch = SEG.map(s => bones[`${f}-${s}`]), [a, b, c, sp] = pose.fingers[f];
    bend(ch, 1, Y, -sp * side); bend(ch, 1, X, -a); bend(ch, 2, X, -b); bend(ch, 3, X, -c);
  });
  const th = TSEG.map(s => bones[`thumb-${s}`]), [t0, t1, t2, t3] = pose.thumb;
  bend(th, 0, X, -t0); bend(th, 0, Y, t1 * side); bend(th, 1, X, -t2); bend(th, 2, X, -t3);
  // place it: turn the bind frame onto the grip frame, then put the knuckles where they belong
  const P = a => V(side * a[0], a[1], a[2]);
  const Mb = frameOf(Fb, Rb, side), Mt = frameOf(P(pose.F), P(pose.R), side);
  const rot = Mt.clone().multiply(Mb.clone().transpose());
  root.quaternion.setFromRotationMatrix(rot);
  root.position.copy(P(pose.knuckle)).sub(knB.clone().applyQuaternion(root.quaternion));
  g.add(root);
  // a thumbnail, catching the light on the front of the ticket
  const td = bones['thumb-phalanx-distal'], tt = bones['thumb-tip'];
  // the nail faces away from the fingers it pinches against
  const along = tt.position.clone().sub(td.position).normalize();
  const nY = tt.position.clone().sub(bones['index-finger-phalanx-intermediate'].position); nY.addScaledVector(along, -nY.dot(along)).normalize();
  const nail = blob(td.position.clone().lerp(tt.position, .5).addScaledVector(nY, .0084).addScaledVector(along, -.0005), V(.0062, .0015, .0084),
    new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(nY, along).normalize(), nY, along)), M.nail);
  root.add(nail);
  // forearm, watch and sleeve continue on from the model's wrist
  const w = wrist.position.clone().applyQuaternion(root.quaternion).add(root.position);
  const back = Fb.clone().normalize().applyQuaternion(root.quaternion).negate();
  const fore = [w.clone().addScaledVector(back, -.022), w.clone().addScaledVector(back, .03), P([.3, -.13, .15]), P([.35, -.31, .43])];
  fore[2].x += back.x * .02;
  // bare skin only up to just inside the cuff
  add(tube([fore[0], fore[1], fore[1].clone().lerp(fore[2], watch ? .32 : .2)], [.021, .024, .026], { segs: 8, radial: 18, capEnd: true }), skin);
  function add(geo, mat) { const m = new THREE.Mesh(geo, mat); g.add(m); return m; }
  if (watch) {
    const wPos = fore[0].clone().lerp(fore[1], .62), wDir = fore[2].clone().sub(fore[1]).normalize();
    const band = new THREE.Mesh(new THREE.TorusGeometry(.029, .0058, 10, 28), M.strap);
    band.position.copy(wPos); band.quaternion.setFromUnitVectors(V(0, 0, 1), wDir); g.add(band);
    const up = new THREE.Vector3().crossVectors(wDir, V(side, 0, 0)).normalize(); if (up.z < 0) up.negate();
    const at = wPos.clone().addScaledVector(up, .032);
    const caseM = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .007, 28), M.steel); caseM.position.copy(at); caseM.quaternion.setFromUnitVectors(V(0, 1, 0), up); g.add(caseM);
    const face = new THREE.Mesh(new THREE.CircleGeometry(.0138, 28), M.face); face.position.copy(at.clone().addScaledVector(up, .0037)); face.quaternion.setFromUnitVectors(V(0, 0, 1), up); g.add(face);
  }
  // the cuff comes down over the wrist (on the watch side it stops just short of the watch)
  const s0 = watch ? fore[1].clone().lerp(fore[2], .12) : fore[0].clone().lerp(fore[1], .55), s1 = fore[2].clone().lerp(fore[3], .12), s2 = fore[3].clone().add(P([.02, -.03, .06]));
  add(tube([s0, s0.clone().lerp(s1, .5), s1], [.033, .038, .042], { segs: 6, radial: 22, capEnd: false, rib: 140 }), M.cuff);
  add(tube([s1, s1.clone().lerp(s2, .5), s2], [.045, .054, .062], { segs: 8, radial: 22, capEnd: false }), M.sleeve);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}
