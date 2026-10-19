// Re-render the gallery's placeholder photos (assets/gallery/spirit-line-*.jpg, also the newsletter's lead photo and promos)
// and the link preview's raw frame from the current scene, into OUT, with the page's buttons hidden and the clock stepped.
// Same names and sizes as the files they replace. Then compress into place (see "Auditing the site" in CLAUDE.md).
// `node tools/audit/renders.mjs [name ...]` (about 25 minutes for all; names: arrival doors platform banner cab share).
import { launch, page, hub, OUT, log } from './lib.mjs';
const want = process.argv.slice(2), on = n => !want.length || want.includes(n);
const b = await launch(), p = await page(b, [1600, 1067], { deviceScaleFactor: 1 }); await hub(p);
await p.addStyleTag({ content: '*{transition:none!important} body *{visibility:hidden!important} #station{visibility:visible!important}' });
await p.evaluate(() => { const s = window.__st; s._adapt = () => {}; s.renderer.setPixelRatio(1); s.resize(); s.flyer.next = 1e9;
  window.__go = true; window.__dt = .05; s.clock.getDelta = function () { const d = window.__go ? window.__dt : 0; this.elapsedTime += d; return d; };
  // hold the resting camera at a chosen spot: parkedPose() is what render() follows when nothing else is going on
  window.__aim = (P, L, fov) => { s.camera.fov = fov; s.camera.updateProjectionMatrix(); s.parkedPose = function () { this.camPos.set(...P); this.camLook.set(...L); }; s.camera.position.set(...P); s.look.set(...L); s.blendUntil = 0; }; });
const g = await p.evaluate(() => { const s = window.__st, v = s.cop.p.root.getWorldPosition(s.camera.position.clone()); return { c: s.cars.map(c => c.position.x + s.train.position.x), cop: [v.x, v.y, v.z] }; });
const F = 2.9 / 2 + .12, c = g.c, cop = g.cop;
const still = async (name, W, H, P, L, fov, file = `spirit-line-${name}.jpg`) => {
  if (!on(name)) return; await p.setViewportSize({ width: W, height: H }); await p.waitForTimeout(1500);
  await p.evaluate(([P, L, fov]) => window.__aim(P, L, fov), [P, L, fov]); await p.waitForTimeout(6000);
  await p.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 90, timeout: 180000 }); log(name, '->', `${OUT}/${file}`);
};
await still('arrival', 1600, 1067, [c[2] + 2.4, 1.45, F + 3.0], [c[0] - 10, 2.1, .6], 50);    // along the platform toward the nose, into the sun
await still('doors', 1080, 1350, [c[1] + .5, 1.7, F + 4.3], [c[1], 1.95, 0], 46);              // an open door and its LED sign
await still('platform', 1600, 1067, [cop[0] - 1.2, 1.3, cop[2] + 2.9], [cop[0] - .5, 1.15, cop[2] - .3], 40); // the officer
if (on('banner')) { // the plane, from above the platform clutter, the clock stopped as it crosses
  await p.setViewportSize({ width: 1600, height: 1067 }); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__aim([1.5, 5.2, 13], [2.5, 11.5, -34], 50); const s = window.__st, Fl = s.flyer; Fl.x0 = -150; Fl.x1 = 150; Fl.on = true; Fl.t0 = s.clock.elapsedTime - 156 / Fl.v; });
  await p.waitForFunction(() => { const Fl = window.__st.flyer; return Fl.on && Fl.g.position.x > 5.5; }, null, { timeout: 300000, polling: 100 });
  await p.evaluate(() => { window.__go = false; }); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/spirit-line-banner.jpg`, type: 'jpeg', quality: 90, timeout: 180000 }); log('banner ->', `${OUT}/spirit-line-banner.jpg`);
  await p.evaluate(() => { window.__go = true; });
}
if (on('share')) { // the link preview's frame: the whole train from the resting view, at twice the size (cropped later)
  await p.evaluate(() => { const s = window.__st; delete s.parkedPose; s.camera.fov = 36; s.camera.updateProjectionMatrix(); s.renderer.setPixelRatio(2); });
  await p.setViewportSize({ width: 1200, height: 630 }); await p.waitForTimeout(1500); await p.evaluate(() => window.__st.resize()); await p.waitForTimeout(12000);
  await p.screenshot({ path: `${OUT}/share-raw.png`, timeout: 180000 }); log('share ->', `${OUT}/share-raw.png`);
  await p.evaluate(() => { const s = window.__st; s.renderer.setPixelRatio(1); s.resize(); });
}
if (on('cab')) { // Meet the Cabinet, at the moment the crew wave (the clock stepped faster: the cab is slow to render)
  await p.setViewportSize({ width: 1200, height: 1200 }); await p.waitForTimeout(1500);
  await p.evaluate(() => { const s = window.__st; delete s.parkedPose; s.camera.fov = 36; s.camera.updateProjectionMatrix(); window.__dt = .2; document.querySelectorAll('#rows .row')[3].click(); });
  await p.waitForFunction(() => { const s = window.__st; return s.trip && s.clock.elapsedTime - s.trip.t0 > 8.6; }, null, { timeout: 900000, polling: 1000 });
  await p.screenshot({ path: `${OUT}/spirit-line-cab.jpg`, type: 'jpeg', quality: 90, timeout: 180000 }); log('cab ->', `${OUT}/spirit-line-cab.jpg`);
}
if (p.errors.length) log('errors:', p.errors.join(' | '));
await b.close();
