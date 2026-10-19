// Spirit Points with sample scores (the sandbox can't reach the Google Sheet): the cache is seeded, the ride skipped
// (a reload in the same session), and the board must come up at both sizes. Includes a tie for first, to check the
// status line. `node tools/audit/points.mjs` (about 3 minutes).
import { launch, page, SITE, SIZES, shot, log } from './lib.mjs';
const b = await launch();
for (const [size, wh] of Object.entries(SIZES)) {
  const p = await page(b, wh);
  await p.addInitScript(() => { const t = Date.now(); localStorage.setItem('spirit-cache-1cFKxVMGLDuZeS974UUVzH-Oa57sHUe9tHMFCUkwM0r0', JSON.stringify({ at: t, entries: [
    { row: 2, challenge: 'Spirit Week: Pajama Day', t: t - 9 * 864e5, points: { sr: 40, jr: 25, so: 30, fr: 10 } },
    { row: 3, challenge: 'Homecoming Rally', t: t - 4 * 864e5, points: { sr: 60, jr: 80, so: 45, fr: 50 } },
    { row: 4, challenge: 'Canned Food Drive', t: t - 864e5, points: { sr: 20, jr: 15, so: 35, fr: 30 } }] })); sessionStorage.setItem('spirit-rode', '1'); localStorage.setItem('spirit-sound', 'off'); });
  await p.goto(SITE + '/points/');
  const t0 = Date.now(); await p.waitForFunction(() => document.body.classList.contains('boarded') || document.body.classList.contains('static'), null, { timeout: 180000, polling: 1000 }).catch(() => {});
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => ({ cls: document.body.className, status: (document.querySelector('.bboard .status') || {}).textContent, rows: document.querySelectorAll('#standings .row').length }));
  log(size, `${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(r), '(expect "Seniors and Juniors tied at 120", 4 rows)', await shot(p, 'points-' + size));
  if (p.errors.length) log('  errors:', p.errors.join(' | '));
  await p.context().close();
}
await b.close();
