import * as THREE from 'three';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import { mergeStatic } from './scenery.js';
import { mergeGeometries } from '/vendor/jsm/utils/BufferGeometryUtils.js';

// The town behind the station, from Kenney's kits (all CC0):
// "City Kit Industrial" (assets/city): factories and warehouses past the road, chimneys, tanks, water towers,
//   shipping containers by the tracks, and wind turbines turning on the hills;
// "Nature Kit" (assets/nature): the trees, palms and roadside bushes;
// "City Kit Commercial" (assets/commercial): a row of shops across the road and a hazy downtown skyline;
// "Car Kit" (assets/cars): the traffic on the frontage road.

const NAMES = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n', 'building-o', 'building-p', 'building-q', 'building-r', 'building-s', 'building-t',
  'chimney-large', 'chimney-medium', 'detail-tank-large', 'detail-tank', 'shipping-container-a', 'shipping-container-b', 'shipping-container-c', 'water-tower', 'windmill', 'solar-panel-landscape-group'];
const TREES = ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_tall', 'tree_cone'], PALMS = ['tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall'], BUSHES = ['plant_bushLarge', 'plant_bushDetailed', 'plant_bush'];
const SHOPS = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h'], TOWERS = ['building-skyscraper-a', 'building-skyscraper-b', 'building-skyscraper-c', 'building-skyscraper-d', 'building-skyscraper-e'];
export const LOW = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'wide-a', 'wide-b'].map(k => 'low-detail-building-' + k);
export { SHOPS };
const CARS = ['sedan', 'suv', 'taxi', 'van', 'delivery', 'truck', 'hatchback-sports', 'suv-luxury'];
// one kit: its models, every mesh sharing one material per material name (so merging joins them into a few draw calls)
export async function loadKit(loader, dir, names, tune) {
  const list = await Promise.all(names.map(n => loader.loadAsync(`/assets/${dir}/${n}.glb`))), shared = {}, out = {};
  list.forEach((g, i) => {
    g.scene.traverse(o => { if (!o.isMesh) return; const k = o.material.name; if (!shared[k]) { shared[k] = o.material; tune(o.material); } o.material = shared[k]; });
    out[names[i]] = g.scene; g.scene.userData.size = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
  });
  return out;
}
const tuneTown = m => { m.roughness = .85; m.metalness = 0; m.envMapIntensity = .35; m.color.setScalar(.8); };
// The commercial kit, on its own: the towns along the Spirit Points ride use it too
let TOWN = null;
export const loadTown = () => TOWN || (TOWN = loadKit(new GLTFLoader(), 'commercial', [...SHOPS, ...LOW], tuneTown));
// A copy of the kit's material with its windows lit for the evening: the kit is one palette texture, and the
// windows are its pale blue glass swatch (columns 10-11 of 16, row 2 of 4), so only that swatch glows, warm.
export function townMaterial(base, glow = .7) {
  const m = base.clone(), img = base.map.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, h * .25, 0, h * .5); g.addColorStop(0, '#ffd9a0'); g.addColorStop(1, '#f2a860');
  x.fillStyle = g; x.fillRect(w * 10 / 16, h * .25, w * 2 / 16, h * .25);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = base.map.flipY;
  m.emissiveMap = t; m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = glow; return m;
}
// one model as a single geometry (position, normal, uv), for instancing
export function modelGeometry(obj) {
  obj.updateMatrixWorld(true); const list = [];
  obj.traverse(o => { if (!o.isMesh) return; const g = new THREE.BufferGeometry(), src = o.geometry; ['position', 'normal', 'uv'].forEach(k => g.setAttribute(k, src.attributes[k].clone())); if (src.index) g.setIndex(src.index); list.push(g.applyMatrix4(o.matrixWorld)); });
  return mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g));
}
const NATURE_COL = { leafsGreen: 0x2f5233, woodBark: 0x5a4030, grass: 0x3c5e38, _defaultMat: 0x5a4030 }; // deep evening greens, to sit in the golden-hour light
let LIB = null, KIT = null;
export async function loadCity() {
  if (LIB) return LIB;
  const loader = new GLTFLoader(), kits = Promise.all([
    loadKit(loader, 'nature', [...TREES, ...PALMS, ...BUSHES], m => { m.color.set(NATURE_COL[m.name] ?? 0x6a4c36); m.roughness = .95; m.metalness = 0; m.envMapIntensity = .3; }),
    loadKit(loader, 'commercial', [...SHOPS, ...TOWERS, ...LOW], tuneTown),
    loadKit(loader, 'cars', CARS, m => { m.roughness = .45; m.metalness = .15; m.envMapIntensity = .6; })
  ]);
  const list = await Promise.all(NAMES.map(n => loader.loadAsync(`/assets/city/${n}.glb`)));
  const [nature, shops, cars] = await kits; KIT = { nature, shops, cars };
  const shared = {}; // every model uses the same two materials; share them so merging can join everything into a couple of draw calls
  LIB = {};
  list.forEach((g, i) => {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const k = o.material.name; if (!shared[k]) { shared[k] = o.material; o.material.roughness = .9; o.material.metalness = 0; o.material.envMapIntensity = .35; o.material.color.setScalar(.78); }
      o.material = shared[k];
    });
    LIB[NAMES[i]] = g.scene;
  });
  return LIB;
}

let seed = 41; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export function addCity(st) {
  if (!LIB) return null;
  const s = st.scene, g = new THREE.Group(); s.add(g);
  const put = (name, x, z, yaw, k, y = 0) => { const o = LIB[name].clone(); o.position.set(x, y, z); o.rotation.y = yaw; o.scale.setScalar(k); g.add(o); return o; };
  const buildings = NAMES.filter(n => n.startsWith('building'));
  // factories in two loose rows past the road, facing the station, with gaps for the trees
  for (let row = 0; row < 2; row++) {
    for (let x = -96 + rnd() * 6; x < 96; x += 15 + rnd() * 9) {
      const z = row ? -34 - rnd() * 5 : -21 - rnd() * 3, k = row ? 5.6 + rnd() * 1.2 : 4.4 + rnd() * 1;
      put(buildings[Math.floor(rnd() * buildings.length)], x, z, (rnd() < .5 ? 0 : Math.PI) + (rnd() - .5) * .08, k);
      if (rnd() < .3) put(rnd() < .5 ? 'chimney-medium' : 'chimney-large', x + 7 + rnd() * 2, z - 4, 0, k * .9);
      if (rnd() < .25) put(rnd() < .5 ? 'detail-tank-large' : 'detail-tank', x - 8, z + 2, rnd() * 6, k * .8);
    }
  }
  put('water-tower', 22, -29, .3, 5); put('water-tower', -58, -30, -.2, 4.6);
  // a stack of shipping containers in a yard by the far track
  [[-30, -14.2, 0, 'a'], [-26.6, -14.2, 0, 'b'], [-28.3, -14.2, 1, 'c'], [38, -14.6, 0, 'c'], [41.4, -14.6, 0, 'a']].forEach(([x, z, lvl, v]) => put('shipping-container-' + v, x, z, Math.PI / 2, 3.6, lvl * 1.29 * 3.6));
  put('solar-panel-landscape-group', 60, -22, 0, 6); put('solar-panel-landscape-group', 68, -22, 0, 6);
  g.traverse(o => { if (o.isMesh) { o.userData.cast = true; } });
  // a row of shops across the road, facing the station
  const kput = (lib, name, x, z, yaw, k, y = 0) => { const o = lib[name].clone(); o.position.set(x, y, z); o.rotation.y = yaw; o.scale.setScalar(k); g.add(o); return o; };
  const lots = [];
  [[-104, -38], [76, 112]].forEach(([x0, x1]) => {
    for (let x = x0; x < x1;) {
      const name = SHOPS[Math.floor(rnd() * SHOPS.length)], k = 7.5 + rnd() * 1.5, sz = KIT.shops[name].userData.size, w = sz.x * k, d = sz.z * k;
      if (x + w > x1) break;
      kput(KIT.shops, name, x + w / 2, -15.6 - d / 2, 0, k); lots.push([x - 1, x + w + 1, -15.6 - d - 1]);
      x += w + .6 + rnd() * 2.5;
    }
  });
  // trees in the gaps (not inside the shops), a few palms, and bushes along the far verge of the road
  const free = (x, z) => !lots.some(([a, b, zb]) => x > a && x < b && z < -14.5 && z > zb);
  for (let n = st.mobile ? 40 : 80, i = 0; i < n * 3 && n > 0; i++) {
    const x = -90 + rnd() * 180, z = -13.5 - rnd() * 22; if (!free(x, z)) continue;
    const name = TREES[Math.floor(rnd() * TREES.length)], h = 4.5 + rnd() * 4;
    kput(KIT.nature, name, x, z, rnd() * 6.28, h / KIT.nature[name].userData.size.y); n--;
  }
  [[-26, -13.4], [10, -14.6], [31, -13.2], [-48, -17.5], [57, -13.6], [-70, -14]].forEach(([x, z], i) => { const name = PALMS[i % PALMS.length], h = 8.5 + rnd() * 2; kput(KIT.nature, name, x, z, rnd() * 6.28, h / KIT.nature[name].userData.size.y); });
  for (let x = -110; x < 110; x += 2.5 + rnd() * 5) { if (!free(x, -13.4)) continue; const name = BUSHES[Math.floor(rnd() * BUSHES.length)]; kput(KIT.nature, name, x, -13.2 - rnd() * .5, rnd() * 6.28, (1 + rnd() * .6) / KIT.nature[name].userData.size.y); }
  // the hillside town (where scenery.js put its simple houses): low-rise shops and blocks from the commercial kit, windows lit
  if (st.bg && st.bg.houses) {
    st.bg.houses.forEach(o => o.parent && o.parent.remove(o));
    const hill = new THREE.Group(); s.add(hill);
    const lit = townMaterial(KIT.shops[SHOPS[0]].getObjectByProperty('isMesh', true).material, .9); lit.color.setRGB(.74, .6, .54); // warmed by the low sun, like the old houses
    for (let i = 0, n = st.mobile ? 50 : 90; i < n; i++) {
      const x = -170 + rnd() * 340, z = -50 - rnd() * 18, y = 1.4 + (-z - 50) * .38 + rnd() * 1.5, yaw = (rnd() - .5) * .5 + (rnd() < .5 ? 0 : Math.PI);
      let o;
      if (rnd() < .35) { const name = SHOPS[Math.floor(rnd() * SHOPS.length)]; o = kput(KIT.shops, name, x, z, yaw, 4.5 + rnd() * 1.5, y - 1); }
      else { const name = LOW[Math.floor(rnd() * LOW.length)], sz = KIT.shops[name].userData.size; o = kput(KIT.shops, name, x, z, yaw, 1, y - 1); o.scale.set((4 + rnd() * 3) / sz.x, (3 + rnd() * 4.5) / sz.y, (4 + rnd() * 2) / sz.z); }
      hill.attach(o); o.traverse(m => { if (m.isMesh) { m.material = lit; m.userData.noShadow = true; } });
    }
    mergeStatic(hill);
  }
  // the platform planters: Nature Kit bushes instead of the stand-in blobs (scenery.js marks them)
  const blobs = []; s.traverse(o => { if (o.userData.bush) blobs.push(o); });
  blobs.forEach((o, i) => { const name = i % 2 ? 'plant_bushDetailed' : 'plant_bushLarge', b = KIT.nature[name].clone(); b.position.copy(o.position); b.position.y -= .3; b.rotation.y = rnd() * 6.28; b.scale.setScalar(.55 / KIT.nature[name].userData.size.y); o.parent.add(b); o.parent.remove(o); });
  mergeStatic(g);
  // downtown on the horizon, between the far hills: towers and blocks in the evening haze (the fog does most of the work)
  const sky = new THREE.Group(); s.add(sky);
  const haze = KIT.shops[TOWERS[0]].getObjectByProperty('isMesh', true).material.clone(); haze.color.setRGB(.62, .58, .7); haze.envMapIntensity = .15;
  for (let x = -168; x < -84; x += 7 + rnd() * 6) {
    const tower = rnd() < .65, name = tower ? TOWERS[Math.floor(rnd() * TOWERS.length)] : LOW[Math.floor(rnd() * LOW.length)];
    const h = tower ? 30 + rnd() * 26 : 14 + rnd() * 12, o = kput(KIT.shops, name, x, -132 - rnd() * 16, (rnd() < .5 ? 0 : Math.PI / 2), h / KIT.shops[name].userData.size.y);
    sky.attach(o); o.traverse(m => { if (m.isMesh) { m.material = haze; m.userData.noShadow = true; } });
  }
  mergeStatic(sky);
  // wind turbines on the hills, their blades turning
  const blades = [];
  [[-120, -72, 13], [-92, -78, 15], [70, -74, 14], [104, -80, 16], [140, -76, 13]].forEach(([x, z, k]) => {
    const w = put('windmill', x, z, Math.PI / 2 + (rnd() - .5) * .3, k, 6 + rnd() * 3); w.userData.keep = true;
    const b = w.getObjectByName('blades'); if (b) { b.userData.spin = .6 + rnd() * .5; blades.push(b); }
    w.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  });
  return { group: g, blades, traffic: addTraffic(st) };
}
export const cityLoaded = () => !!LIB;

// the cars on the frontage road (scenery.js keeps their lanes and speeds in st.bg.cars): Kenney's cars,
// each one draw call, with their head and tail lights as two shared instanced glows
const CAR_K = 4.4 / 2.55; // a sedan is 4.4 m long
function addTraffic(st) {
  const b = st.bg; if (!b || !b.cars.length) return null;
  b.carMeshes.forEach(m => m.parent && m.parent.remove(m));
  const list = b.cars.splice(0), glow = c => { const m = new THREE.MeshBasicMaterial({ color: c }); m.toneMapped = false; return m; };
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, list.length); m.userData.noShadow = true; m.userData.keep = true; m.frustumCulled = false; st.scene.add(m); return m; };
  const lights = [mk(new THREE.BoxGeometry(.04, .12, 1), glow(new THREE.Color(0xfff2d8).multiplyScalar(2.2))), mk(new THREE.BoxGeometry(.04, .1, 1), glow(new THREE.Color(0xff2a2a).multiplyScalar(2.2)))];
  const cars = list.map((c, i) => {
    const name = CARS[i % CARS.length], o = KIT.cars[name].clone(), sz = KIT.cars[name].userData.size;
    o.scale.setScalar(CAR_K); o.traverse(m => { if (m.isMesh) m.userData.noShadow = true; });
    const holder = new THREE.Group(); holder.add(o); mergeStatic(holder); holder.userData.keep = true; st.scene.add(holder);
    return { ...c, o: holder, len: sz.z * CAR_K, wid: sz.x * CAR_K, hl: sz.y * CAR_K * .38 };
  });
  return { cars, lights };
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function updateCity(city, t, dt) {
  if (!city) return;
  city.blades.forEach(b => { b.rotation.x += b.userData.spin * dt; });
  const tr = city.traffic; if (!tr) return;
  tr.cars.forEach((c, i) => {
    c.x += c.dir * c.v * dt; if (c.x > 130) c.x -= 260; if (c.x < -130) c.x += 260;
    c.o.position.set(c.x, 0, c.lane); c.o.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; // the models face +z
    [1, -1].forEach((end, k) => { _q.setFromAxisAngle(_up, 0); _m.compose(_p.set(c.x + c.dir * end * (c.len / 2 + .01), c.hl, c.lane), _q, _s.set(1, 1, c.wid * .78)); tr.lights[k].setMatrixAt(i, _m); });
  });
  tr.lights.forEach(m => { m.instanceMatrix.needsUpdate = true; });
}
