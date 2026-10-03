// The stand-alone gallery page: the gallery itself (gallery.js), in from the warm light of the train door
import '/gallery/js/gallery.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const out = () => document.getElementById('cover').classList.add('out');
Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 700))]).then(() => setTimeout(out, reduce ? 0 : 180));
