// Flicker hunt (z-fighting): in each car (and the passage beside it), faces on the same axis-aligned plane, facing the
// same way, overlapping. Two such faces swap as the camera moves: "colours switching, layers switching".
// FIGHTING (listed): exactly coplanar (SAME) or under 1 mm apart: these flicker wherever they can be seen.
// CLOSE (counted; VERBOSE=1 lists them): 1-6 mm apart: the depth buffer separates them up close, but this site has seen
// trim flicker at 2-4 mm, so look at any big or far-seen one.
// What should be left in FIGHTING: hidden pairs (undersides, insides of seat boxes and the gangway, pole caps on floors).
// Check each line at the spot it names (car-local x, y, z) in a walk-through shot. `node tools/audit/coplanar.mjs` (~5 min).
import { launch, page, hub, log } from './lib.mjs';
const b = await launch(), p = await page(b, [800, 500]); await hub(p);
const out = await p.evaluate(async verbose => {
  const THREE = await import('three'), s = window.__st, res = [], pitch = s.cars[1].position.x - s.cars[0].position.x;
  s.train.updateMatrixWorld(true);
  s.cars.forEach((car, ci) => {
    const inv = car.matrixWorld.clone().invert(), tris = [], v = [0, 1, 2].map(() => new THREE.Vector3());
    const roots = [car, ...s.train.children.filter(o => !s.cars.includes(o) && Math.abs(o.position.x - car.position.x - pitch / 2) < .5)]; // (+ the passage after it)
    roots.forEach(root => root.traverse(o => {
      if (!o.isMesh || !o.visible || o.isSkinnedMesh) return;
      const g = o.geometry, P = g.attributes.position, C = g.attributes.color, I = g.index, m = inv.clone().multiply(o.matrixWorld), n = I ? I.count : P.count;
      const name = (o.material.type || '').replace('Material', '') + (o.material.transparent ? 'T' : '') + (o.material.color ? '#' + o.material.color.getHexString() : '');
      for (let k = 0; k < n; k += 3) {
        const ids = [0, 1, 2].map(j => I ? I.getX(k + j) : k + j); ids.forEach((id, j) => v[j].fromBufferAttribute(P, id).applyMatrix4(m));
        const nn = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])); if (nn.length() < 2e-6) continue; nn.normalize();
        const ax = [Math.abs(nn.x), Math.abs(nn.y), Math.abs(nn.z)], a = ax.indexOf(Math.max(...ax)); if (ax[a] < .9999) continue;
        const col = C ? [0, 1, 2].map(c => C.getComponent(ids[0], c).toFixed(2)).join('/') : '';
        tris.push({ a, sgn: nn.getComponent(a) > 0 ? '+' : '-', d: v[0].getComponent(a), p2: v.map(q => [q.getComponent((a + 1) % 3), q.getComponent((a + 2) % 3)]), mesh: o.uuid.slice(0, 4) + ':' + name, col, at: v[0].toArray().map(x => x.toFixed(2)).join(',') });
      }
    }));
    const inside = (pt, t) => { const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]); const d1 = s(pt, t[0], t[1]), d2 = s(pt, t[1], t[2]), d3 = s(pt, t[2], t[0]); return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9)); };
    const samp = t => { const c = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3]; return [c, ...t.map(q => [c[0] + (q[0] - c[0]) * .8, c[1] + (q[1] - c[1]) * .8])]; };
    const found = new Map(), buckets = {};
    tris.forEach(t => (buckets[t.a + t.sgn] = buckets[t.a + t.sgn] || []).push(t));
    Object.entries(buckets).forEach(([key, ts]) => {
      ts.sort((x, y) => x.d - y.d);
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length && ts[j].d - ts[i].d < .006; j++) {
        const A = ts[i], B = ts[j]; if (A.mesh === B.mesh && A.col === B.col && Math.abs(A.d - B.d) < 1e-5) continue; // (one surface split in two)
        if (!(samp(A.p2).some(q => inside(q, B.p2)) || samp(B.p2).some(q => inside(q, A.p2)))) continue;
        const gap = Math.abs(A.d - B.d), k = 'xyz'[A.a] + A.sgn + ' ' + (gap < 1e-4 ? 'SAME' : 'gap' + (gap * 1000).toFixed(1) + 'mm') + ' at ' + 'xyz'[A.a] + '=' + A.d.toFixed(3) + '  ' + [A.mesh, B.mesh].sort().join(' vs ');
        if (!found.has(k)) found.set(k, { n: 0, at: A.at }); found.get(k).n++;
      }
    });
    const all = [...found].sort(), fight = all.filter(([k]) => / SAME | gap0\./.test(k)), close = all.filter(x => !fight.includes(x));
    res.push(`car ${ci} (${tris.length} axis-aligned triangles): ${fight.length} FIGHTING, ${close.length} close`);
    fight.forEach(([k, v]) => res.push(`  ${k}  x${v.n}  e.g. at (${v.at})`));
    if (verbose) close.forEach(([k, v]) => res.push(`  (close) ${k}  x${v.n}  e.g. at (${v.at})`));
  });
  return res;
}, !!process.env.VERBOSE);
log(out.join('\n'));
if (p.errors.length) log('errors:', p.errors.join(' | '));
await b.close();
