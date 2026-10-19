// Shared helpers for the audit scripts (see "Auditing the site" in CLAUDE.md). Repo-only: tools/ is in .assetsignore.
// Env: SITE (default http://localhost:8770), OUT (screenshots, default /tmp/spirit-audit), PLAYWRIGHT (the module's path).
import { mkdirSync } from 'node:fs';
const PW = process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright/index.mjs';
export const { chromium } = await import(PW);
export const SITE = process.env.SITE || 'http://localhost:8770';
export const OUT = process.env.OUT || '/tmp/spirit-audit';
mkdirSync(OUT, { recursive: true });
export const SIZES = { desktop: [1280, 800], phone: [390, 844] };
// errors the sandbox makes on its own (no Google Fonts, no Google Sheet, no /api/ without the Worker), and Chrome's note that
// sound waits for the first tap (expected: see "Sound" in CLAUDE.md): not the site's
export const NOISE = /ERR_CERT|ERR_TUNNEL|fonts\.g|docs\.google|\/api\/photos|KHR_parallel_shader_compile|Failed to load resource|AudioContext was not allowed to start/;

// one browser, software WebGL (slow: 2-5 fps; loading takes 1-2 minutes because of the warm-up)
export const launch = () => chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

// a page at a size; phone sizes get touch and a phone user agent's matchMedia(pointer: coarse)
export async function page(b, [W, H], opts = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 800, hasTouch: W < 800, ...opts });
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push('pageerror: ' + e.message));
  p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !NOISE.test(m.text())) p.errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  return p;
}
// skip the ticket and the opening (a later visit the same day), sound off; ready when every door is open
export async function hub(p, { first = false } = {}) {
  await p.addInitScript(first => { const d = new Date(); if (!first) localStorage.setItem('spirit-hub-day', d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()); localStorage.setItem('spirit-sound', 'off'); }, first);
  await p.goto(SITE + '/#debug');
  if (!first) await p.waitForFunction(() => window.__st && window.__st.doors.every(d => d.open > .97), null, { timeout: 400000, polling: 1000 });
}
// headless CSS transitions never start once the 3D runs: drop them (and the "Click to look" plate, which only shows because
// the tests don't capture the mouse) before reading layout or taking screenshots
export const noTransitions = p => p.addStyleTag({ content: '*{transition:none!important}.lock-hint{display:none!important}' });
// step the scene's clock a fixed amount per frame, so timelines land the same way at any frame rate
export const stepClock = (p, dt = .1) => p.evaluate(dt => { const s = window.__st; s.clock.getDelta = function () { this.elapsedTime += dt; return dt; }; }, dt);
// into the driver's seat (the Drive plate), settled
export async function seat(p) {
  await p.evaluate(() => document.getElementById('drive-tag').click());
  await p.waitForFunction(() => { const s = window.__st.driveState(); return s && s.phase === 'seat' && s.fade === 0; }, null, { timeout: 300000, polling: 300 });
}
// stand somewhere in the train (walking): car index, x from the car's centre, z, yaw (0 faces +x, PI faces -x), pitch;
// `from` picks the deck where two overlap (9: any floor there; .43 the lower deck, 2.075 the upper)
export async function standAt(p, [car, dx, z, yaw, pitch, from = 9]) {
  const f = await p.evaluate(([car, dx, z, yaw, pitch, from]) => {
    const s = window.__st; if (!s.trip.walked) { s.setInput = () => {}; s._startWalk(); }
    const W = s.trip.walk, x = s.cars[car].position.x + dx; W.x = x; W.z = z; W.yaw = yaw; W.pitch = pitch; W.vx = W.vz = 0;
    const f = s._floorAt(x, z, from, from === 9 ? 9 : .3); if (f != null) { W.floor = f; W.y = f; } return f;
  }, [car, dx, z, yaw, pitch, from]);
  // wait for the camera to get there (each frame is slow), then a little longer for doors and people to settle
  await p.waitForFunction(([car, dx, z]) => { const s = window.__st, c = s.camera.position, x = s.train.position.x + s.cars[car].position.x + dx; return Math.abs(c.x - x) < .03 && Math.abs(c.z - z) < .03; }, [car, dx, z], { timeout: 120000, polling: 300 }).catch(() => {});
  await p.waitForTimeout(1200); return f;
}
export const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 }).then(() => `${OUT}/${name}.png`);
export const log = (...a) => console.log(...a);
