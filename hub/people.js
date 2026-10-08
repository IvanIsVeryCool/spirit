import * as THREE from 'three';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '/vendor/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from '/vendor/jsm/utils/BufferGeometryUtils.js';

// Everyone on the platform, on the trains and riding past is one of Kenney's "Mini Characters"
// (CC0, kenney.nl, files in /assets/people). Each character is a 7-bone rig (root, legs, torso, arms, head)
// with a shared set of animations. Load them once with loadPeople() before building the scene, then
// new Person(kind) gives an animated copy: one skinned mesh, one draw call, one shared material.

export const KINDS = ['male-a', 'female-a', 'male-b', 'female-b', 'male-c', 'female-c', 'male-d', 'female-d', 'male-e', 'female-e', 'male-f', 'female-f'];
export const SCALE = 1.7;            // model units to metres: about 1.2 m tall, big-headed toy proportions
export const HIP_SIT = .026;         // seated hip joint height above the model's origin (model units)
const BONES = ['root', 'leg-left', 'leg-right', 'torso', 'arm-left', 'arm-right', 'head'];
let LIB = null;

export async function loadPeople() {
  if (LIB) return LIB;
  const loader = new GLTFLoader(), gltfs = await Promise.all(KINDS.map(k => loader.loadAsync(`/assets/people/character-${k}.glb`)));
  let material = null; const back = [];
  const models = gltfs.map(g => {
    const skinned = []; g.scene.traverse(o => { if (o.isSkinnedMesh) skinned.push(o); });
    // how far each character reaches behind its spine (backpacks, hair buns), in model units: for sitting against a backrest
    back.push(Math.max(...skinned.map(m => { m.geometry.computeBoundingBox(); return -m.geometry.boundingBox.min.z; })));
    const [body, ...rest] = skinned;
    // body and head share the same joints and bind pose, so they become one mesh on the body's skeleton
    body.geometry = mergeGeometries(skinned.map(m => m.geometry.clone()));
    rest.forEach(m => m.removeFromParent());
    // one shared material, a touch softer, so pale clothes don't flare in the sun
    if (!material) { material = body.material; material.roughness = .85; material.metalness = 0; material.envMapIntensity = .45; material.color.setScalar(.86); if (material.map) material.map.colorSpace = THREE.SRGBColorSpace; }
    body.material = material; body.name = 'person';
    return g.scene;
  });
  const clips = {}; gltfs[0].animations.forEach(c => { clips[c.name] = c; }); // the same animations drive every character
  // where each hand and foot is, in its limb bone's space: the far end of the limb's vertices in the bind pose
  const hand = {}, m0 = models[0], mesh = m0.getObjectByName('person'), g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
  ['arm-left', 'arm-right', 'leg-left', 'leg-right'].forEach(name => {
    const j = mesh.skeleton.bones.findIndex(b => b.name === name), inv = mesh.skeleton.boneInverses[j], v = new THREE.Vector3(), far = new THREE.Vector3(); let best = -1;
    for (let k = 0; k < pos.count; k++) if (si.getX(k) === j && sw.getX(k) > .5) { v.fromBufferAttribute(pos, k).applyMatrix4(inv); if (v.length() > best) { best = v.length(); far.copy(v); } }
    hand[name] = far.multiplyScalar(name.startsWith('arm') ? .82 : .9); // the palm (or the ball of the foot), a little in from the tip
  });
  // the colour map, so posed copies can be baked with vertex colours (the train's passengers)
  const img = new Image(); img.src = '/assets/people/Textures/colormap.png'; await img.decode().catch(() => {});
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth || 1; cv.height = img.naturalHeight || 1;
  const cx = cv.getContext('2d', { willReadFrequently: true }); if (img.naturalWidth) cx.drawImage(img, 0, 0);
  const palette = cx.getImageData(0, 0, cv.width, cv.height);
  return (LIB = { models, clips, material, hand, palette, back });
}
export const library = () => LIB;
// where to put a seated character's root so its back (or backpack, or hair) just meets a backrest at backZ
// (in front of it, toward -z), at the seat height seatY
export const seatAt = (kind, seatY, backZ) => ({ y: seatY - HIP_SIT * SCALE + .01, z: backZ - LIB.back[kind % LIB.back.length] * SCALE * .92 });
// characters slim enough behind to sit back on a bench (no big buns or packs): their seats stay on the bench
export const sitters = () => LIB.back.map((b, i) => [b, i]).filter(([b]) => b < .22).map(([, i]) => i);

// clips cut down to some bones (only) or without some (except), so poses can be layered
const CUT = {};
function cut(name, { only, except } = {}) {
  const key = name + '|' + (only || []).join() + '|' + (except || []).join();
  if (CUT[key]) return CUT[key];
  const src = LIB.clips[name], bone = t => t.name.split('.')[0];
  // only the rig's own bones: the source file also animates its top node, which would undo our turn
  const tracks = src.tracks.filter(t => BONES.includes(bone(t)) && (!only || only.includes(bone(t))) && (!except || !except.includes(bone(t))));
  return (CUT[key] = new THREE.AnimationClip(key, src.duration, tracks));
}
// named poses: a base movement plus, for some, the arms from another clip
const ARMS = ['arm-left', 'arm-right'];
const POSES = {
  idle: [['idle']], walk: [['walk']], sit: [['sit']], drive: [['drive']], stand: [['holding-both']],
  'idle-phone': [['idle', { except: ARMS }], ['holding-both', { only: ARMS }]],
  'sit-phone': [['sit', { except: ARMS }], ['holding-both', { only: ARMS }]],
  'walk-phone': [['walk', { except: ['arm-right'] }], ['holding-right', { only: ['arm-right'] }]],
  'walk-left': [['walk', { except: ['arm-left'] }], ['holding-left', { only: ['arm-left'] }]],
  'walk-right': [['walk', { except: ['arm-right'] }], ['idle', { only: ['arm-right'] }]]
};

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _u = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
export class Person {
  constructor(kind = 0) {
    this.kind = kind;
    this.model = SkeletonUtils.clone(LIB.models[kind % LIB.models.length]);
    this.model.rotation.y = Math.PI; // the models face +z; ours face -z at yaw 0
    this.root = new THREE.Group(); this.root.add(this.model); this.root.scale.setScalar(SCALE);
    this.mesh = this.model.getObjectByName('person'); this.mesh.userData.cast = true; this.mesh.userData.keep = true;
    this.root.userData.keep = true;
    this.bones = {}; BONES.forEach(b => { this.bones[b] = this.model.getObjectByName(b); });
    this.mixer = new THREE.AnimationMixer(this.model); this.actions = [];
    this.look = { yaw: 0, pitch: 0, roll: 0 }; this.rest = this.bones.head.quaternion.clone();
  }
  // switch to a named pose, crossfading over `fade` seconds; `phase` starts the cycle part-way through
  pose(name, { fade = .25, speed = 1, phase = 0 } = {}) {
    if (this.poseName === name) { this.actions.forEach(a => { a.timeScale = speed; }); return; }
    this.poseName = name;
    const old = this.actions;
    this.actions = POSES[name].map(([clip, opt]) => {
      const a = this.mixer.clipAction(cut(clip, opt)); a.reset(); a.timeScale = speed; a.time = phase * a.getClip().duration; a.play();
      if (old.length && fade > 0) a.fadeIn(fade);
      return a;
    });
    old.forEach(a => { if (!this.actions.includes(a)) { if (fade > 0) a.fadeOut(fade); else a.stop(); } });
  }
  // advance the animation, then turn the head on top of it
  update(dt) {
    const h = this.bones.head, L = this.look;
    h.quaternion.copy(this.rest); // some clips leave the head alone, so the turn mustn't build up frame to frame
    this.mixer.update(dt);
    if (h && (L.yaw || L.pitch || L.roll)) h.quaternion.multiply(_q.setFromEuler(_e.set(L.pitch, L.yaw, L.roll, 'YXZ')));
  }
  // a hand's position in world space
  hand(side, out = new THREE.Vector3()) { return this.tip(side === 'left' ? 'arm-left' : 'arm-right', out); }
  tip(bone, out = new THREE.Vector3()) { const b = this.bones[bone]; b.updateWorldMatrix(true, false); return out.copy(LIB.hand[bone]).applyMatrix4(b.matrixWorld); }
  // swing a limb (arm or leg bone) so its hand or foot points at a world position; call after update(). w blends from
  // the animated pose (0) to fully aimed (1), so a gesture can ease in and out instead of snapping
  aim(bone, target, w = 1) {
    if (w <= 0) return;
    const b = this.bones[bone]; b.updateWorldMatrix(true, false);
    _s.setFromMatrixPosition(b.matrixWorld); this.tip(bone, _t).sub(_s).normalize(); _u.copy(target).sub(_s).normalize();
    _qa.setFromUnitVectors(_t, _u); b.getWorldQuaternion(_qb); b.parent.getWorldQuaternion(_qc);
    const aimed = _qc.invert().multiply(_qa.multiply(_qb));
    if (w >= 1) b.quaternion.copy(aimed); else b.quaternion.slerp(aimed, w);
    b.updateWorldMatrix(false, false);
  }
}

// A still copy of a character in a pose, as plain geometry with vertex colours: for baking into the train interiors.
export function posedGeometry(kind, pose, t = .3) {
  const p = new Person(kind); p.pose(pose, { fade: 0 }); p.mixer.update(t * .2);
  p.model.rotation.y = 0; p.root.scale.setScalar(1); p.root.updateMatrixWorld(true);
  const mesh = p.mesh, g = mesh.geometry, n = g.attributes.position.count, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new THREE.Vector3();
  const { palette } = LIB, uv = g.attributes.uv, c = new THREE.Color();
  for (let k = 0; k < n; k++) {
    mesh.getVertexPosition(k, v); v.applyMatrix4(mesh.matrixWorld); pos.set([v.x, v.y, v.z], k * 3);
    // glTF uvs run top-down, like the image rows
    const px = Math.min(palette.width - 1, Math.max(0, Math.floor(uv.getX(k) * palette.width))), py = Math.min(palette.height - 1, Math.max(0, Math.floor(uv.getY(k) * palette.height))), o = (py * palette.width + px) * 4;
    c.setRGB(palette.data[o] / 255, palette.data[o + 1] / 255, palette.data[o + 2] / 255, THREE.SRGBColorSpace); col.set([c.r, c.g, c.b], k * 3);
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.index) out.setIndex(g.index.clone());
  const flat = out.toNonIndexed(); flat.computeVertexNormals(); return flat;
}

// One limb of a character as its own still mesh, in that limb bone's space (origin at the shoulder or hip):
// for the hands you see in the opening, which are your own character's arms. Returns { geometry, tip, material }.
const LIMBS = {}; // built once per character and limb: the opening, the cassette player and the newspaper share them
export function limbGeometry(kind, bone) {
  const key = kind + bone, hit = LIMBS[key]; if (hit) return { geometry: hit.geometry, tip: hit.tip.clone(), material: LIB.material };
  const model = LIB.models[kind % LIB.models.length], mesh = model.getObjectByName('person'), sk = mesh.skeleton;
  const j = sk.bones.findIndex(b => b.name === bone), inv = sk.boneInverses[j], src = mesh.geometry;
  const pos = src.attributes.position, nor = src.attributes.normal, uv = src.attributes.uv, si = src.attributes.skinIndex, sw = src.attributes.skinWeight;
  const mine = k => si.getX(k) === j && sw.getX(k) > .5, idx = src.index, P = [], N = [], U = [], v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(inv);
  for (let f = 0; f < idx.count; f += 3) {
    const tri = [idx.getX(f), idx.getX(f + 1), idx.getX(f + 2)]; if (!tri.every(mine)) continue;
    tri.forEach(k => { v.fromBufferAttribute(pos, k).applyMatrix4(inv); P.push(v.x, v.y, v.z); v.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z); U.push(uv.getX(k), uv.getY(k)); });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  LIMBS[key] = { geometry: g, tip: LIB.hand[bone].clone() };
  return { geometry: g, tip: LIB.hand[bone].clone(), material: LIB.material };
}
// a rotation that turns a limb (pointing along `from` with `up` its upper side, in its own space) to point along `to`, upper side toward `upTo`
export function aimBasis(from, up, to, upTo) {
  const basis = (a, b) => { const x = a.clone().normalize(), z = new THREE.Vector3().crossVectors(x, b).normalize(), y = new THREE.Vector3().crossVectors(z, x); return new THREE.Matrix4().makeBasis(x, y, z); };
  const m = basis(to, upTo).multiply(basis(from, up).invert());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
