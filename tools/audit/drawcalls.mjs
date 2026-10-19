// Draw calls and triangles for one whole frame (shadow pass and bloom included), on the platform, in the driver's seat and
// inside a car, desktop and phone. renderer.info resets every render() by default, so a plain read only shows the last
// post-processing pass: autoReset is turned off around one render. `node tools/audit/drawcalls.mjs` (about 15 minutes).
import { launch, page, hub, seat, stepClock, standAt, SIZES, log } from './lib.mjs';
const b = await launch();
for (const [size, wh] of Object.entries(SIZES)) {
  const p = await page(b, wh); await hub(p);
  const count = () => p.evaluate(() => { const s = window.__st, i = s.renderer.info; i.autoReset = false; i.reset(); s.render(); const r = { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs.length }; i.autoReset = true; return r; });
  log(size, 'platform', JSON.stringify(await count()));
  await stepClock(p); await seat(p); log(size, 'cab     ', JSON.stringify(await count()));
  await standAt(p, [1, 1.6, -.3, 0, 0]); log(size, 'inside  ', JSON.stringify(await count()));
  if (p.errors.length) log('  errors:', p.errors.join(' | '));
  await p.context().close();
}
await b.close();
