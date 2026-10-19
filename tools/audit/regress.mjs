// The main journeys, end to end, as a first visit of the day: the ticket ("Board without sound"), the whole opening, then
// every car (Photo Gallery, Weekly Newsletter, Events, Meet the Cabinet) and the officer's billboard (Escape back after each). Screenshots of each arrival.
// `node tools/audit/regress.mjs` (about 25 minutes). Ends with "errors: none" or the errors.
import { launch, page, hub, stepClock, shot, log } from './lib.mjs';
const b = await launch(), p = await page(b, [1100, 700]); await hub(p, { first: true });
await p.waitForFunction(() => window.__st && window.__st.warmed, null, { timeout: 400000, polling: 1000 });
log('board button:', await p.evaluate(() => { const b = [...document.querySelectorAll('#loader button')].find(x => /without/i.test(x.textContent)); if (b) b.click(); return b && b.textContent; }));
await stepClock(p);
await p.waitForFunction(() => document.body.classList.contains('entered') && window.__st.doors.every(d => d.open > .9), null, { timeout: 600000, polling: 1000 });
log('opening done', await shot(p, 'regress-platform'));
for (const [what, i] of [['gallery', 0], ['newsletter', 1], ['events', 2], ['cabinet', 3], ['officer', -1]]) { // (a departures row, or the officer)
  await p.evaluate(i => (i < 0 ? document.getElementById('cop-tag') : document.querySelectorAll('#rows .row')[i]).click(), i); // (functions reach the page without their closures: pass the index)
  await p.waitForFunction(() => document.body.classList.contains('visiting') || document.body.classList.contains('onboard'), null, { timeout: 300000, polling: 500 });
  log(what, 'arrived', await shot(p, 'regress-' + what));
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.body.classList.contains('boarding'), null, { timeout: 300000, polling: 500 });
  await p.waitForTimeout(1500);
}
log('errors:', p.errors.length ? p.errors.join(' | ') : 'none');
await b.close();
