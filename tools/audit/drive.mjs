// Driving: the desk buttons can be picked, a trip can be skipped while running (in the tunnel) and while pulling in, the
// place changes and the doors open; then walking makes footsteps and the end doors open (with their sound callbacks).
// `node tools/audit/drive.mjs` (about 15 minutes).
import { launch, page, hub, seat, stepClock, noTransitions, standAt, shot, log } from './lib.mjs';
const b = await launch(), p = await page(b, [960, 600]); await hub(p); await noTransitions(p); await stepClock(p, .05);
await p.evaluate(() => { const s = window.__st; window.__n = { step: 0, door: 0 }; const a = s.onStep, d = s.onEndDoor; s.onStep = r => { window.__n.step++; a && a(r); }; s.onEndDoor = () => { window.__n.door++; d && d(); }; });
await seat(p);
log('pick the second desk button ->', await p.evaluate(() => { const s = window.__st, v = s.driveDesk.buttons[1].mesh.getWorldPosition(s.camera.position.clone()).project(s.camera); return s.pickButton(v.x, v.y); }), '(expect snow)');
const st = () => p.evaluate(() => ({ ...window.__st.driveState(), theme: window.__st.theme, trainX: +window.__st.trainX.toFixed(1), skipShown: document.getElementById('drive-skip').classList.contains('on') }));
for (const [id, when] of [['snow', 'go'], ['desert', 'arrive']]) {
  await p.evaluate(id => document.querySelector(`#dest .dest[data-id="${id}"]`).click(), id);
  await p.waitForFunction(w => { const s = window.__st.driveState(); return s.phase === w && (w !== 'go' || window.__st.trainX < -20); }, when, { timeout: 300000, polling: 200 });
  const before = await st(); await p.click('#drive-skip');
  await p.waitForFunction(() => { const s = window.__st.driveState(); return s.phase === 'seat' && s.fade === 0; }, null, { timeout: 300000, polling: 300 });
  await p.waitForTimeout(1500); const after = await st(), doors = await p.evaluate(() => window.__st.doors.every(d => d.open > .9));
  const ok = before.skipShown && after.theme === id && after.trainX === 0 && doors && !after.skipShown;
  log(`skip during "${when}" to ${id}: ${ok ? 'ok' : 'PROBLEM'}`, JSON.stringify({ before, after, doorsOpen: doors }), await shot(p, 'drive-' + id));
}
await standAt(p, [0, 2.6, -.33, 0, 0]);
await p.evaluate(() => { const s = window.__st; s.input = { f: 1, s: 0, turn: 0, run: false }; });
await p.waitForFunction(() => window.__n.step > 4 && window.__n.door > 0, null, { timeout: 300000, polling: 500 }).catch(() => {});
log('walking: footsteps', await p.evaluate(() => window.__n.step), 'end doors', await p.evaluate(() => window.__n.door), '(expect > 4 and > 0)');
if (p.errors.length) log('errors:', p.errors.join(' | '));
await b.close();
