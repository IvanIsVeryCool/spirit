// The site's Worker. Everything is the static site as before (the files in the repo), except /api/, which handles the
// Photo Gallery's submissions: anyone can send a photo, it waits for review, and only photos approved on /review/
// appear in the gallery. Photos and their details are kept in Workers KV (the PHOTOS binding, made by Cloudflare on
// deploy); the review page's password is the REVIEW_PASSWORD secret, set in the Cloudflare dashboard.
//
//   GET  /api/photos          the approved photos, for the gallery: [{ id, caption, album, by, date, w, h }]
//   POST /api/photos          a submission (multipart: photo, caption, name, album, consent, w, h)
//   GET  /api/photos/<id>     a photo's image (an approved one; any, with the review password)
//   GET  /api/review          waiting and approved photos (review password)
//   POST /api/review/<id>     { action: 'approve' | 'reject' | 'remove' } (review password)

const MAX_BYTES = 4 * 1024 * 1024; // the gallery shrinks photos to 2000 px before sending, so they're well under this
const MAX_WAITING = 60; // past this many waiting for review, submissions pause until some are reviewed
const PER_HOUR = 6; // submissions from one address in an hour
const KEY = 'photo:';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!env.PHOTOS) return json({ error: 'not-set-up' }, 503);
    try { return await api(req, env, url); }
    catch (e) { console.error(e); return json({ error: 'server' }, 500); }
  }
};

async function api(req, env, url) {
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(2), M = req.method; // ['photos', id?] or ['review', id?]
  if (parts[0] === 'photos' && parts.length === 1 && M === 'GET') return listApproved(env);
  if (parts[0] === 'photos' && parts.length === 1 && M === 'POST') return submit(req, env);
  if (parts[0] === 'photos' && parts.length === 2 && M === 'GET') return image(req, env, parts[1]);
  if (parts[0] === 'review') {
    const auth = await authorised(req, env); if (auth) return auth;
    if (parts.length === 1 && M === 'GET') return listAll(env);
    if (parts.length === 2 && M === 'POST') return review(req, env, parts[1]);
  }
  return json({ error: 'not-found' }, 404);
}

/* ---------- the gallery ---------- */
async function all(env) {
  const out = []; let cursor;
  do { const r = await env.PHOTOS.list({ prefix: KEY, cursor }); out.push(...r.keys); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out.map(k => ({ id: k.name.slice(KEY.length), ...(k.metadata || {}) }));
}
const pub = p => ({ id: p.id, caption: p.c || '', album: p.a || '', by: p.n || '', date: p.d || '', w: p.w || 0, h: p.h || 0, t: p.t || 0 });
async function listApproved(env) {
  const list = (await all(env)).filter(p => p.s === 'approved').sort((a, b) => (b.at || b.t) - (a.at || a.t)).map(pub);
  return json(list, 200, { 'cache-control': 'public, max-age=60' });
}
async function image(req, env, id) {
  if (!/^[a-f0-9]{16}$/.test(id)) return json({ error: 'not-found' }, 404);
  const { value, metadata } = await env.PHOTOS.getWithMetadata(KEY + id, 'arrayBuffer');
  if (!value) return json({ error: 'not-found' }, 404);
  const approved = metadata && metadata.s === 'approved';
  if (!approved) { const auth = await authorised(req, env); if (auth) return json({ error: 'not-found' }, 404); }
  return new Response(value, { headers: { 'content-type': metadata.ty || 'image/jpeg', 'cache-control': approved ? 'public, max-age=86400' : 'private, no-store', 'x-content-type-options': 'nosniff' } });
}

/* ---------- a submission ---------- */
const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function kind(b) { // what the file really is, from its first bytes (not its name or what the browser says)
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
async function submit(req, env) {
  const ip = req.headers.get('cf-connecting-ip') || 'local', rk = 'rate:' + ip;
  const used = +(await env.PHOTOS.get(rk)) || 0; if (used >= PER_HOUR) return json({ error: 'too-many' }, 429);
  let form; try { form = await req.formData(); } catch (e) { return json({ error: 'bad-form' }, 400); }
  if (form.get('consent') !== 'yes') return json({ error: 'consent' }, 400);
  const file = form.get('photo'); if (!file || typeof file === 'string') return json({ error: 'no-photo' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'too-big' }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer()), ty = kind(bytes); if (!ty) return json({ error: 'not-a-photo' }, 415);
  const waiting = (await all(env)).filter(p => p.s === 'waiting').length; if (waiting >= MAX_WAITING) return json({ error: 'full' }, 503);
  const id = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');
  const meta = { s: 'waiting', c: clean(form.get('caption'), 140), n: clean(form.get('name'), 50), a: clean(form.get('album'), 40), d: new Date().toISOString().slice(0, 10), t: Date.now(), ty, w: Math.min(9999, +form.get('w') | 0), h: Math.min(9999, +form.get('h') | 0) };
  await env.PHOTOS.put(KEY + id, bytes, { metadata: meta });
  await env.PHOTOS.put(rk, String(used + 1), { expirationTtl: 3600 });
  return json({ ok: true }, 201);
}

/* ---------- review ---------- */
// null if the request carries the review password; otherwise the response to send (no password set, wrong, too many tries)
async function authorised(req, env) {
  if (!env.REVIEW_PASSWORD) return json({ error: 'no-password' }, 503);
  const ip = req.headers.get('cf-connecting-ip') || 'local', fk = 'fail:' + ip, fails = +(await env.PHOTOS.get(fk)) || 0;
  if (fails >= 10) return json({ error: 'too-many' }, 429);
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), enc = new TextEncoder();
  const a = enc.encode(given), b = enc.encode(env.REVIEW_PASSWORD);
  const ok = a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
  if (ok) return null;
  if (given) await env.PHOTOS.put(fk, String(fails + 1), { expirationTtl: 3600 });
  return json({ error: 'wrong-password' }, 401);
}
async function listAll(env) {
  const list = (await all(env)).sort((a, b) => b.t - a.t);
  return json({ waiting: list.filter(p => p.s === 'waiting').map(pub), approved: list.filter(p => p.s === 'approved').map(pub) }, 200, { 'cache-control': 'no-store' });
}
async function review(req, env, id) {
  if (!/^[a-f0-9]{16}$/.test(id)) return json({ error: 'not-found' }, 404);
  let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad-request' }, 400); }
  const key = KEY + id;
  if (body.action === 'reject' || body.action === 'remove') { await env.PHOTOS.delete(key); return json({ ok: true }); }
  if (body.action === 'approve') {
    const { value, metadata } = await env.PHOTOS.getWithMetadata(key, 'arrayBuffer'); if (!value) return json({ error: 'not-found' }, 404);
    await env.PHOTOS.put(key, value, { metadata: { ...metadata, s: 'approved', at: Date.now() } }); return json({ ok: true });
  }
  return json({ error: 'bad-request' }, 400);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}
