// Station sound design, synthesized live with the Web Audio API (no audio files).
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

export class StationAudio {
  constructor() { this.ctx = null; this.enabled = false; this.birdT = null; }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3.5;
    this.master.connect(comp).connect(ctx.destination);
    // open-air reverb: shorter and brighter than a hall
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 900 ? .3 : 1); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = .55; this.verbIn.connect(this.verb).connect(this.master);
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), nd = nb.getChannelData(0);
    let b = 0; for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b = (b + .02 * w) / 1.02; nd[i] = w * .6 + b * 3; }
    this.noise = nb;
    // evening air: wind that breathes, a far-off town hum
    const wind = ctx.createBufferSource(); wind.buffer = nb; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 520;
    const wg = ctx.createGain(); wg.gain.value = .05;
    const lfo = ctx.createOscillator(), la = ctx.createGain(); lfo.frequency.value = .09; la.gain.value = .03; lfo.connect(la).connect(wg.gain); lfo.start();
    wind.connect(wf).connect(wg); wg.connect(this.dry); wg.connect(this.verbIn); wind.start();
    const hum = ctx.createOscillator(), hg = ctx.createGain(); hum.frequency.value = 58; hg.gain.value = .012; hum.connect(hg).connect(this.dry); hum.start();
  }
  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) { if (on) this.init(); else return; }
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && ctx.state === 'suspended') ctx.resume();
    this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(on ? .9 : 0, t + (on ? 1 : .35));
    clearTimeout(this.birdT); if (on) this._birds();
    if (!on) setTimeout(() => { if (!this.enabled && ctx.state === 'running') ctx.suspend(); }, 500);
  }
  get live() { return this.enabled && this.ctx && this.ctx.state === 'running'; }
  _out(g, pan) {
    if (pan != null && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); g = p; }
    g.connect(this.dry); g.connect(this.verbIn); return g;
  }
  _noise(t, dur, type, f0, f1, q, peak, attack, pan) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f).connect(g); this._out(g, pan);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + .05); return g;
  }
  _bell(f, t, gain, decay = 1.6, pan) {
    const ctx = this.ctx;
    [[1, 1], [2.4, .4], [4.1, .18], [6.3, .08]].forEach(([m, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain * a, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + decay / Math.sqrt(m));
      o.connect(g); this._out(g, pan); o.start(t); o.stop(t + decay + .05);
    });
  }
  _click(t, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(55, t + .05);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .08);
    o.connect(g).connect(this.dry); o.start(t); o.stop(t + .1);
  }
  // a three-chime horn: one long, one short, pitched slightly high while approaching
  _horn(t, pattern, pan = .6) {
    const ctx = this.ctx, notes = [311.1, 370, 493.9];
    let at = t;
    pattern.forEach(len => {
      const bus = ctx.createGain(); bus.gain.setValueAtTime(.0001, at); bus.gain.exponentialRampToValueAtTime(.16, at + .07); bus.gain.setValueAtTime(.16, at + len - .12); bus.gain.exponentialRampToValueAtTime(.0001, at + len + .18);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = .9;
      const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2600;
      notes.forEach(n => {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(n * 1.025, at); o.frequency.linearRampToValueAtTime(n * 1.01, at + len);
        const v = ctx.createOscillator(), va = ctx.createGain(); v.frequency.value = 5.5; va.gain.value = n * .003; v.connect(va).connect(o.frequency);
        o.connect(f1); o.start(at); o.stop(at + len + .25); v.start(at); v.stop(at + len + .25);
      });
      f1.connect(f2).connect(bus); this._out(bus, pan);
      at += len + .22;
    });
  }
  // the whole arrival over `dur` seconds: crossing bells, horn, electric motor winding down, wheels, brakes, air
  // railroad crossing bells off to the right, swelling in and fading out
  bells(dur = 8) {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    for (let k = 0, x = 0; x < dur; k++, x += .46) this._bell(1520, t + x, .05 * Math.min(1, (k + 1) / 4) * Math.min(1, (dur - x) / 2), .5, .55);
  }
  arrive(dur = 6, { bells = true } = {}) {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (bells) for (let k = 0, x = 0; x < dur - .4; k++, x += .46) this._bell(1520, t + x, .05 * Math.min(1, (k + 1) / 3) * Math.min(1, (dur - x) / 1.5), .5, -.55);
    this._horn(t + .5, [1.3, .45], .75);
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(.95, t); pan.pan.linearRampToValueAtTime(-.05, t + dur); pan.connect(this.dry); pan.connect(this.verbIn); }
    const dest = pan || this.dry;
    const rumble = ctx.createBufferSource(); rumble.buffer = this.noise; rumble.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.setValueAtTime(1100, t); rf.frequency.exponentialRampToValueAtTime(150, t + dur);
    const rg = ctx.createGain(); rg.gain.setValueAtTime(.0001, t); rg.gain.exponentialRampToValueAtTime(.5, t + dur * .35); rg.gain.exponentialRampToValueAtTime(.0001, t + dur + .5);
    rumble.connect(rf).connect(rg).connect(dest); rumble.start(t); rumble.stop(t + dur + .6);
    // electric traction: two tones winding down as it brakes
    [[620, 170, 'sawtooth', .035], [1240, 420, 'sine', .018]].forEach(([a, b, type, g0]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(); o.type = type; f.type = 'lowpass'; f.frequency.value = 2400;
      o.frequency.setValueAtTime(a, t); o.frequency.exponentialRampToValueAtTime(b, t + dur);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(g0, t + dur * .4); g.gain.exponentialRampToValueAtTime(.0001, t + dur + .1);
      o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + dur + .2);
    });
    for (let x = .4; x < dur * .92;) { this._click(t + x, .13 * (1 - x / dur) + .02); x += .085 + Math.pow(x / dur, 2.2) * .55; }
    const s = ctx.createOscillator(), sg = ctx.createGain(); s.type = 'sine';
    s.frequency.setValueAtTime(2300, t + dur * .72); s.frequency.exponentialRampToValueAtTime(1780, t + dur);
    sg.gain.setValueAtTime(.0001, t); sg.gain.setValueAtTime(.0001, t + dur * .72); sg.gain.exponentialRampToValueAtTime(.018, t + dur * .84); sg.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
    s.connect(sg); this._out(sg, -.1); s.start(t); s.stop(t + dur + .1);
    this._noise(t + dur + .15, 1.5, 'highpass', 2500, 5600, .7, .1, .05, -.1);
  }
  // platform announcement chime
  chime() {
    if (!this.live) return;
    const t0 = this.ctx.currentTime;
    [[72, 0], [76, .32], [79, .64]].forEach(([n, d]) => this._bell(NOTE(n), t0 + d, .06, 2.2, 0));
  }
  doors(count = 1) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime;
    this._bell(NOTE(88), t0, .03, .6, 0); this._bell(NOTE(84), t0 + .22, .03, .9, 0);
    for (let i = 0; i < count; i++) {
      const t = t0 + .45 + i * .16, pan = (i / Math.max(1, count - 1)) * 1.2 - .6;
      this._noise(t, .5, 'bandpass', 1600, 520, 2, .08, .05, pan);
      this._click(t + .48, .14);
    }
  }
  _birds() {
    if (!this.live) return;
    const ctx = this.ctx, t0 = ctx.currentTime, n = 2 + (Math.random() * 3 | 0), pan = Math.random() * 1.6 - .8, base = 2600 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (.11 + Math.random() * .08), o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * .4), t + .05); o.frequency.exponentialRampToValueAtTime(base * .9, t + .09);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.012, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .1);
      o.connect(g); this._out(g, pan); o.start(t); o.stop(t + .12);
    }
    this.birdT = setTimeout(() => this._birds(), 5000 + Math.random() * 9000);
  }
  // first-person foley: sitting on the bench, handling the ticket, standing up
  sit() {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this._noise(t, .5, 'lowpass', 1400, 500, .7, .09, .12, 0);            // clothes
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle';  // bench creak
    o.frequency.setValueAtTime(140, t + .35); o.frequency.exponentialRampToValueAtTime(96, t + .7);
    g.gain.setValueAtTime(.0001, t + .35); g.gain.exponentialRampToValueAtTime(.05, t + .4); g.gain.exponentialRampToValueAtTime(.0001, t + .75);
    o.connect(g).connect(this.dry); o.start(t + .35); o.stop(t + .8);
    this._click(t + .38, .2);
  }
  paper() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this._noise(t + i * .045 + Math.random() * .03, .06 + Math.random() * .05, 'highpass', 2600 + Math.random() * 2000, 5200, .6, .05 + Math.random() * .04, .004, (Math.random() - .5) * .3);
  }
  stand() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this._noise(t, .7, 'lowpass', 900, 1600, .7, .08, .3, 0);
    this._click(t + .62, .3); this._click(t + 1.02, .22);                 // two footsteps
  }
  // UI
  // the departures board: a soft patter of split-flap leaves settling
  clatter(dur = .7) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime, n = 14 + (Math.random() * 8 | 0);
    for (let i = 0; i < n; i++) { const t = t0 + Math.pow(Math.random(), 1.4) * dur; this._noise(t, .025, 'bandpass', 2600 + Math.random() * 1600, 2000, 5, .02 + Math.random() * .02, .002, -.5 + Math.random() * .3); }
  }
  tick() {
    if (!this.live) return;
    const t = this.ctx.currentTime; this._noise(t, .045, 'bandpass', 3400, 2600, 6, .06, .003, 0);
  }
  beep(p = 1) {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [0, .09].forEach((d, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = (i ? 1568 : 1319) * p;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.03, t + d + .006); g.gain.exponentialRampToValueAtTime(.0001, t + d + .08);
      o.connect(f).connect(g); g.connect(this.dry); o.start(t + d); o.stop(t + d + .1);
    });
  }
  punch() {
    if (!this.live) return;
    const t = this.ctx.currentTime; this._noise(t, .09, 'highpass', 1800, 4200, .8, .22, .002, 0); this._click(t, .25);
  }
  board() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this._bell(NOTE(84), t, .035, .9, 0);
    this._noise(t + .1, 1.4, 'bandpass', 300, 3600, 1.1, .18, .9, 0);
  }
}
