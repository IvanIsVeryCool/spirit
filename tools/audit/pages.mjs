// Every page at desktop and phone size: errors in the console, failed requests, duplicate ids, controls with no
// accessible name, images with no alt, sideways scrolling (and what sticks out), the head's meta tags. Screenshots to OUT.
// `node tools/audit/pages.mjs` (about 10 minutes). The sandbox's own failures (fonts, the sheet, /api/) are filtered out.
import { launch, page, hub, SITE, SIZES, NOISE, shot, log } from './lib.mjs';
const b = await launch();
for (const [size, wh] of Object.entries(SIZES)) for (const [path, name] of [['/', 'hub'], ['/points/', 'points'], ['/gallery/', 'gallery'], ['/review/', 'review']]) {
  const p = await page(b, wh), fails = [];
  p.on('response', r => { if (r.status() >= 400 && !NOISE.test(r.url())) fails.push(r.status() + ' ' + r.url().replace(SITE, '')); });
  p.on('requestfailed', r => { if (!NOISE.test(r.url())) fails.push((r.failure() || {}).errorText + ' ' + r.url().replace(SITE, '')); });
  await p.addInitScript(() => { try { sessionStorage.setItem('spirit-rode', '1'); } catch (e) {} });
  if (name === 'hub') await hub(p); else { await p.goto(SITE + path); await p.waitForTimeout(10000); }
  const r = await p.evaluate(() => {
    const seen = {}, dup = []; document.querySelectorAll('[id]').forEach(e => { if (seen[e.id]) dup.push(e.id); seen[e.id] = 1; });
    const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0; };
    const unnamed = [...document.querySelectorAll('button,a,[role=button],input,select,textarea')].filter(e => e.type !== 'hidden' && !(e.getAttribute('aria-label') || e.textContent.trim() || e.title || (e.labels && e.labels.length) || e.getAttribute('aria-labelledby'))).map(e => e.tagName + '#' + e.id);
    const noalt = [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).map(i => i.src.slice(-40));
    const over = document.documentElement.scrollWidth - innerWidth;
    const wide = over > 0 ? [...document.querySelectorAll('body *')].filter(e => vis(e) && e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(e => e.tagName + '#' + e.id + '.' + e.className) : [];
    const q = s => !!document.querySelector(s);
    return { dup, unnamed, noalt, overflowPx: over, wide, meta: { title: document.title, lang: document.documentElement.lang, description: q('meta[name=description]'), themeColor: q('meta[name=theme-color]'), ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || null, icon: q('link[rel~=icon]') } };
  });
  const problems = [...r.dup.map(x => 'duplicate id ' + x), ...r.unnamed.map(x => 'no accessible name: ' + x), ...r.noalt.map(x => 'img without alt: ' + x), ...(r.overflowPx > 0 ? ['scrolls sideways by ' + r.overflowPx + 'px: ' + r.wide.join(', ')] : []), ...p.errors, ...fails];
  log(`== ${name} ${size}: ${problems.length ? problems.length + ' problem(s)' : 'clean'}  ${JSON.stringify(r.meta)}`);
  problems.forEach(x => log('   - ' + x));
  log('   screenshot', await shot(p, `pages-${name}-${size}`));
  await p.context().close();
}
await b.close();
