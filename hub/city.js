import * as THREE from 'three';
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js';
import { mergeStatic } from './scenery.js';

// PREVIEW: an industrial district behind the station, from Kenney's "City Kit Industrial" (CC0, assets/city).
// Factories and warehouses past the road, chimneys and tanks among them, a water tower, shipping containers
// by the tracks, and wind turbines turning on the hills.

const NAMES = ['building-a', 'building-b', 'building-c', 'building-d', 'building-e', 'building-f', 'building-g', 'building-h', 'building-i', 'building-j', 'building-k', 'building-l', 'building-m', 'building-n', 'building-o', 'building-p', 'building-q', 'building-r', 'building-s', 'building-t',
  'chimney-large', 'chimney-medium', 'detail-tank-large', 'detail-tank', 'shipping-container-a', 'shipping-container-b', 'shipping-container-c', 'water-tower', 'windmill', 'solar-panel-landscape-group'];
let LIB = null;
export async function loadCity() {
  if (LIB) return LIB;
  const loader = new GLTFLoader(), list = await Promise.all(NAMES.map(n => loader.loadAsync(`/assets/city/${n}.glb`)));
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
  mergeStatic(g);
  // wind turbines on the hills, their blades turning
  const blades = [];
  [[-120, -72, 13], [-92, -78, 15], [70, -74, 14], [104, -80, 16], [140, -76, 13]].forEach(([x, z, k]) => {
    const w = put('windmill', x, z, Math.PI / 2 + (rnd() - .5) * .3, k, 6 + rnd() * 3); w.userData.keep = true;
    const b = w.getObjectByName('blades'); if (b) { b.userData.spin = .6 + rnd() * .5; blades.push(b); }
    w.traverse(o => { if (o.isMesh) o.userData.noShadow = true; });
  });
  return { group: g, blades };
}
export function updateCity(city, t, dt) { if (city) city.blades.forEach(b => { b.rotation.x += b.userData.spin * dt; }); }
