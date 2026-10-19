// The static version (reduced motion, or no WebGL: body.static): no 3D, the title, the departures board (names must fit),
// a Leaderboard button to /points/, no Drive plate, no sideways scrolling. `node tools/audit/static-version.mjs` (1 minute).
import { launch, page, SITE, SIZES, shot, log } from './lib.mjs';
const b = await launch();
for (const [size, wh] of Object.entries(SIZES)) {
  const p = await page(b, wh, { reducedMotion: 'reduce' }); await p.goto(SITE + '/'); await p.waitForTimeout(6000);
  const r = await p.evaluate(() => {
    const vis = e => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
    const clipped = [...document.querySelectorAll('#rows .row > *')].filter(c => c.scrollWidth > c.clientWidth + 1).length; // (the cells clip, not the rows)
    return { static: document.body.classList.contains('static'), overflowPx: document.documentElement.scrollWidth - innerWidth, leaderboard: vis(document.getElementById('cop-tag')), drive: vis(document.getElementById('drive-tag')), clippedRows: clipped };
  });
  const ok = r.static && r.overflowPx <= 0 && r.leaderboard && !r.drive && !r.clippedRows;
  log(size, ok ? 'ok' : 'PROBLEM', JSON.stringify(r), await shot(p, 'static-' + size));
  if (p.errors.length) log('  errors:', p.errors.join(' | '));
  await p.context().close();
}
await b.close();
