import * as THREE from 'three';
import { library } from './people.js';

// Our own models made the way Kenney's Mini Characters are (the cassette player, the banner plane, the dog): chunky
// blocks with bevelled edges, a few flat colours, the people's shading.

// a box with bevelled edges, like the Kenney models: each edge cut by one chamfer facet of radius r
export function softBox(w, h, d, r) {
  const g = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), p = g.attributes.position, half = [w / 2, h / 2, d / 2], v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const c = [p.getX(i), p.getY(i), p.getZ(i)].map((t, k) => { const a = Math.min(1, Math.abs(t) * 2), m = a <= .5 ? a / .5 * (half[k] - r) : half[k] - r + (a - .5) / .5 * r; return Math.sign(t) * m; });
    v.set(...c); inner.set(...c.map((x, k) => Math.max(-(half[k] - r), Math.min(half[k] - r, x))));
    const dv = v.clone().sub(inner); if (dv.lengthSq() > 1e-12) v.copy(inner).addScaledVector(dv.normalize(), r);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
// a few flat colours on a tiny palette texture of their own, drawn with a clone of the Mini Characters' material (the
// same shading as the people), so our own models look like they came in the same box. paint(geo, hex) colours a part
export function toyMaterial(cols, glow = 0) {
  const c = document.createElement('canvas'); c.width = cols.length; c.height = 1; const x = c.getContext('2d');
  cols.forEach((h, i) => { x.fillStyle = h; x.fillRect(i, 0, 1, 1); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  const mat = library().material.clone(); mat.map = t; mat.emissiveMap = glow ? t : null; mat.emissive = new THREE.Color(glow, glow, glow); // (the people's own material may carry a glow; ours is set here)
  const paint = (geo, hex) => { const uv = geo.attributes.uv, u = (cols.indexOf(hex) + .5) / cols.length; for (let i = 0; i < uv.count; i++) uv.setXY(i, u, .5); return geo; };
  return { mat, paint };
}
