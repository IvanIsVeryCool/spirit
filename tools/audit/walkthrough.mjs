// First-person walk-through: from the driver's seat, stand at each spot in spots.json ([label, car, x from the car's
// centre, z, yaw, pitch, deck?]) and take a screenshot. Look at every one: dirt or noise on surfaces, anything poking
// through a wall, gaps you can see through, passengers in the aisle, flicker-prone thin trim, odd lighting.
// `node tools/audit/walkthrough.mjs [WxH] [first-label-substring]` (about 1 minute a spot). Default 1280x800.
import { readFileSync } from 'node:fs';
import { launch, page, hub, seat, stepClock, noTransitions, standAt, shot, log } from './lib.mjs';
const [W, H] = (process.argv[2] || '1280x800').split('x').map(Number), only = process.argv[3];
const spots = JSON.parse(readFileSync(new URL('./spots.json', import.meta.url))).filter(s => !only || s[0].includes(only));
const b = await launch(), p = await page(b, [W, H]); await hub(p); await noTransitions(p); await stepClock(p); await seat(p);
for (const [label, ...spot] of spots) {
  const floor = await standAt(p, spot);
  log((floor == null ? 'NO FLOOR (outside the walk map) ' : '') + label + ' -> ' + await shot(p, 'walk-' + label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()));
}
if (p.errors.length) log('errors:', p.errors.join(' | '));
await b.close();
