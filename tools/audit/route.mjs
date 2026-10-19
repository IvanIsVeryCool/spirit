// Walk the whole train on foot, as a player would: from the driver's seat, an autopilot steers through waypoints (down
// the cab steps, through every car and passage, up the stairs and back, to the back cab) using the real walking code
// and collision. A waypoint it can't reach within ~40 frames is logged as STUCK with where it got to: a gap in the walk
// map (walkRegions() in interior.js, _walkMap() in station.js) or something in the way. `node tools/audit/route.mjs`
// (about 25 minutes). Ends with "route: clean" or the STUCK list.
import { launch, page, hub, seat, stepClock, noTransitions, shot, log } from './lib.mjs';
const b = await launch(), p = await page(b, [960, 600]); await hub(p); await noTransitions(p); await stepClock(p); await seat(p);
const route = await p.evaluate(() => {
  const c = window.__st.cars.map(c => c.position.x), pts = [];
  pts.push([c[0] - 3.85, 0, 'cab door'], [c[0] - 3.0, 0], [c[0] - 2.2, 0, 'lower saloon'], [c[0] - .9, 0], [c[0] + .3, -.6, 'vestibule']);
  c.forEach((cx, i) => {
    if (i) pts.push([cx - 3.9, 0, 'left end door ' + i], [cx - 3.0, 0], [cx - .9, 0], [cx + .2, -.6, 'vestibule ' + i]);
    if (i === 1) pts.push([cx - .95, -.8], [cx - 2.0, -.8, 'stairs'], [cx - 3.0, -.8, 'top of the stairs'], [cx - 3.0, .6, 'upper deck'], [cx - 3.0, -.8], [cx - 1.0, -.8], [cx + .2, -.6]);
    pts.push([cx + 1.3, -.75], [cx + 1.6, -.32, 'lower deck ' + i], [cx + 3.9, -.32, 'right end door ' + i]);
    if (i < c.length - 1) pts.push([cx + 4.18, -.15, 'passage ' + i]);
  });
  pts.push([c[c.length - 1] + 4.25, -.3, 'back cab']); // (the walk map stops .3 m into the cab, at 4.3)
  return pts;
});
await p.evaluate(route => {
  const s = window.__st; s.setInput = () => {}; Object.assign(window, { __route: route, __wp: 0, __stuck: 0, __log: [] });
  const r0 = s.render.bind(s);
  s.render = function () {
    const T = this.trip;
    if (T && T.drive && window.__wp < route.length) {
      if (!T.walked) this._startWalk();
      const W = T.walk, [tx, tz, name] = route[window.__wp], dx = tx - W.x, dz = tz - W.z, d = Math.hypot(dx, dz);
      if (d < .12) { if (name) window.__log.push('reached ' + name); window.__wp++; window.__stuck = 0; }
      else {
        W.yaw = Math.atan2(dz, dx); W.pitch = -.08; this.input = { f: Math.min(1, d * 2), s: 0, turn: 0, run: false };
        if (++window.__stuck > 40) { window.__log.push(`STUCK at ${W.x.toFixed(2)},${W.z.toFixed(2)} (floor ${W.floor.toFixed(2)}) heading for ${tx.toFixed(2)},${tz.toFixed(2)} ${name || ''}`); window.__wp++; window.__stuck = 0; }
      }
    }
    return r0();
  };
}, route);
let last = 0;
for (let k = 0; k < 4000; k++) {
  await p.waitForTimeout(400);
  const st = await p.evaluate(() => ({ wp: window.__wp, log: window.__log.slice() }));
  st.log.slice(last).forEach(l => log('  ' + l)); last = st.log.length;
  if (st.wp >= route.length) break;
}
const stuck = (await p.evaluate(() => window.__log)).filter(l => l.startsWith('STUCK'));
log('route:', stuck.length ? stuck.length + ' STUCK' : 'clean', '-> end view', await shot(p, 'route-end'));
if (p.errors.length) log('errors:', p.errors.join(' | '));
await b.close();
