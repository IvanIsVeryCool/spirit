import * as THREE from 'three';
import { Person, seatAt } from './people.js';

// People waiting on the platform, the town on the hills, traffic behind the fence, clouds, birds,
// and the small things a real platform has. Everything here is cheap: shared materials,
// merged or instanced geometry, no new lights.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const glowMat = (hex, k) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }); m.toneMapped = false; return m; };
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const mats = {}, mat = (hex, rough = .85) => mats[hex + '_' + rough] || (mats[hex + '_' + rough] = new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
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

/* ---------- you ----------
   You, from the opening: still on the middle bench once the camera pulls away, red headphones on, nodding along.
   One of Kenney's Mini Characters (people.js) like everyone else; the crowd lives in crowd.js. */
export function addPeople(st) {
  const me = new Person(0), H = me.bones.head; // model units here: the head is about .45 wide, its centre .17 above the neck
  const seat = seatAt(0, st.FLOOR + .52, st.front + 5.8 + .21); me.root.position.set(0, seat.y, seat.z); me.pose('sit', { fade: 0 });
  const band = new THREE.Mesh(new THREE.TorusGeometry(.25, .018, 8, 28, Math.PI), mat(0x1d1f26, .5)); band.position.set(0, .17, 0); H.add(band);
  [-1, 1].forEach(sd => {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .06, 20), mat(0xc9272c, .45)); cup.rotation.z = Math.PI / 2; cup.position.set(sd * .245, .15, 0); H.add(cup);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .02, 18), mat(0x1d1f26, .8)); pad.rotation.z = Math.PI / 2; pad.position.set(sd * .27, .15, 0); H.add(pad);
  });
  H.traverse(o => { if (o.isMesh) { o.userData.cast = true; o.userData.keep = true; } });
  st.scene.add(me.root); st.listener = me;
  return me;
}
// you nod on the beat (about 100 bpm) and sway every two
export function updatePeople(st, t, dt) {
  const me = st.listener; if (!me) return;
  const beat = t * 1.68, ph = beat % 1, nod = Math.exp(-ph * 7) - .5 * Math.exp(-(1 - ph) * 9), sway = Math.sin(beat * Math.PI);
  Object.assign(me.look, { pitch: .1 + nod * .1, yaw: sway * .1, roll: sway * .05 });
  me.root.rotation.z = sway * .012; me.update(dt);
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
