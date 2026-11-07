// Spirit Stack: a falling-block puzzle game. The engine (Game), a bot to play against (Bot), the drawing (View),
// the input (DAS/ARR, rebindable keys, touch buttons), synthesized sound (Sfx) and the menus.

// ---------- the pieces ----------
const W = 10, H = 40, VIS = 20, TOP = H - VIS, SPAWN_Y = 18, HEAD = 2;
const TYPES = 'IJLOSTZ';
const COLOR = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };
const GARBAGE = 8;
const PALETTE = [null, '#45b6e0', '#4466dc', '#ff8d3a', '#ffc93f', '#4cc182', '#a160d8', '#e23f45', '#6e7180'];
const BASE = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
};
const turn = m => m.map((row, y) => row.map((_, x) => m[m.length - 1 - x][y]));
const CELLS = {};
for (const t of TYPES) {
  let m = BASE[t];
  CELLS[t] = [];
  for (let r = 0; r < 4; r++) {
    const c = [];
    m.forEach((row, y) => row.forEach((v, x) => v && c.push([x, y])));
    CELLS[t].push(c);
    m = turn(m);
  }
}
// wall kicks (x right, y up), keyed "from to"
const KICK = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};
const KICK_180 = [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1]];

const LOCK = .5, MAX_RESETS = 15, GARBAGE_DELAY = .6, GARBAGE_CAP = 8;
const COMBO = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const SPRINT = 40, BLITZ = 120, DIG = 10;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]] } return a };
const speed = lv => Math.pow(.8 - (lv - 1) * .007, lv - 1); // seconds per row

// ---------- the engine ----------
class Game {
  constructor(mode) {
    this.mode = mode;
    this.board = Array.from({ length: H }, () => new Uint8Array(W));
    this.bag = []; this.queue = []; this.fill();
    this.hold = null; this.holdUsed = false; this.piece = null;
    this.time = 0; this.score = 0; this.lines = 0; this.level = 1; this.pieces = 0; this.attack = 0; this.inputs = 0;
    this.combo = -1; this.b2b = -1; this.maxCombo = 0; this.incoming = []; this.over = false; this.result = null;
    this.soft = false; this.sdf = 20; this.noGravity = false;
    this.gravT = 0; this.lockT = 0; this.resets = 0; this.lowest = 0; this.lastRot = false; this.lastKick = 0;
    this.flash = []; this.fns = {};
    if (mode === 'dig') {
      let h = -1;
      for (let i = 0; i < DIG; i++) { let k; do k = Math.random() * W | 0; while (k === h); h = k; this.addRows(1, k) }
    }
  }
  on(t, fn) { (this.fns[t] ||= []).push(fn) }
  emit(t, d) { for (const fn of this.fns[t] || []) fn(d) }
  fill() { while (this.queue.length < 7) { if (!this.bag.length) this.bag = shuffle([...TYPES]); this.queue.push(this.bag.pop()) } }
  take() { const t = this.queue.shift(); this.fill(); return t }
  begin() { this.spawn(this.take()) }

  get interval() {
    if (this.mode === 'blitz') return speed(this.level);
    if (this.mode === 'versus') return speed(Math.min(15, 1 + Math.max(0, Math.floor((this.time - 60) / 20))));
    return 1;
  }
  get garbageLeft() { let n = 0; for (const row of this.board) if (row.includes(GARBAGE)) n++; return n }
  get pending() { return this.incoming.reduce((s, g) => s + g.lines, 0) }

  fits(type, r, x, y) {
    for (const [cx, cy] of CELLS[type][r]) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= W || by >= H) return false;
      if (by >= 0 && this.board[by][bx]) return false;
    }
    return true;
  }
  can(dx, dy, r = this.piece.r) { const p = this.piece; return this.fits(p.type, r, p.x + dx, p.y + dy) }
  ghostY() { const p = this.piece; let y = p.y; while (this.fits(p.type, p.r, p.x, y + 1)) y++; return y }

  spawn(type) {
    const p = { type, r: 0, x: type === 'O' ? 4 : 3, y: SPAWN_Y };
    this.piece = p;
    if (!this.can(0, 0)) { p.y--; if (!this.can(0, 0)) return this.topOut() }
    if (this.can(0, 1)) p.y++;
    this.lowest = p.y; this.lockT = 0; this.resets = 0; this.gravT = 0; this.lastRot = false;
  }
  // a successful move or turn on the ground buys more time, up to MAX_RESETS times per piece
  touched() {
    if (this.lockT > 0 || !this.can(0, 1)) { if (this.resets < MAX_RESETS) { this.lockT = 0; this.resets++ } }
  }
  move(dx) {
    if (!this.piece || this.over || !this.can(dx, 0)) return false;
    this.piece.x += dx; this.lastRot = false; this.touched();
    return true;
  }
  rotate(dir) {
    const p = this.piece;
    if (!p || this.over || p.type === 'O') return false;
    const to = (p.r + dir + 4) % 4;
    const kicks = dir === 2 ? KICK_180 : (p.type === 'I' ? KICK_I : KICK)[`${p.r}${to}`];
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.fits(p.type, to, p.x + kx, p.y - ky)) {
        p.x += kx; p.y -= ky; p.r = to; this.lastRot = true; this.lastKick = i;
        if (p.y > this.lowest) { this.lowest = p.y; this.resets = 0 }
        this.touched();
        return true;
      }
    }
    return false;
  }
  fall(soft) {
    const p = this.piece;
    if (!this.can(0, 1)) return false;
    p.y++; this.lastRot = false; this.lockT = 0;
    if (soft) this.score++;
    if (p.y > this.lowest) { this.lowest = p.y; this.resets = 0 }
    return true;
  }
  hardDrop() {
    if (!this.piece || this.over) return;
    let n = 0;
    while (this.can(0, 1)) { this.piece.y++; n++ }
    if (n) this.lastRot = false;
    this.score += 2 * n;
    this.emit('drop', n);
    this.lock();
  }
  holdPiece() {
    if (!this.piece || this.over || this.holdUsed) return false;
    const t = this.piece.type, next = this.hold || this.take();
    this.hold = t; this.holdUsed = true;
    this.spawn(next);
    this.emit('hold');
    return true;
  }

  update(dt) {
    if (this.over || !this.piece) return;
    this.time += dt;
    if (this.mode === 'blitz' && this.time >= BLITZ) { this.time = BLITZ; return this.finish('done') }
    if (this.noGravity) return; // the bot drops its own pieces
    {
      const base = this.interval, iv = this.soft ? (this.sdf === Infinity ? 0 : base / this.sdf) : base;
      if (iv === 0) while (this.fall(true));
      else {
        this.gravT += dt;
        while (this.gravT >= iv) { this.gravT -= iv; if (!this.fall(this.soft)) { this.gravT = 0; break } }
      }
    }
    if (!this.can(0, 1)) { this.lockT += dt; if (this.lockT >= LOCK) this.lock() }
  }

  // T-spin: the last move was a turn and three of the T's four corners are filled.
  // Full when both corners it points at are filled (or the turn used the last kick), else mini.
  spin(p) {
    if (p.type !== 'T' || !this.lastRot) return null;
    const occ = (x, y) => x < 0 || x >= W || y >= H || (y >= 0 && this.board[y][x] > 0);
    const c = [occ(p.x, p.y), occ(p.x + 2, p.y), occ(p.x + 2, p.y + 2), occ(p.x, p.y + 2)];
    if (c.filter(Boolean).length < 3) return null;
    const [a, b] = [[0, 1], [1, 2], [2, 3], [3, 0]][p.r];
    return (c[a] && c[b]) || this.lastKick === 4 ? 'full' : 'mini';
  }

  lock() {
    const p = this.piece, col = COLOR[p.type];
    let above = true;
    for (const [cx, cy] of CELLS[p.type][p.r]) {
      const y = p.y + cy;
      if (y >= 0) this.board[y][p.x + cx] = col;
      if (y >= TOP) above = false;
    }
    const spin = this.spin(p);
    const full = [];
    for (let y = 0; y < H; y++) if (this.board[y].every(v => v)) full.push(y);
    for (const y of full) { this.board.splice(y, 1); this.board.unshift(new Uint8Array(W)) }
    const n = full.length;
    this.pieces++;
    this.lines += n;
    if (n) this.flash.push({ rows: full, at: performance.now() });

    const hard = n === 4 || (spin && n > 0);
    if (n) { this.combo++; this.b2b = hard ? this.b2b + 1 : -1 } else this.combo = -1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const b2b = hard && this.b2b > 0;
    const pc = n > 0 && this.board.every(row => row.every(v => !v));

    let pts = spin === 'full' ? [400, 800, 1200, 1600][n] : spin === 'mini' ? [100, 200, 400, 400][n] : [0, 100, 300, 500, 800][n];
    if (b2b) pts *= 1.5;
    pts *= this.level;
    if (this.combo > 0) pts += 50 * this.combo * this.level;
    if (pc) pts += 3000 * this.level;
    this.score += Math.round(pts);

    let atk = 0;
    if (n) {
      atk = spin === 'full' ? [0, 2, 4, 6][n] : spin === 'mini' ? [0, 0, 1][n] || 0 : [0, 0, 1, 2, 4][n];
      if (b2b) atk += 1;
      atk += COMBO[Math.min(this.combo, COMBO.length - 1)];
      if (pc) atk += 10;
    }
    if (atk) {
      this.attack += atk;
      let left = atk;
      while (left > 0 && this.incoming.length) {
        const g = this.incoming[0], k = Math.min(left, g.lines);
        g.lines -= k; left -= k;
        if (!g.lines) this.incoming.shift();
      }
      if (left > 0) this.emit('attack', left);
    }
    if (this.mode === 'blitz') this.level = Math.min(15, 1 + Math.floor(this.lines / 10));
    this.emit('lock', { n, spin, b2b: b2b ? this.b2b : 0, combo: this.combo, pc, atk });

    if (!n) this.applyGarbage();
    if (above || this.overflow) return this.topOut();
    if (this.mode === 'sprint' && this.lines >= SPRINT) return this.finish('done');
    if (this.mode === 'dig' && !this.garbageLeft) return this.finish('done');
    this.holdUsed = false;
    this.spawn(this.take());
  }

  receive(n) {
    this.incoming.push({ lines: n, t: this.time + GARBAGE_DELAY, hole: Math.random() * W | 0 });
  }
  applyGarbage() {
    let cap = GARBAGE_CAP, added = 0;
    while (cap > 0 && this.incoming.length && this.incoming[0].t <= this.time) {
      const g = this.incoming[0], k = Math.min(cap, g.lines);
      this.addRows(k, g.hole);
      g.lines -= k; cap -= k; added += k;
      if (!g.lines) this.incoming.shift();
    }
    if (added) this.emit('garbage', added);
  }
  addRows(k, hole) {
    for (let i = 0; i < k; i++) {
      if (this.board.shift().some(v => v)) this.overflow = true;
      const row = new Uint8Array(W).fill(GARBAGE);
      row[hole] = 0;
      this.board.push(row);
    }
  }
  topOut() {
    if (this.mode === 'zen') {
      for (const row of this.board) row.fill(0);
      this.overflow = false; this.combo = -1; this.b2b = -1; this.holdUsed = false;
      this.emit('cleared');
      return this.spawn(this.take());
    }
    this.finish('lose');
  }
  finish(result) {
    if (this.over) return;
    this.over = true; this.result = result;
    this.emit('end', result);
  }
}

// ---------- the bot: tries every place each piece (and the held one) can drop to and scores the board left behind.
// While its stack is low it keeps the right-hand column open and waits for quads; once it's high it just survives. ----------
const LEVELS = {
  easy: { pps: .9, noise: 14, well: true },
  normal: { pps: 1.5, noise: 5, well: true },
  hard: { pps: 2.4, noise: 0, well: true },
};
function judge(board, type, r, x, y, noise, safe) {
  const b = board.map(row => row.slice());
  let land = 0;
  for (const [cx, cy] of CELLS[type][r]) { const yy = y + cy; if (yy < 0) return -1e9; b[yy][x + cx] = 1; land += H - yy }
  land /= 4;
  const rows = b.filter(row => !row.every(v => v));
  const cleared = H - rows.length;
  while (rows.length < H) rows.unshift(new Uint8Array(W));
  let rowT = 0, colT = 0, holes = 0, wells = 0, maxH = 0;
  for (let yy = 0; yy < H; yy++) {
    let prev = 1;
    for (let xx = 0; xx < (safe ? W - 1 : W); xx++) { const f = rows[yy][xx] ? 1 : 0; if (f !== prev) rowT++; prev = f }
    if (!prev) rowT++;
  }
  for (let xx = 0; xx < W; xx++) {
    let prev = 0, seen = false, depth = 0;
    for (let yy = 0; yy < H; yy++) {
      const f = rows[yy][xx] ? 1 : 0;
      if (f !== prev) colT++;
      prev = f;
      if (f && !seen) { seen = true; maxH = Math.max(maxH, H - yy) }
      if (!f && seen) holes++;
      if (!f && (xx === 0 || rows[yy][xx - 1]) && (xx === W - 1 || rows[yy][xx + 1])) { depth++; if (!safe || xx < W - 1) wells += depth } else if (f) depth = 0;
    }
    if (!prev) colT++;
  }
  let bonus = cleared * 4;
  if (safe && maxH < 12) {
    let fill = 0;
    for (let yy = 0; yy < H; yy++) if (rows[yy][W - 1] && rows[yy][W - 1] !== GARBAGE) fill++;
    bonus = [0, -8, -5, 0, 40][cleared] - 9 * fill;
  }
  return -4.5 * land + 3.42 * cleared - 3.22 * rowT - 9.35 * colT - 7.9 * holes - 3.39 * wells + bonus + (Math.random() - .5) * noise;
}
class Bot {
  constructor(game, level) { this.g = game; this.cfg = LEVELS[level]; this.plan = null; this.t = 0; game.noGravity = true }
  best(type) {
    const g = this.g, turns = type === 'O' ? 1 : 'ISZ'.includes(type) ? 2 : 4;
    let best = null;
    for (let r = 0; r < turns; r++) for (let x = -3; x <= W; x++) {
      if (!g.fits(type, r, x, SPAWN_Y)) continue;
      let y = SPAWN_Y;
      while (g.fits(type, r, x, y + 1)) y++;
      const s = judge(g.board, type, r, x, y, this.cfg.noise, this.safe);
      if (!best || s > best.s) best = { s, r, x, y };
    }
    return best;
  }
  step(dt) {
    const g = this.g;
    if (g.over || !g.piece) return;
    if (!this.plan) {
      let top = H;
      for (let yy = 0; yy < H && top === H; yy++) if (g.board[yy].some(v => v)) top = yy;
      this.safe = this.cfg.well && H - top + g.pending < 11;
      const now = this.best(g.piece.type);
      const alt = g.holdUsed ? null : this.best(g.hold || g.queue[0]);
      this.plan = alt && (!now || alt.s > now.s + 1) ? { ...alt, hold: true } : now || { r: 0, x: g.piece.x, y: g.ghostY() };
      if (this.plan.hold) g.holdPiece();
      // show it lined up over where it will go, then drop it
      const p = g.piece;
      if (p && g.fits(p.type, this.plan.r, this.plan.x, p.y)) { p.r = this.plan.r; p.x = this.plan.x }
      this.t = 0;
    }
    this.t += dt;
    if (this.t >= 1 / this.cfg.pps) {
      const p = g.piece;
      if (p && g.fits(p.type, this.plan.r, this.plan.x, this.plan.y)) { p.r = this.plan.r; p.x = this.plan.x; p.y = this.plan.y }
      if (p) g.hardDrop();
      this.plan = null;
    }
  }
}

// ---------- sound: all synthesized ----------
class Sfx {
  constructor() { this.ctx = null; this.on = store.get('stack-sound', true); this.vol = .7 }
  wake() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.out = this.ctx.createGain(); this.out.gain.value = this.vol; this.out.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * .5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.buf = buf;
      } catch { return }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  volume(v) { this.vol = v; if (this.out) this.out.gain.value = v }
  ok() { return this.on && this.ctx && this.ctx.state === 'running' }
  tone(f, d, { type = 'triangle', g = .08, at = 0, to = 0 } = {}) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), v = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(g, t + .004); v.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(v).connect(this.out); o.start(t); o.stop(t + d + .02);
  }
  noise(d, { g = .1, f = 1200, at = 0 } = {}) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), v = c.createGain();
    s.buffer = this.buf; fl.type = 'lowpass'; fl.frequency.value = f;
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(fl).connect(v).connect(this.out); s.start(t); s.stop(t + d + .02);
  }
  move() { this.tone(760, .03, { g: .022 }) }
  rotate() { this.tone(540, .05, { g: .03, to: 760 }) }
  drop() { this.noise(.08, { g: .14, f: 800 }); this.tone(140, .09, { type: 'sine', g: .11, to: 70 }) }
  lock() { this.tone(210, .05, { type: 'sine', g: .05 }) }
  hold() { this.tone(430, .07, { g: .04, to: 300 }) }
  clear(n, combo, spin) {
    const base = 392 * Math.pow(2, Math.min(Math.max(combo, 0), 12) / 12), steps = [0, 4, 7, 12, 16, 19];
    const k = spin ? 5 : n + 1;
    for (let i = 0; i < k; i++) this.tone(base * Math.pow(2, steps[i] / 12), .24, { g: .045, at: i * .035 });
    if (spin) this.tone(1568, .2, { type: 'sine', g: .03, at: .14 });
    if (n === 4) this.noise(.25, { g: .05, f: 3000 });
  }
  perfect() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .35, { g: .05, at: i * .07 })) }
  garbage() { this.noise(.12, { g: .12, f: 300 }); this.tone(90, .15, { type: 'sine', g: .1 }) }
  count(go) { this.tone(go ? 880 : 440, go ? .3 : .12, { type: 'sine', g: .08 }) }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, .32, { g: .06, at: i * .12 })) }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .3, { g: .06, at: i * .09 })) }
}

// ---------- storage and settings ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } },
};
const ACTIONS = { left: 'Move left', right: 'Move right', soft: 'Soft drop', hard: 'Hard drop', ccw: 'Rotate left', cw: 'Rotate right', r180: 'Rotate 180', hold: 'Hold', restart: 'Restart' };
const DEFAULTS = {
  das: 133, arr: 10, sdf: 20, ghost: true, grid: true, vol: 70,
  keys: { left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], hard: ['Space'], ccw: ['KeyZ', 'ControlLeft'], cw: ['ArrowUp', 'KeyX'], r180: ['KeyA'], hold: ['KeyC', 'ShiftLeft'], restart: ['KeyR'] },
};
const saved = store.get('stack-settings', {});
const S = { ...structuredClone(DEFAULTS), ...saved, keys: { ...DEFAULTS.keys, ...(saved.keys || {}) } };
const saveSettings = () => store.set('stack-settings', S);
const keyName = c => ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Enter: 'Enter', Backquote: '`', Slash: '/', Comma: ',', Period: '.', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backslash: '\\', Tab: 'Tab' })[c]
  || c.replace(/^Key|^Digit/, '').replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, (_, k, s) => ({ Control: 'Ctrl', Meta: '⌘' })[k] || k + (s === 'Right' ? ' R' : '')).replace(/^Numpad/, 'Num ');
const sdfValue = () => S.sdf >= 41 ? Infinity : S.sdf;
const pb = store.get('stack-pb', {});

// ---------- drawing ----------
const dpr = () => Math.min(window.devicePixelRatio || 1, 2.5);
const sprites = new Map();
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h) }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
// a block: rounded, a darker lip along the bottom, a soft light along the top (the site's toy style)
function sprite(v, size) {
  const key = v + ':' + size;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const s = c.width = c.height = Math.max(2, Math.round(size));
  const g = c.getContext('2d'), col = PALETTE[v], i = Math.max(1, s * .05), r = s * .16;
  g.fillStyle = shade(col, -.32); rr(g, i, i, s - 2 * i, s - 2 * i, r); g.fill();
  g.fillStyle = col; rr(g, i, i, s - 2 * i, s - 2 * i - s * .11, r); g.fill();
  g.fillStyle = 'rgba(255,255,255,.24)'; rr(g, s * .18, s * .13, s * .64, s * .14, s * .07); g.fill();
  sprites.set(key, c);
  return c;
}
function fitCanvas(cv, w, h) {
  const k = dpr();
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
  return g;
}
function bounds(type) {
  const c = CELLS[type][0], xs = c.map(p => p[0]), ys = c.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: Math.min(...ys), y1: Math.max(...ys) + 1 };
}
function mini(g, type, cx, cy, m, alpha = 1) {
  const b = bounds(type), spr = sprite(COLOR[type], m * dpr());
  g.globalAlpha = alpha;
  for (const [x, y] of CELLS[type][0]) g.drawImage(spr, cx + (x - (b.x0 + b.x1) / 2) * m, cy + (y - (b.y0 + b.y1) / 2) * m, m, m);
  g.globalAlpha = 1;
}
function panel(g, w, h) { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(11,15,38,.62)'; rr(g, 0, 0, w, h, 6); g.fill() }

class View {
  constructor(game, kind) {
    this.g = game; this.kind = kind;
    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e };
    this.cluster = el('div', 'cluster ' + kind);
    this.holdBox = el('div', 'hold-box box', '<p class="lbl">Hold</p>');
    this.nextBox = el('div', 'next-box box', '<p class="lbl">Next</p>');
    this.holdCv = el('canvas'); this.nextCv = el('canvas'); this.boardCv = el('canvas');
    this.holdBox.append(this.holdCv); this.nextBox.append(this.nextCv);
    this.well = el('div', 'well'); this.well.append(this.boardCv);
    this.act = el('div', 'act', '<p class="a1"></p><p class="a2"></p><p class="a3"></p>');
    this.act.setAttribute('aria-live', 'polite');
    this.stats = el('dl', 'stats');
    this.count = el('div', 'count'); this.count.setAttribute('aria-hidden', 'true');
    this.well.append(this.count);
    if (kind === 'bot') this.well.append(el('p', 'lbl who', 'Bot'));
    this.cluster.append(this.holdBox, this.act, this.stats, this.well, this.nextBox);
    this.prev = '';
  }
  size(cell, m, narrow, nextCount) {
    this.cell = cell; this.m = m; this.narrow = narrow;
    this.mw = Math.max(5, Math.round(cell * .34)); this.gap = 3;
    this.bw = this.mw + this.gap + W * cell; this.bh = (VIS + HEAD) * cell;
    this.bctx = fitCanvas(this.boardCv, this.bw, this.bh);
    this.cluster.style.setProperty('--head', HEAD * cell + 'px');
    this.holdW = 4.6 * m; this.holdH = 3 * m;
    this.hctx = fitCanvas(this.holdCv, this.holdW, this.holdH);
    this.nextCount = nextCount;
    if (narrow) { this.nw = nextCount * 4 * m + .6 * m; this.nh = 3 * m }
    else { this.nw = 4.6 * m; this.nh = nextCount * 2.9 * m + .6 * m }
    this.nctx = fitCanvas(this.nextCv, this.nw, this.nh);
    this.prevHold = this.prevNext = null;
  }
  action(lines) {
    const ps = this.act.querySelectorAll('p');
    lines.forEach((t, i) => {
      const p = ps[i];
      p.classList.remove('on');
      p.textContent = t || '';
      if (t) { void p.offsetWidth; p.classList.add('on') }
    });
  }
  setStats(rows) {
    const html = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    if (html !== this.prev) { this.stats.innerHTML = html; this.prev = html }
  }
  draw(now) {
    const g = this.g, c = this.cell, x0 = this.mw + this.gap, y0 = HEAD * c, ctx = this.bctx;
    ctx.clearRect(0, 0, this.bw, this.bh);
    // the well
    ctx.fillStyle = 'rgba(11,15,38,.88)';
    rr(ctx, x0 - 1, y0 - 1, W * c + 2, VIS * c + 2, 4); ctx.fill();
    if (S.grid) {
      ctx.strokeStyle = 'rgba(255,255,255,.055)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = 1; x < W; x++) { ctx.moveTo(x0 + x * c + .5, y0); ctx.lineTo(x0 + x * c + .5, y0 + VIS * c) }
      for (let y = 1; y < VIS; y++) { ctx.moveTo(x0, y0 + y * c + .5); ctx.lineTo(x0 + W * c, y0 + y * c + .5) }
      ctx.stroke();
    }
    const px = c * dpr();
    let danger = false;
    for (let y = TOP - HEAD; y < H; y++) for (let x = 0; x < W; x++) {
      const v = g.board[y][x];
      if (!v) continue;
      if (y < TOP + 4) danger = true;
      ctx.drawImage(sprite(g.over && g.result === 'lose' ? GARBAGE : v, px), x0 + x * c, y0 + (y - TOP) * c, c, c);
    }
    const p = g.piece;
    if (p && !g.over) {
      const col = COLOR[p.type];
      if (S.ghost) {
        const gy = g.ghostY();
        ctx.fillStyle = PALETTE[col]; ctx.globalAlpha = .2;
        for (const [cx, cy] of CELLS[p.type][p.r]) { const yy = gy + cy - TOP; if (yy >= -HEAD) { rr(ctx, x0 + (p.x + cx) * c + 1.5, y0 + yy * c + 1.5, c - 3, c - 3, c * .16); ctx.fill() } }
        ctx.globalAlpha = .5; ctx.strokeStyle = PALETTE[col]; ctx.lineWidth = 1.5;
        for (const [cx, cy] of CELLS[p.type][p.r]) { const yy = gy + cy - TOP; if (yy >= -HEAD) { rr(ctx, x0 + (p.x + cx) * c + 2, y0 + yy * c + 2, c - 4, c - 4, c * .14); ctx.stroke() } }
        ctx.globalAlpha = 1;
      }
      // about to lock: the piece dims a little as its time runs out
      const fade = !g.can(0, 1) ? 1 - .35 * Math.min(1, g.lockT / LOCK) : 1;
      ctx.globalAlpha = fade;
      const spr = sprite(col, px);
      for (const [cx, cy] of CELLS[p.type][p.r]) { const yy = p.y + cy - TOP; if (yy >= -HEAD) ctx.drawImage(spr, x0 + (p.x + cx) * c, y0 + yy * c, c, c) }
      ctx.globalAlpha = 1;
    }
    // cleared rows: a white sweep that fades
    g.flash = g.flash.filter(f => now - f.at < 260);
    for (const f of g.flash) {
      const k = 1 - (now - f.at) / 260;
      ctx.fillStyle = `rgba(255,255,255,${.75 * k})`;
      for (const y of f.rows) if (y >= TOP) ctx.fillRect(x0, y0 + (y - TOP) * c + c * .5 * (1 - k), W * c, c * k);
    }
    ctx.strokeStyle = danger && !g.over ? 'rgba(226,63,69,.9)' : 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    rr(ctx, x0 - 1, y0 - 1, W * c + 2, VIS * c + 2, 4); ctx.stroke();
    // incoming garbage: red when it lands with the next piece, amber while it's on its way
    ctx.fillStyle = 'rgba(11,15,38,.6)'; ctx.fillRect(0, y0, this.mw, VIS * c);
    let yb = y0 + VIS * c;
    for (const inc of g.incoming) {
      const h = Math.min(inc.lines * c, yb - y0);
      if (h <= 0) break;
      ctx.fillStyle = inc.t <= g.time ? '#e23f45' : '#ffad1f';
      ctx.fillRect(0, yb - h, this.mw, h - 1);
      yb -= h;
    }
    // hold and next, redrawn only when they change
    const hk = (g.hold || '') + g.holdUsed;
    if (hk !== this.prevHold) {
      this.prevHold = hk;
      panel(this.hctx, this.holdW, this.holdH);
      if (g.hold) mini(this.hctx, g.hold, this.holdW / 2, this.holdH / 2, this.m, g.holdUsed ? .35 : 1);
    }
    const nk = g.queue.slice(0, this.nextCount).join('');
    if (nk !== this.prevNext) {
      this.prevNext = nk;
      panel(this.nctx, this.nw, this.nh);
      [...nk].forEach((t, i) => this.narrow
        ? mini(this.nctx, t, .3 * this.m + (i + .5) * 4 * this.m, this.nh / 2, this.m * (i ? .82 : 1))
        : mini(this.nctx, t, this.nw / 2, .3 * this.m + (i + .5) * 2.9 * this.m, this.m));
    }
  }
}

// ---------- the app ----------
const $ = s => document.querySelector(s);
const sfx = new Sfx();
sfx.volume(S.vol / 100);
const fmt = (t, ms = 3) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(ms).padStart(ms ? 3 + ms : 2, '0')}` };
const MODE_NAME = { sprint: '40 Lines', blitz: 'Blitz', dig: 'Dig', versus: 'Versus', zen: 'Zen' };
let mode = null, level = 'normal', player = null, bot = null, botAI = null, pv = null, bv = null;
let state = 'menu', paused = false, counting = 0, endAt = 0, last = performance.now();
const touchMode = matchMedia('(pointer: coarse)').matches;

function start(m, lv = level) {
  mode = m; level = lv;
  state = 'play'; paused = false; endAt = 0;
  player = new Game(m);
  player.sdf = sdfValue();
  bot = botAI = bv = null;
  if (m === 'versus') {
    bot = new Game(m);
    botAI = new Bot(bot, lv);
    player.on('attack', n => bot.receive(n));
    bot.on('attack', n => player.receive(n));
    bot.on('end', r => { if (r === 'lose') finishVersus('win') });
  }
  player.on('lock', onLock);
  player.on('drop', () => sfx.drop());
  player.on('hold', () => sfx.hold());
  player.on('garbage', () => sfx.garbage());
  player.on('cleared', () => pv.action(['Board cleared']));
  player.on('end', r => mode === 'versus' ? finishVersus(r === 'lose' ? 'lose' : 'win') : finish(r));
  pv = new View(player, 'player');
  if (bot) bv = new View(bot, 'bot');
  $('#menu').hidden = true; $('#play').hidden = false; $('#overlay').hidden = true;
  $('#pause-btn').hidden = false;
  $('#touch').hidden = !touchMode;
  document.body.classList.add('playing');
  layout();
  counting = 2.4; tick = 4;
  held.left = held.right = false; dir = 0;
  document.activeElement?.blur?.();
}
let tick = 0;
function countdown(dt) {
  counting -= dt;
  const k = Math.ceil(counting / .8);
  if (k !== tick && k > 0) { tick = k; pv.count.textContent = k; sfx.count(false) }
  if (counting <= 0) {
    counting = 0;
    pv.count.textContent = '';
    sfx.count(true);
    player.begin(); bot?.begin();
    if (dir) { dasT = 0; arrUsed = 0 }
    player.soft = held.soft;
  }
}

function onLock(e) {
  const lines = [];
  const name = ['', 'Single', 'Double', 'Triple', 'Quad'][e.n];
  if (e.spin) lines[0] = (e.spin === 'mini' ? 'T-spin mini ' : 'T-spin ') + name;
  else if (e.n >= 2) lines[0] = name;
  if (e.pc) lines[0] = 'Perfect clear';
  if (e.b2b) lines[1] = 'Back-to-back ×' + e.b2b;
  if (e.combo > 0) lines[2] = e.combo + ' combo';
  if (lines.length) pv.action([lines[0], lines[1], lines[2]]);
  if (e.pc) sfx.perfect();
  else if (e.n) sfx.clear(e.n, e.combo, !!e.spin);
  else sfx.lock();
}

// ---------- input: DAS (the wait before a held key repeats) and ARR (how fast it repeats); the last direction pressed wins ----------
const held = { left: false, right: false, soft: false };
let dir = 0, dasT = 0, arrUsed = 0;
const live = () => state === 'play' && !paused && !counting && player && !player.over;
function press(a) {
  sfx.wake();
  if (a === 'restart') { if (state === 'play' || state === 'results') start(mode); return }
  if (state !== 'play' || paused) return;
  if (a === 'left' || a === 'right') { held[a] = true; dir = a === 'left' ? -1 : 1; dasT = 0; arrUsed = 0 }
  if (a === 'soft') { held.soft = true; if (player) player.soft = true }
  if (!live()) return;
  const g = player;
  switch (a) {
    case 'left': case 'right': g.inputs++; if (g.move(dir)) sfx.move(); break;
    case 'cw': g.inputs++; if (g.rotate(1)) sfx.rotate(); break;
    case 'ccw': g.inputs++; if (g.rotate(-1)) sfx.rotate(); break;
    case 'r180': g.inputs++; if (g.rotate(2)) sfx.rotate(); break;
    case 'hold': g.inputs++; g.holdPiece(); break;
    case 'hard': g.inputs++; g.hardDrop(); break;
  }
}
function release(a) {
  if (a === 'left' || a === 'right') {
    held[a] = false;
    const other = a === 'left' ? 'right' : 'left';
    if (dir === (a === 'left' ? -1 : 1)) { dir = held[other] ? (other === 'left' ? -1 : 1) : 0; dasT = 0; arrUsed = 0 }
  }
  if (a === 'soft') { held.soft = false; if (player) player.soft = false }
}
function autoShift(dt) {
  if (!dir || !player.piece) return;
  dasT += dt;
  const das = S.das / 1000;
  if (dasT < das) return;
  let moved = false;
  if (S.arr === 0) while (player.move(dir)) moved = true;
  else {
    const arr = S.arr / 1000;
    let over = dasT - das - arrUsed;
    while (over >= arr) { arrUsed += arr; over -= arr; if (player.move(dir)) moved = true }
  }
  if (moved) sfx.move();
}
const keyAction = code => Object.keys(S.keys).find(a => S.keys[a].includes(code));
let binding = null;
addEventListener('keydown', e => {
  if (binding) return;
  if ($('#settings').open) return;
  const a = keyAction(e.code);
  if (state === 'play' && (e.code === 'Escape' || (!paused && (a || e.code === 'Tab')))) e.preventDefault();
  if (e.code === 'Escape') { if (state === 'play') togglePause(); else if (state === 'results') toMenu(); return }
  if (state === 'results' && e.code === 'Enter') { e.preventDefault(); start(mode); return }
  if (!a || e.repeat) return;
  press(a);
});
addEventListener('keyup', e => { const a = keyAction(e.code); if (a) release(a) });
addEventListener('blur', () => { release('left'); release('right'); release('soft'); if (state === 'play' && !counting && !paused) togglePause(true) });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !paused) togglePause(true) });

// touch buttons: each holds like a key
for (const b of document.querySelectorAll('#touch button')) {
  const a = b.dataset.act;
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('down'); press(a) });
  const up = () => { if (b.classList.contains('down')) { b.classList.remove('down'); release(a) } };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', e => e.preventDefault());
}

// ---------- pause, results, menu ----------
const card = $('#card');
function overlay(html, focus) {
  card.innerHTML = html;
  $('#overlay').hidden = false;
  card.querySelectorAll('[data-do]').forEach(b => b.addEventListener('click', () => ({ resume: () => togglePause(false), retry: () => start(mode), menu: toMenu })[b.dataset.do]()));
  if (focus) card.querySelector('[data-do]')?.focus();
}
function togglePause(on = !paused) {
  if (state !== 'play' || player?.over) return;
  paused = on;
  if (on) {
    release('left'); release('right'); release('soft');
    overlay(`<h2 id="card-h">Paused</h2><p class="big" style="font-size:30px">${MODE_NAME[mode]}${mode === 'versus' ? ' · ' + level : ''}</p>
      <div class="row" style="margin-top:20px"><button class="btn primary" data-do="resume">Resume</button><button class="btn" data-do="retry">Restart</button><button class="btn" data-do="menu">Menu</button></div>`, true);
  } else { $('#overlay').hidden = true; last = performance.now() }
}
function stats(g) {
  const t = Math.max(g.time, .001);
  return { pps: (g.pieces / t).toFixed(2), apm: (g.attack / t * 60).toFixed(1), kpp: g.pieces ? (g.inputs / g.pieces).toFixed(2) : '0.00' };
}
function finish(r) {
  if (endAt) return;
  const g = player, s = stats(g);
  let title, big, best = false, rows;
  if (r === 'lose') { sfx.lose() } else sfx.win();
  if (mode === 'sprint') {
    title = r === 'done' ? '40 Lines' : 'Topped out';
    big = r === 'done' ? fmt(g.time) : `${g.lines}/${SPRINT}`;
    if (r === 'done' && (!pb.sprint || g.time < pb.sprint)) { pb.sprint = g.time; best = true }
    rows = [['PPS', s.pps], ['Pieces', g.pieces], ['Keys/piece', s.kpp]];
  } else if (mode === 'blitz') {
    title = r === 'done' ? 'Blitz' : 'Topped out';
    big = g.score.toLocaleString();
    if (!pb.blitz || g.score > pb.blitz) { pb.blitz = g.score; best = g.score > 0 }
    rows = [['Lines', g.lines], ['Level', g.level], ['PPS', s.pps]];
  } else {
    title = r === 'done' ? 'Dug out' : 'Topped out';
    big = r === 'done' ? fmt(g.time) : `${g.garbageLeft} left`;
    if (r === 'done' && (!pb.dig || g.time < pb.dig)) { pb.dig = g.time; best = true }
    rows = [['Pieces', g.pieces], ['PPS', s.pps], ['Keys/piece', s.kpp]];
  }
  store.set('stack-pb', pb);
  results(title, big, best, rows);
}
function finishVersus(r) {
  if (endAt) return;
  player.over = true; bot.over = true;
  const s = stats(player);
  const rec = pb[level] ||= { w: 0, l: 0 };
  r === 'win' ? rec.w++ : rec.l++;
  store.set('stack-pb', pb);
  r === 'win' ? sfx.win() : sfx.lose();
  results(`Versus · ${level}`, r === 'win' ? 'You win' : 'Bot wins', false, [['APM', s.apm], ['PPS', s.pps], ['Sent', player.attack]]);
}
function results(title, big, best, rows) {
  endAt = performance.now();
  const g = player;
  setTimeout(() => {
    if (state !== 'play' || player !== g) return;
    state = 'results';
    overlay(`<h2 id="card-h">${title}</h2><p class="big">${big}</p>${best ? '<span class="tag">New best</span>' : ''}
      <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="row"><button class="btn primary" data-do="retry">Retry</button><button class="btn" data-do="menu">Menu</button></div>`, false);
  }, 700);
}
function toMenu() {
  state = 'menu'; paused = false; player = bot = botAI = null;
  $('#play').hidden = true; $('#menu').hidden = false; $('#pause-btn').hidden = true;
  document.body.classList.remove('playing', 'narrow');
  $('#arena').innerHTML = '';
  menuBests();
  document.querySelector(`[data-mode="${mode}"]${mode === 'versus' ? `[data-level="${level}"]` : ''}`)?.focus({ preventScroll: true });
}
function menuBests() {
  const set = (k, v) => { const e = document.querySelector(`[data-pb="${k}"]`); if (e) e.innerHTML = v };
  set('sprint', pb.sprint ? `Best<strong>${fmt(pb.sprint)}</strong>` : '');
  set('blitz', pb.blitz ? `Best<strong>${pb.blitz.toLocaleString()}</strong>` : '');
  set('dig', pb.dig ? `Best<strong>${fmt(pb.dig)}</strong>` : '');
  for (const l of Object.keys(LEVELS)) set(l, pb[l] ? `${pb[l].w}–${pb[l].l}` : '');
  const k = a => S.keys[a].map(keyName).map(n => `<kbd>${n}</kbd>`).join(' ');
  $('#keys-help').innerHTML = touchMode ? '' : `${k('left')} ${k('right')} move · ${k('soft')} soft drop · ${k('hard')} hard drop · ${k('ccw')} ${k('cw')} ${k('r180')} rotate · ${k('hold')} hold · ${k('restart')} restart · <kbd>Esc</kbd> pause`;
}
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => { sfx.wake(); start(b.dataset.mode, b.dataset.level || level) });
$('#pause-btn').addEventListener('click', () => { if (state === 'play') togglePause() });
const soundBtn = $('#sound-btn');
function soundLabel() { soundBtn.textContent = sfx.on ? 'Sound on' : 'Sound off'; soundBtn.setAttribute('aria-pressed', sfx.on) }
soundBtn.addEventListener('click', () => { sfx.on = !sfx.on; store.set('stack-sound', sfx.on); sfx.wake(); soundLabel(); soundBtn.blur() });
soundLabel();

// ---------- settings ----------
const dlg = $('#settings');
const ranges = { das: v => v + ' ms', arr: v => v + ' ms', sdf: v => v >= 41 ? '∞' : v + '×', vol: v => v + '%' };
function syncSettings() {
  for (const k of Object.keys(ranges)) { $('#s-' + k).value = S[k]; $('#o-' + k).textContent = ranges[k](S[k]) }
  $('#s-ghost').checked = S.ghost; $('#s-grid').checked = S.grid;
  $('#binds').innerHTML = Object.entries(ACTIONS).map(([a, n]) => `<div class="bind"><span>${n}</span><button type="button" data-bind="${a}">${S.keys[a].map(keyName).join(' / ')}</button></div>`).join('');
  for (const b of dlg.querySelectorAll('[data-bind]')) b.addEventListener('click', () => {
    if (binding) return;
    binding = b.dataset.bind; b.textContent = 'Press a key'; b.classList.add('wait');
  });
}
for (const k of Object.keys(ranges)) $('#s-' + k).addEventListener('input', e => {
  S[k] = +e.target.value; $('#o-' + k).textContent = ranges[k](S[k]);
  if (k === 'vol') sfx.volume(S.vol / 100);
  saveSettings();
});
$('#s-ghost').addEventListener('change', e => { S.ghost = e.target.checked; saveSettings() });
$('#s-grid').addEventListener('change', e => { S.grid = e.target.checked; saveSettings() });
$('#s-reset').addEventListener('click', () => { Object.assign(S, structuredClone(DEFAULTS)); sfx.volume(S.vol / 100); saveSettings(); syncSettings() });
dlg.addEventListener('keydown', e => {
  if (!binding) return;
  e.preventDefault(); e.stopPropagation();
  if (e.code !== 'Escape') {
    for (const a of Object.keys(S.keys)) S.keys[a] = S.keys[a].filter(c => c !== e.code);
    S.keys[binding] = [e.code];
    saveSettings();
  }
  binding = null;
  syncSettings();
}, true);
dlg.addEventListener('cancel', e => { if (binding) e.preventDefault() });
dlg.addEventListener('close', () => { binding = null; menuBests() });
$('#settings-btn').addEventListener('click', () => { syncSettings(); dlg.showModal() });

// ---------- layout: the cell size that fits the screen ----------
function layout() {
  if (!pv) return;
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const narrow = vw < 760 || vh < 480;
  document.body.classList.toggle('narrow', narrow);
  const arena = $('#arena');
  arena.innerHTML = '';
  const avail = vh - $('.hud').offsetHeight - (touchMode ? 146 : 0) - 26;
  let cell, m, bcell;
  if (!narrow) {
    const n = bv ? 2 : 1;
    cell = Math.floor(Math.min(avail / 22.2, (vw - 48 - (n - 1) * 48) / (n * 21.6)));
    cell = Math.max(12, Math.min(34, cell));
    m = Math.round(cell * .62);
    pv.size(cell, m, false, 5);
    arena.append(pv.cluster);
    pv.cluster.append(pv.holdBox, pv.act, pv.stats, pv.well, pv.nextBox);
    if (bv) { bv.size(cell, m, false, 5); bv.cluster.append(bv.holdBox, bv.act, bv.stats, bv.well, bv.nextBox); arena.append(bv.cluster) }
  } else {
    const w = vw - 32, topH = 64;
    const k = bv ? .4 : 0;
    cell = Math.floor(Math.min((w - 8 - (bv ? 16 : 0)) / (10 + 10 * k + .4 + (bv ? .4 : 0)), (avail - topH) / 22));
    cell = Math.max(10, cell);
    const nc = bv ? 2 : 3;
    m = Math.max(7, Math.min(16, Math.round(cell * .5), Math.floor((w - 190) / (4.6 + nc * 4 + .6))));
    pv.size(cell, m, true, nc);
    const top = document.createElement('div'); top.className = 'top';
    const wells = document.createElement('div'); wells.className = 'wells';
    top.append(pv.holdBox, pv.stats, pv.nextBox);
    pv.well.append(pv.act);
    wells.append(pv.well);
    if (bv) {
      bcell = Math.max(6, Math.floor(cell * k));
      bv.size(bcell, m, true, 1);
      wells.append(bv.well);
    }
    arena.append(top, wells);
  }
  arena.classList.toggle('vs', !!bv);
}
addEventListener('resize', () => { if (state !== 'menu') layout() });

// ---------- the loop ----------
function statRows(g, isBot) {
  const s = stats(g);
  if (isBot) return [['PPS', s.pps], ['APM', s.apm]];
  switch (mode) {
    case 'sprint': return [['Time', fmt(g.time, 2)], ['Lines', `${Math.min(g.lines, SPRINT)}<small>/${SPRINT}</small>`], ['PPS', s.pps]];
    case 'blitz': return [['Time', fmt(Math.max(0, BLITZ - g.time), 1)], ['Score', g.score.toLocaleString()], ['PPS', s.pps], ['Level', g.level]];
    case 'dig': return [['Time', fmt(g.time, 2)], ['Garbage', g.garbageLeft], ['PPS', s.pps]];
    case 'versus': return [['Time', fmt(g.time, 0)], ['APM', s.apm], ['PPS', s.pps]];
    default: return [['Lines', g.lines], ['Score', g.score.toLocaleString()], ['PPS', s.pps]];
  }
}
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (state === 'play' && !paused) {
    if (counting > 0) countdown(dt);
    else if (!player.over) {
      player.sdf = sdfValue();
      autoShift(dt);
      player.update(dt);
      if (bot && !bot.over) { botAI.step(dt); bot.update(dt) }
    }
  }
  if (pv && state !== 'menu') {
    pv.draw(now); pv.setStats(statRows(player).slice(0, pv.narrow ? 3 : 4));
    if (bv) { bv.draw(now); if (!pv.narrow) bv.setStats(statRows(bot, true)) }
  }
  requestAnimationFrame(frame);
}
menuBests();
requestAnimationFrame(frame);
if (location.hash === '#debug') window.__stack = { get player() { return player }, get bot() { return bot }, get state() { return state }, start, S, CELLS, Bot };
