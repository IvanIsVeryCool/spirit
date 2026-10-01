// Station sound design, synthesized live with the Web Audio API (no audio files).
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);

export class StationAudio {
  constructor() { this.ctx = null; this.enabled = false; }
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    // a big, dark hall reverb
    const len = ctx.sampleRate * 4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2); }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    const vt = ctx.createBiquadFilter(); vt.type = 'lowpass'; vt.frequency.value = 4200;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = .8;
    this.verbIn.connect(this.verb).connect(vt).connect(this.master);
    this.dry = ctx.createGain(); this.dry.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), nd = nb.getChannelData(0);
    let b = 0; for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b = (b + .02 * w) / 1.02; nd[i] = w * .6 + b * 3; }
    this.noise = nb;
    // station room tone: a low drone and moving air
    const drone = ctx.createGain(); drone.gain.value = .045; drone.connect(this.dry); drone.connect(this.verbIn);
    [[33, 'sine', 1], [40, 'sine', .5], [57, 'triangle', .12], [64, 'triangle', .08]].forEach(([n, type, g]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = NOTE(n); o.detune.value = (Math.random() - .5) * 8; og.gain.value = g; o.connect(og).connect(drone); o.start();
    });
    const air = ctx.createBufferSource(); air.buffer = nb; air.loop = true;
    const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 380;
    const ag = ctx.createGain(); ag.gain.value = .05; air.connect(af).connect(ag).connect(this.verbIn); air.start();
  }
  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) { if (on) this.init(); else return; }
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && ctx.state === 'suspended') ctx.resume();
    this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(on ? .9 : 0, t + (on ? 1.2 : .35));
    if (!on) setTimeout(() => { if (!this.enabled && ctx.state === 'running') ctx.suspend(); }, 500);
  }
  get live() { return this.enabled && this.ctx && this.ctx.state === 'running'; }
  _noise(t, dur, type, f0, f1, q, g0, gPeak, gEnd, attack, dest) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(gPeak, t + attack); g.gain.exponentialRampToValueAtTime(gEnd, t + dur);
    src.connect(f).connect(g); (dest || [this.dry, this.verbIn]).forEach(d => g.connect(d));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + .05);
    return g;
  }

  // the train rolling in from the right and braking to a stop over `dur` seconds
  arrive(dur = 4.6) {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(.9, t); pan.pan.linearRampToValueAtTime(-.1, t + dur); pan.connect(this.dry); pan.connect(this.verbIn); }
    const out = pan ? [pan] : null;
    // body rumble swelling in, then settling
    this._noise(t, dur + .6, 'lowpass', 900, 140, .8, .0001, .55, .0001, dur * .45, out);
    // motor whine dropping in pitch as it slows
    const o = ctx.createOscillator(), og = ctx.createGain(), of = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(48, t + dur);
    of.type = 'bandpass'; of.frequency.value = 420; of.Q.value = 3;
    og.gain.setValueAtTime(.0001, t); og.gain.exponentialRampToValueAtTime(.06, t + dur * .4); og.gain.exponentialRampToValueAtTime(.0001, t + dur + .2);
    o.connect(of).connect(og); (out || [this.dry]).forEach(d => og.connect(d)); o.start(t); o.stop(t + dur + .3);
    // rail clicks that slow down
    let k = 0; for (let x = 0; x < dur * .9; k++) { const gap = .09 + Math.pow(x / dur, 2) * .5; x += gap; this._click(t + x, .12 * (1 - x / dur) + .02); }
    // brake squeal near the end, then the air release
    const s = ctx.createOscillator(), sg = ctx.createGain(); s.type = 'sine';
    s.frequency.setValueAtTime(2400, t + dur * .7); s.frequency.exponentialRampToValueAtTime(1850, t + dur);
    sg.gain.setValueAtTime(.0001, t); sg.gain.setValueAtTime(.0001, t + dur * .7); sg.gain.exponentialRampToValueAtTime(.022, t + dur * .82); sg.gain.exponentialRampToValueAtTime(.0001, t + dur + .05);
    s.connect(sg); sg.connect(this.dry); sg.connect(this.verbIn); s.start(t); s.stop(t + dur + .1);
    this._noise(t + dur, 1.4, 'highpass', 2600, 5200, .7, .0001, .12, .0001, .04);
  }
  _click(t, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + .05);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .08);
    o.connect(g).connect(this.dry); o.start(t); o.stop(t + .1);
  }
  // two-tone station chime, like a platform announcement
  chime() {
    if (!this.live) return;
    const t0 = this.ctx.currentTime;
    [[76, 0], [72, .42], [79, .84]].forEach(([n, d]) => this._bell(NOTE(n), t0 + d, d === .84 ? .05 : .07));
  }
  _bell(f, t, gain) {
    const ctx = this.ctx;
    [[1, 1], [2.76, .35], [5.4, .12]].forEach(([m, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain * a, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + 2.4 / m);
      o.connect(g); g.connect(this.dry); g.connect(this.verbIn); o.start(t); o.stop(t + 2.5);
    });
  }
  doors(count = 1) {
    if (!this.live) return;
    const t0 = this.ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const t = t0 + i * .14;
      this._noise(t, .55, 'bandpass', 1400, 500, 2, .0001, .09, .0001, .06);
      this._click(t + .5, .16);
    }
  }
  blip(p = 1) {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(1100 * p, t); o.frequency.exponentialRampToValueAtTime(1500 * p, t + .05);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.06, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + .12);
    o.connect(g); g.connect(this.dry); g.connect(this.verbIn); o.start(t); o.stop(t + .14);
  }
  // stepping through a door: a rising rush
  board() {
    if (!this.live) return;
    const t = this.ctx.currentTime;
    this._noise(t, 1.3, 'bandpass', 300, 4200, 1.2, .0001, .2, .0001, .9);
    this._bell(NOTE(84), t + .2, .03);
  }
}
