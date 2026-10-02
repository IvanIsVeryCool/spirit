import * as THREE from 'three';

// People waiting on the platform, the town on the hills, traffic behind the fence, clouds, birds,
// and the small things a real platform has. Everything here is cheap: shared materials,
// merged or instanced geometry, no new lights.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const glowMat = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }); m.toneMapped = false; return m; };
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); // same town every visit

/* ---------- merging: many small static meshes into one draw call per material ---------- */
function flatGeometry(mesh, rel) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const out = new THREE.BufferGeometry();
  ['position', 'normal', 'uv'].forEach(k => out.setAttribute(k, g.attributes[k]));
  out.applyMatrix4(rel);
  if (rel.determinant() < 0) { // mirrored: flip winding so faces still point out
    const p = out.attributes.position.array, nn = out.attributes.normal.array, uv = out.attributes.uv.array;
    for (let t = 0; t < n; t += 3) for (const [arr, sz] of [[p, 3], [nn, 3], [uv, 2]]) for (let c = 0; c < sz; c++) { const a = (t + 1) * sz + c, b = (t + 2) * sz + c; [arr[a], arr[b]] = [arr[b], arr[a]]; }
  }
  return out;
}
function concat(geos) {
  const total = geos.reduce((s, g) => s + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
  [['position', 3], ['normal', 3], ['uv', 2]].forEach(([k, sz]) => {
    const arr = new Float32Array(total * sz); let o = 0;
    geos.forEach(g => { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; });
    out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
  });
  out.computeBoundingSphere(); out.computeBoundingBox(); return out;
}
// Merge the static meshes under `root` (skipping anything marked userData.keep, and its children).
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), groups = new Map();
  const walk = o => {
    if (o.userData.keep) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && o.visible) {
      const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '') + (o.frustumCulled ? '' : 'f') + o.renderOrder;
      (groups.get(key) || groups.set(key, []).get(key)).push(o);
    }
    o.children.forEach(walk);
  };
  root.children.forEach(walk);
  let merged = 0;
  groups.forEach(list => {
    if (list.length < 2) return;
    const geo = concat(list.map(m => flatGeometry(m, new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))));
    const m0 = list[0], mesh = new THREE.Mesh(geo, m0.material);
    Object.assign(mesh, { castShadow: m0.castShadow, receiveShadow: m0.receiveShadow, frustumCulled: m0.frustumCulled, renderOrder: m0.renderOrder });
    list.forEach(m => m.parent.remove(m)); root.add(mesh); merged += list.length - 1;
  });
  // drop groups that are now empty
  const prune = o => { o.children.slice().forEach(prune); if (o !== root && o.isGroup && !o.children.length && !o.userData.keep) o.parent.remove(o); };
  prune(root);
  return merged;
}

/* ---------- people ----------
   An original friendly-avatar style: a big round head with dot eyes, light brows, a small smile and rosy cheeks,
   on a soft rounded body. The head is described once here (relative to the neck pivot) and used by person()
   below, by the crowd's instanced parts (crowd.js) and, through person(), by the passengers inside the cars. */
export const HEAD_R = .155;
const HQ = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
// each part: [geometry, matrix, colour]; colour 'skin' or 'hair' means the person's own
export function headParts() {
  const R = HEAD_R, fz = -R * .95, S = (r, w = 16, h = 12, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
  const smile = new THREE.TorusGeometry(.024, .0055, 6, 14, Math.PI);
  return {
    face: [
      [new THREE.CapsuleGeometry(.05, .06, 3, 10), HQ(0, .02), 'skin'],                       // neck
      [S(R, 24, 18), HQ(0, .2, 0, 0, 0, 0, 1.03, .97, .97), 'skin'],                          // head
      [S(.03, 10, 8), HQ(-R, .2, .005, 0, 0, 0, .45, 1, .8), 'skin'], [S(.03, 10, 8), HQ(R, .2, .005, 0, 0, 0, .45, 1, .8), 'skin'], // ears
      [S(.015, 10, 8), HQ(0, .188, fz - .006), 'skin'],                                     // nose
      ...[-1, 1].flatMap(sd => [
        [S(.021, 12, 10), HQ(sd * .054, .214, fz + .003, 0, 0, 0, .78, 1.2, .5), 0x1d1715],   // eyes
        [S(.0065, 8, 6), HQ(sd * .054 + .007, .227, fz - .006), 0xffffff],                  // a glint in each
        [new THREE.BoxGeometry(.046, .01, .012), HQ(sd * .056, .262, fz + .01, 0, 0, -sd * .14), 0x2e211a], // brows
        [S(.022, 10, 8), HQ(sd * .088, .172, fz + .02, 0, 0, 0, 1, .62, .35), 0xff9c94]     // cheeks
      ]),
      [smile, HQ(0, .162, fz + .004, 0, 0, Math.PI), 0x8a3a38]                             // smile
    ],
    short: [[S(R * 1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI * .5), HQ(0, .212, .014, .36), 'hair'], [S(R * .95, 20, 14), HQ(0, .185, .03, 0, 0, 0, .99, .86, .84), 'hair']],
    long: [[new THREE.CapsuleGeometry(.12, .2, 4, 12), HQ(0, .14, .07, 0, 0, 0, 1.1, 1, .9), 'hair']],
    hat: [[S(R * 1.04, 24, 12, 0, Math.PI * 2, 0, Math.PI * .56), HQ(0, .215), 'hat'], [new THREE.TorusGeometry(R * .96, .026, 8, 24), HQ(0, .235, 0, Math.PI / 2), 'hat']]
  };
}

export const SKIN = [0x8d5a3b, 0xc68863, 0xe0ac8a, 0x6b432b, 0xb57a52, 0xf0c3a2, 0x9b6a48];
export const HAIR = [0x16110e, 0x2b1d14, 0x4a3020, 0x8a6a3a, 0x0e0c0b, 0x5a3a24];
export const TOPS = [0x1f2a4d, 0xc9272c, 0x6d727c, 0x2f4a3a, 0xa8832e, 0xbdb6a8, 0x3a2f4a, 0x8a4a3a, 0x2c3a5a, 0x3f8f8a, 0xe0a030, 0x5c8de0, 0xd9545a];
export const PANTS = [0x2c3a5a, 0x1d1f26, 0x8a7a5c, 0x3b4e6e, 0x4a4a52];
const mats = {};
const mat = (hex, rough = .85) => mats[hex + '_' + rough] || (mats[hex + '_' + rough] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
const limb = (a, b, r, m) => {
  const v = new THREE.Vector3().subVectors(b, a), mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(.001, v.length()), 3, 8), m);
  mesh.position.copy(a).addScaledVector(v, .5); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), v.normalize()); return mesh;
};
let PHONE_SCREEN = null;

// A figure facing -z (toward the train). pose: 'sit' | 'stand'; hands: 'lap' | 'phone' | 'pockets' | 'book'
export function person({ pose = 'sit', hands = 'lap', top, pants, skin, hair, hat = null, bag = false, longHair = false, headphones = false, scale = 1 }) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const M = { top: mat(top), pants: mat(pants, .9), skin: mat(skin, .6), hair: mat(hair, .7), shoe: mat(0xefece6, .7), sole: mat(0x2a2a2e, .9) };
  const sit = pose === 'sit';
  const hipY = sit ? .62 : .93, hipZ = sit ? .02 : 0;
  // legs
  [-1, 1].forEach(sd => {
    const hip = V(sd * .1, hipY, hipZ);
    const knee = sit ? V(sd * .12, hipY + .02, -.42) : V(sd * .1, .5, -.02);
    const ankle = sit ? V(sd * .13, .1, -.48) : V(sd * .1, .1, 0);
    body.add(limb(hip, knee, .08, M.pants), limb(knee, ankle, .062, M.pants));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.11, .09, .27), M.shoe); shoe.position.set(sd * (sit ? .13 : .1), .045, ankle.z - .07); body.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(.115, .025, .28), M.sole); sole.position.set(shoe.position.x, .012, shoe.position.z); body.add(sole);
  });
  body.add(limb(V(-.1, hipY, hipZ), V(.1, hipY, hipZ), .1, M.pants));
  // torso: a softened block, slightly leaning back when seated
  const lean = sit ? .12 : 0, chest = V(0, hipY + .34, hipZ + lean * .4), shY = hipY + .5;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .22, 6, 16), M.top); torso.scale.set(1.12, 1, .8);
  torso.position.copy(chest); torso.rotation.x = lean; body.add(torso);
  const hood = new THREE.Mesh(new THREE.TorusGeometry(.1, .04, 6, 14), M.top); hood.position.set(0, shY + .03, hipZ + lean * .6 + .02); hood.rotation.x = Math.PI / 2 - .3; body.add(hood);
  // arms
  const sh = [-1, 1].map(sd => V(sd * .235, shY - .01, hipZ + lean * .55));
  [-1, 1].forEach((sd, i) => {
    let elbow, hand;
    if (hands === 'phone' || hands === 'book') { elbow = V(sd * .2, shY - .27, hipZ - .05); hand = V(sd * .07, shY - .2, hipZ - .27); }
    else if (hands === 'pockets') { elbow = V(sd * .25, shY - .26, hipZ + .04); hand = V(sd * .17, hipY + .02, hipZ - .06); }
    else { elbow = V(sd * .22, shY - .28, hipZ - .02); hand = V(sd * .14, hipY + .1, hipZ - .3); }
    body.add(limb(sh[i], elbow, .06, M.top), limb(elbow, hand, .05, M.top));
    if (hands !== 'pockets') { const h = new THREE.Mesh(new THREE.SphereGeometry(.052, 12, 10), M.skin); h.position.copy(hand); body.add(h); } // round mitten hands
  });
  if (hands === 'phone') {
    const ph = new THREE.Mesh(new THREE.BoxGeometry(.075, .15, .012), mat(0x15161b, .3)); ph.position.set(0, shY - .17, hipZ - .3); ph.rotation.x = -.9; body.add(ph);
    PHONE_SCREEN = PHONE_SCREEN || glowMat(0x9fc4ff, .9);
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(.062, .13), PHONE_SCREEN); sc.position.set(0, shY - .165, hipZ - .307); sc.rotation.x = -.9 - Math.PI; sc.rotation.z = Math.PI; body.add(sc);
  }
  if (hands === 'book') {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(.26, .19, .03), mat(0xb8402e, .8)); bk.position.set(0, shY - .15, hipZ - .31); bk.rotation.x = -1.0; body.add(bk);
    const pg = new THREE.Mesh(new THREE.BoxGeometry(.24, .175, .032), mat(0xf3eee2, .9)); pg.position.copy(bk.position); pg.position.y += .006; pg.rotation.x = -1.0; body.add(pg);
  }
  if (bag) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(.13, .14, 4, 10), mat(bag, .85)); b.scale.set(1.15, 1, .6);
    if (sit) b.position.set(.42, .7, .02); else b.position.set(0, shY - .2, hipZ + .2);
    body.add(b);
  }
  // head on a neck pivot, so it can turn
  const head = new THREE.Group(); head.position.set(0, shY + .06, hipZ + lean * .62); head.userData.keep = true; g.add(head);
  const H = headParts(), colour = (c, hatCol) => c === 'skin' ? M.skin : c === 'hair' ? M.hair : c === 'hat' ? mat(hatCol, .9) : mat(c, c === 0xffffff ? .3 : .5);
  const put = parts => parts.forEach(([geo, m, c]) => { const mesh = new THREE.Mesh(geo, colour(c, hat)); m.decompose(mesh.position, mesh.quaternion, mesh.scale); head.add(mesh); });
  put(H.face);
  if (hat) put(H.hat); else { put(H.short); if (longHair) put(H.long); }
  if (headphones) { // a band over the top and two padded cups
    const band = new THREE.Mesh(new THREE.TorusGeometry(HEAD_R * 1.12, .015, 6, 24, Math.PI), mat(0x1d1f26, .5)); band.position.set(0, .215, .01); head.add(band);
    [-1, 1].forEach(sd => {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .05, 20), mat(0xc9272c, .45)); cup.rotation.z = Math.PI / 2; cup.position.set(sd * (HEAD_R + .02), .2, .01); head.add(cup);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, .02, 18), mat(0x1d1f26, .8)); pad.rotation.z = Math.PI / 2; pad.position.set(sd * (HEAD_R - .004), .2, .01); head.add(pad);
    });
  }
  g.scale.setScalar(scale);
  g.traverse(o => { if (o.isMesh) o.userData.cast = true; });
  return { g, head, phone: hands === 'phone', reading: hands === 'book' };
}

// The people waiting on the platform, walking by and riding past live in crowd.js. This is just you:
export function addPeople(st) {
  const FLOOR = st.FLOOR, benchZ = st.front + 5.8, people = [];
  // you, from the opening: still on the middle bench once the camera pulls away, headphones on, nodding along
  const me = person({ pose: 'sit', hands: 'phone', top: 0x2b3352, pants: 0x34405e, skin: 0xc98a64, hair: 0x16110e, headphones: true });
  me.g.position.set(0, FLOOR, benchZ); Object.assign(me, { yaw0: 0, seed: 0, look: 0, lookPitch: .3, music: true });
  st.scene.add(me.g); people.push(me); st.listener = me;
  st.people = people;
  return people;
}
export function mergePeople(st) { st.people.forEach(p => { mergeStatic(p.g); mergeStatic(p.head); }); }

// you, nodding along on the bench
export function updatePeople(st, t) {
  st.people.forEach(p => {
    if (!p.music) return;
    const beat = t * 1.68, ph = beat % 1, nod = Math.exp(-ph * 7) - .5 * Math.exp(-(1 - ph) * 9), sway = Math.sin(beat * Math.PI); // about 100 bpm
    p.head.rotation.set(-(p.lookPitch + nod * .1), sway * .1, sway * .05);
    p.g.rotation.z = sway * .012;
  });
}

/* ---------- platform things ---------- */
const BUSH = new THREE.MeshStandardMaterial({ color: 0x3c5a34, roughness: .9, flatShading: true });
export function addPlatformProps(st) {
  const s = st.scene, F = st.FLOOR, front = st.front, P = st.P, g = new THREE.Group(); s.add(g);
  const dark = mat(0x1f2a26, .55), steel = new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: .8, roughness: .35 });
  // trash and recycling bins by the lamp posts
  [-3 * P, -P, P, 3 * P].forEach((x, i) => {
    [[-.32, 0x2d4a3a], [.32, 0x274a7a]].forEach(([dx, col]) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.24, .21, .82, 14), mat(col, .7)); b.position.set(x + .9 + dx, F + .41, front + 7.4); g.add(b);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, .06, 14), dark); lid.position.set(x + .9 + dx, F + .85, front + 7.4); g.add(lid);
    });
  });
  // ticket validators: a slim post with a lit screen, where you'd tap your ticket
  [-2 * P - 2.3, -.9 * P, .9 * P, 2 * P + 2.3].forEach(x => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.16, 1.25, .12), steel); post.position.set(x, F + .62, front + 4.2); g.add(post);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.26, .3, .14), dark); head.position.set(x, F + 1.32, front + 4.2); g.add(head);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.18, .12), glowMat(0x45e08a, 1.6)); scr.position.set(x, F + 1.36, front + 4.2 - .072); scr.rotation.y = Math.PI; g.add(scr);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(.12, .07), glowMat(0xffad1f, 1.1)); pad.position.set(x, F + 1.24, front + 4.2 - .072); pad.rotation.y = Math.PI; g.add(pad);
  });
  // planters along the back of the platform
  [-3.5 * P, -2.5 * P, -1.25 * P, -.76 * P, .76 * P, 1.25 * P, 2.5 * P, 3.5 * P].forEach(x => { // kept clear of the doors
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, .5, .6), mat(0x6e675e, .95)); box.position.set(x, F + .25, front + 10.5); g.add(box);
    for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.26 + rand() * .1, 0), BUSH); b.position.set(x - .6 + k * .3, F + .62 + rand() * .08, front + 10.5); g.add(b); }
  });
  // a paved path across the station forecourt, for bikes and scooters passing by
  const pathTex = canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = '#56535a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { x.fillStyle = rand() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; x.fillRect(rand() * w, rand() * h, 2, 2); }
    x.fillStyle = 'rgba(236,230,214,.75)'; x.fillRect(0, 3, w, 3); x.fillRect(0, h - 6, w, 3);
    x.fillStyle = 'rgba(232,185,35,.7)'; x.fillRect(0, h / 2 - 1.5, w * .55, 3);
  });
  pathTex.wrapS = THREE.RepeatWrapping; pathTex.repeat.set(400 / 4, 1);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(400, 2.1), new THREE.MeshStandardMaterial({ map: pathTex, roughness: .95 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, F + .004, front + 20.2); path.userData.keep = true; s.add(path);
  // door markers painted on the platform: where each car's door will stop
  st.cars.forEach((c, i) => {
    const tex = canvasTex(256, 128, (x, w, h) => {
      x.fillStyle = 'rgba(242,239,232,.92)'; x.font = '800 54px Archivo, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(i + 1).padStart(2, '0'), w / 2, 46);
      x.beginPath(); x.moveTo(w / 2 - 40, 84); x.lineTo(w / 2 + 40, 84); x.lineTo(w / 2, 118); x.closePath(); x.fill();
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .55), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .7, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI; m.position.set(c.position.x, F + .008, front + 1.75); m.userData.noShadow = true; m.userData.keep = true; s.add(m);
  });
  g.traverse(o => { if (o.isMesh) o.userData.cast = true; });
  return g;
}

/* ---------- beyond the tracks ---------- */
function windowsTex(lit) {
  return canvasTex(128, 64, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const on = rand() < lit; x.fillStyle = on ? (rand() < .5 ? '#ffcf8a' : '#ffe2b0') : '#1a1820';
      x.fillRect(10 + c * 30, 12 + r * 28, 16, 14);
    }
  });
}
export function addBackground(st) {
  const s = st.scene, out = { cars: [], birds: null, clouds: [] };
  // houses on the hillside, catching the last light; some windows already lit
  const N = st.mobile ? 50 : 90;
  const wallGeo = new THREE.BoxGeometry(1, 1, 1), roofGeo = new THREE.CylinderGeometry(.62, .62, 1, 3, 1); roofGeo.rotateZ(Math.PI / 2); roofGeo.rotateX(Math.PI / 6);
  [.25, .55].forEach((lit, variant) => {
    const wt = windowsTex(lit);
    const wall = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ map: canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }), emissiveMap: wt, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: .95 }), N / 2);
    const roof = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), N / 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (let i = 0; i < N / 2; i++) {
      const x = -170 + rand() * 340, z = -50 - rand() * 18, y = 1.4 + (-z - 50) * .38 + rand() * 1.5;
      const w = 3 + rand() * 4, h = 2 + rand() * 1.6, d = 3 + rand() * 2, yaw = (rand() - .5) * .5;
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m.compose(V(x, y + h / 2, z), q, V(w, h, d)); wall.setMatrixAt(i, m);
      wall.setColorAt(i, c.set([0xf1e3c8, 0xe9c9a8, 0xd8a07a, 0xf4efe6, 0xc9b79a][Math.floor(rand() * 5)]));
      m.compose(V(x, y + h + .32 * d * .5, z), q, V(w * 1.04, d * .55, d * 1.05)); roof.setMatrixAt(i, m);
      roof.setColorAt(i, c.set([0x9a4a32, 0x5a4a48, 0xa85a3a, 0x6a5450][Math.floor(rand() * 4)]));
    }
    [wall, roof].forEach(o => { o.userData.noShadow = true; o.userData.keep = true; s.add(o); });
  });
  // a radio mast up on the ridge with a blinking light
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.25, 1.6, 26, 4, 6, true), new THREE.MeshBasicMaterial({ color: 0x2a2440, wireframe: true }));
  mast.position.set(64, 20, -118); mast.userData.noShadow = true; s.add(mast);
  out.beacon = glowMat(0xff3a2a, 3); const bc = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 8), out.beacon); bc.position.set(64, 33.4, -118); bc.userData.noShadow = true; s.add(bc);
  // a frontage road behind the fence, with a few cars heading home
  const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 4.2), new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: .95 }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, .01, -10.6); road.userData.noShadow = true; s.add(road);
  const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, .12), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: .8 }), 100), dm = new THREE.Matrix4();
  for (let i = 0; i < 100; i++) { dm.makeRotationX(-Math.PI / 2).setPosition(-200 + i * 4, .02, -10.6); dash.setMatrixAt(i, dm); }
  dash.userData.noShadow = true; s.add(dash);
  const carN = st.mobile ? 4 : 7;
  const bodyGeo = new THREE.BoxGeometry(4.2, .7, 1.8); bodyGeo.translate(0, .55, 0);
  const cabGeo = new THREE.BoxGeometry(2.3, .55, 1.6); cabGeo.translate(-.25, 1.17, 0);
  const headGeo = new THREE.BoxGeometry(.04, .14, 1.4); headGeo.translate(2.11, .66, 0);
  const tailGeo = new THREE.BoxGeometry(.04, .12, 1.5); tailGeo.translate(-2.11, .7, 0);
  const mk = (geo, material) => { const m = new THREE.InstancedMesh(geo, material, carN); m.userData.noShadow = true; m.userData.keep = true; m.frustumCulled = false; s.add(m); return m; };
  out.carMeshes = [mk(bodyGeo, new THREE.MeshStandardMaterial({ roughness: .35, metalness: .4 })), mk(cabGeo, new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: .15, metalness: .2 })), mk(headGeo, glowMat(0xfff2d8, 2.2)), mk(tailGeo, glowMat(0xff2a2a, 2.2))];
  const cc = new THREE.Color();
  for (let i = 0; i < carN; i++) {
    const dir = i % 2 ? -1 : 1; out.cars.push({ x: -120 + rand() * 240, dir, lane: dir > 0 ? -9.6 : -11.6, v: 9 + rand() * 6 });
    out.carMeshes[0].setColorAt(i, cc.set([0xd9d6d0, 0x2a2d35, 0x8a1f24, 0x3a4a6a, 0x9aa0a8, 0xe8e4da, 0x4a5a48][i % 7]));
  }
  // soft clouds lit from below by the sunset
  const cloudTex = canvasTex(256, 128, (x, w, h) => {
    for (let k = 0; k < 14; k++) {
      const cx = 40 + rand() * 176, cy = 60 + (rand() - .5) * 34, r = 18 + rand() * 30, gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
    }
  });
  [[-140, 62, -300, 1], [-30, 80, -330, .8], [90, 58, -290, 1.1], [200, 74, -320, .9], [20, 44, -260, .7], [-230, 50, -280, .9]].forEach(([x, y, z, k], i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(140 * k, 44 * k), new THREE.MeshBasicMaterial({ map: cloudTex, color: i % 2 ? 0xffc3a0 : 0xe8b0c0, transparent: true, depthWrite: false, fog: false, opacity: .75 }));
    m.position.set(x, y, z); m.userData.noShadow = true; m.userData.keep = true; s.add(m); out.clouds.push({ m, x0: x, v: .4 + rand() * .5 });
  });
  // a flock of birds crossing the sky
  const bird = new THREE.BufferGeometry();
  bird.setAttribute('position', new THREE.Float32BufferAttribute([-.9, .25, 0, 0, 0, 0, 0, 0, .25, 0, 0, 0, .9, .25, 0, 0, 0, .25], 3));
  bird.computeVertexNormals();
  out.birds = new THREE.InstancedMesh(bird, new THREE.MeshBasicMaterial({ color: 0x2a2236, side: THREE.DoubleSide }), 11);
  out.birds.frustumCulled = false; out.birds.userData.noShadow = true; out.birds.userData.keep = true; s.add(out.birds);
  out.flock = Array.from({ length: 11 }, (_, i) => ({ dx: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.6 + rand(), dy: -Math.ceil(i / 2) * .9 + rand() * .5, dz: rand() * 3, ph: rand() * 6 }));
  st.bg = out;
  return out;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
export function updateBackground(st, t, dt) {
  const b = st.bg; if (!b) return;
  b.cars.forEach((c, i) => {
    c.x += c.dir * c.v * dt; if (c.x > 130) c.x -= 260; if (c.x < -130) c.x += 260;
    _q.setFromAxisAngle(_up, c.dir > 0 ? 0 : Math.PI); _m.compose(_p.set(c.x, 0, c.lane), _q, _s);
    b.carMeshes.forEach(m => m.setMatrixAt(i, _m));
  });
  b.carMeshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  b.beacon.color.setRGB(Math.sin(t * 2.4) > .6 ? 3 : .25, .2, .15);
  b.clouds.forEach(c => { c.m.position.x = c.x0 + ((t * c.v + 300) % 600) - 300; });
  // the flock loops across the sky every 70 seconds
  const u = (t % 70) / 70, cx = -170 + u * 340, cy = 26 + Math.sin(u * 6.28) * 4, cz = -70;
  b.flock.forEach((f, i) => {
    const flap = .35 + .65 * Math.abs(Math.sin(t * 7 + f.ph));
    _q.setFromAxisAngle(_up, Math.PI / 2); _m.compose(_p.set(cx + f.dx * 1.2, cy + f.dy, cz + f.dz), _q, _s.set(1, flap, 1));
    b.birds.setMatrixAt(i, _m);
  });
  _s.set(1, 1, 1); b.birds.instanceMatrix.needsUpdate = true;
}
