import * as THREE from 'three';
import { TOY, CAR_L, W, H, FLOOR, DOOR_W, DOOR_H, bodyGeometry, capGeometry, noseGeometry, paintBody, paintNose, windowTexture, windowSlots } from './train.js';
import { mergeStatic } from './scenery.js';

// The Spirit Line seen from a distance (the Spirit Points ride, and the ride on the Events car's screen): the same body,
// paint and nose as the platform's train, but with the windows painted on, the doors shut and each car one draw call or so.

// a dot-matrix LED destination sign, drawn into a canvas
export function drawLED(ctx, lines) {
  const cv = ctx.canvas, CW = 160, CH = 32, P = 4, s = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  s.canvas.width = CW; s.canvas.height = CH; s.fillStyle = '#fff'; s.textAlign = 'center'; s.textBaseline = 'middle';
  lines.forEach((t, i) => { s.font = `bold ${i ? 10 : 13}px "DotGothic16", monospace`; s.fillText(t, CW / 2, i ? 24 : 10); });
  const d = s.getImageData(0, 0, CW, CH).data; ctx.fillStyle = '#07070a'; ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const on = d[(y * CW + x) * 4 + 3] > 110; ctx.fillStyle = on ? '#ffad1f' : '#2b1a05'; ctx.beginPath(); ctx.arc(x * P + P / 2, y * P + P / 2, on ? 1.7 : 1.2, 0, 7); ctx.fill(); }
}

// `count` cars (groups, each centred on its car, nose toward -x on the first), the destination on the front's LED sign
export function rideTrain(logo, { count = 4, led = ['SPIRIT LINE', 'EXPRESS'] } = {}) {
  const paint = paintBody(logo), body = TOY ? new THREE.MeshStandardMaterial({ map: paint.map, roughness: .8, metalness: 0, envMapIntensity: .45 }) // the toy look, matte like the platform's train
    : new THREE.MeshPhysicalMaterial({ map: paint.map, roughnessMap: paint.mr, metalnessMap: paint.mr, roughness: 1, metalness: 1, clearcoat: .35, clearcoatRoughness: .25 });
  const capM = new THREE.MeshStandardMaterial({ color: 0xaeb3bb, metalness: .7, roughness: .4 }), roofM = new THREE.MeshStandardMaterial({ color: 0x8f949c, metalness: .6, roughness: .5 }), under = new THREE.MeshStandardMaterial({ color: 0x24272e, metalness: .5, roughness: .7 });
  const winT = windowTexture(), winM = new THREE.MeshPhysicalMaterial({ map: winT, emissiveMap: winT, emissive: 0xffffff, emissiveIntensity: .45, roughness: .12, clearcoat: .6, alphaTest: .5 });
  const shell = bodyGeometry(), cap = capGeometry(), cars = [];
  for (let i = 0; i < count; i++) {
    const car = new THREE.Group();
    const b = new THREE.Mesh(shell, body); b.userData.cast = true; car.add(b);
    [-1, 1].forEach(sd => { const c = new THREE.Mesh(cap, capM); c.rotation.y = sd * Math.PI / 2; c.position.x = sd * CAR_L / 2; car.add(c); });
    [-2, 2].forEach(x => { const ac = new THREE.Mesh(new THREE.BoxGeometry(1.5, .32, 1.5), roofM); ac.position.set(x, H + .18, 0); car.add(ac); });
    const door = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + .06, DOOR_H + .04, .06), capM); door.position.set(0, FLOOR + DOOR_H / 2, W / 2 + .01); car.add(door); // doors shut for the ride
    [-1, 1].forEach(x => { const bg = new THREE.Mesh(new THREE.BoxGeometry(2.3, .4, W - .5), under); bg.position.set(x * (CAR_L / 2 - 1.25), .32, 0); car.add(bg); });
    [1, -1].forEach(side => windowSlots().forEach(w => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.h), winM); p.position.set(w.x, w.y, side * (W / 2 + .014)); if (side < 0) p.rotation.y = Math.PI; car.add(p); }));
    if (i === 0) {
      const nose = new THREE.Mesh(noseGeometry(), new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, emissive: 0xffffff, emissiveIntensity: 2 }));
      const pn = paintNose(logo, ctx => drawLED(ctx, led)); Object.assign(nose.material, { map: pn.map, emissiveMap: pn.glow, roughnessMap: pn.mr });
      nose.position.x = -CAR_L / 2; nose.userData.cast = true; car.add(nose);
    }
    mergeStatic(car); cars.push(car);
  }
  return cars;
}
