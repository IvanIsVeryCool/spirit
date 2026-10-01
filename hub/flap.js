// Split-flap letters, shared by the departures board on the platform and the Spirit Points billboard.
// Each changed cell clatters through a few random letters before it settles.
const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const pad = (t, n) => t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
export const padStart = (t, n) => t.length >= n ? t.slice(-n) : ' '.repeat(n - t.length) + t;
// returns how many cells changed, so the caller can play the clatter
export function flap(el, text, delay = 0) {
  while (el.children.length < text.length) el.appendChild(document.createElement('i'));
  while (el.children.length > text.length) el.lastChild.remove();
  let changed = 0;
  [...text].forEach((ch, i) => {
    const c = el.children[i], v = ch === ' ' ? '' : ch; if (c.dataset.v === v) return; c.dataset.v = v; changed++;
    if (reduce) { c.textContent = v; return; }
    let n = 2 + (Math.random() * 5 | 0); const tok = c._tok = (c._tok || 0) + 1;
    const step = () => {
      if (c._tok !== tok) return; // a newer value took over
      c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
      c.textContent = n-- > 0 ? CH[Math.random() * CH.length | 0] : v;
      if (n >= 0) setTimeout(step, 65);
    };
    setTimeout(step, delay + i * 22);
  });
  return changed;
}
// clear cells so the next flap() turns them over from blank
export function blank(el) { [...el.children].forEach(c => { c.dataset.v = ''; c.textContent = ''; }); }
