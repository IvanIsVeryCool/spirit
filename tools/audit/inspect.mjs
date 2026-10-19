// What's under a point on the screen: stand at a spot in the train (as in spots.json: car, x from its centre, z, yaw,
// pitch, deck?) and cast rays through screen points (-1..1, 0,0 the middle), listing the first three things each hits
// (distance, the object's path, material colour, vertex colour, face normal, the point). For "what is that brown band /
// dark block / flickering strip?". Also saves a screenshot.
// `node tools/audit/inspect.mjs '[1,-3.2,-0.2,3.1416,0.05]' '[[0,0],[-0.3,-0.1]]'`
import { launch, page, hub, seat, stepClock, noTransitions, standAt, shot, log } from './lib.mjs';
const spot = JSON.parse(process.argv[2]), pts = JSON.parse(process.argv[3] || '[[0,0]]');
const b = await launch(), p = await page(b, [1280, 800]); await hub(p); await noTransitions(p); await stepClock(p); await seat(p);
log('floor', await standAt(p, spot));
log(await p.evaluate(async pts => {
  const THREE = await import('three'), s = window.__st, rc = new THREE.Raycaster();
  return pts.map(([u, v]) => { rc.setFromCamera(new THREE.Vector2(u, v), s.camera);
    return `${u},${v}: ` + rc.intersectObjects(s.scene.children, true).filter(h => h.object.visible).slice(0, 3).map(h => {
      const m = Array.isArray(h.object.material) ? h.object.material[0] : h.object.material, path = []; let n = h.object;
      while (n && n !== s.scene && path.length < 4) { path.push(n.name || n.type); n = n.parent; }
      const C = h.object.geometry.attributes.color, vc = C && h.face ? [C.getX(h.face.a), C.getY(h.face.a), C.getZ(h.face.a)].map(x => x.toFixed(2)).join('/') : '';
      return `${h.distance.toFixed(2)}m ${path.join('<')} ${m.type}${m.color ? ' #' + m.color.getHexString() : ''}${vc ? ' vc ' + vc : ''} n ${h.face ? h.face.normal.toArray().map(x => x.toFixed(1)).join(',') : ''} at ${h.point.toArray().map(x => x.toFixed(2)).join(',')}`;
    }).join('  |  '); }).join('\n');
}, pts));
log(await shot(p, 'inspect'));
await b.close();
