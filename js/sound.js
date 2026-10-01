// Synthesized sound design: every sound is generated live with the Web Audio API.
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

// One chord per section. The pad glides between them as you scroll.
const CHORDS = [
  [50, 57, 64, 65],   // hero: D minor add9   (D3 A3 E4 F4)
  [46, 53, 57, 62],   // standings: Bb maj7   (Bb2 F3 A3 D4)
  [53, 60, 64, 67],   // results: F maj9      (F3 C4 E4 G4)
  [50, 55, 57, 64]    // footer: Dsus4 add9   (D3 G3 A3 E4)
];
const SHIMMER = [86, 89, 91, 93, 96, 98]; // D6 F6 G6 A6 C7 D7

export class Sound {
  constructor() { this.ctx = null; this.enabled = false; this.lastTick = 0; this.section = 0; }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // Reverb from a generated impulse: a long, dark, stereo tail
    const len = ctx.sampleRate * 3.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.verb = ctx.createConvolver(); this.verb.buffer = ir;
    this.verbIn = ctx.createGain(); this.verbIn.gain.value = 0.9;
    const verbTone = ctx.createBiquadFilter(); verbTone.type = 'lowpass'; verbTone.frequency.value = 5200;
    this.verbIn.connect(this.verb).connect(verbTone).connect(this.master);
    this.dry = ctx.createGain(); this.dry.connect(this.master);

    // Noise buffer, shared by wind, whooshes and ticks
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;

    // Ambient pad
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 650; this.padFilter.Q.value = 0.8;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.055;
    this.padFilter.connect(this.padGain); this.padGain.connect(this.dry); this.padGain.connect(this.verbIn);
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain(); lfo.frequency.value = 0.07; lfoAmt.gain.value = 220;
    lfo.connect(lfoAmt).connect(this.padFilter.frequency); lfo.start();
    this.voices = CHORDS[0].map((n, i) => {
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.32; g.connect(this.padFilter);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const oscs = [['triangle', -7], ['sawtooth', 6]].map(([type, cents]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = NOTE(n); o.detune.value = cents;
        const og = ctx.createGain(); og.gain.value = type === 'sawtooth' ? 0.35 : 1;
        o.connect(og); og.connect(pan || g); o.start(); return o;
      });
      if (pan) { pan.pan.value = [-0.5, 0.35, -0.2, 0.55][i]; pan.connect(g); }
      return oscs;
    });
    // Sub drone
    const sub = ctx.createOscillator(), subG = ctx.createGain(); sub.type = 'sine'; sub.frequency.value = NOTE(38); subG.gain.value = 0.05;
    sub.connect(subG).connect(this.dry); sub.start(); this.sub = sub;
    // Icy air
    const air = ctx.createBufferSource(); air.buffer = nb; air.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 7000; airF.Q.value = 0.6;
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0.004;
    air.connect(airF).connect(this.airGain).connect(this.verbIn); air.start();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) { if (on) this.init(); else return; }
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && ctx.state === 'suspended') ctx.resume();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(on ? 0.9 : 0, t + (on ? 1.8 : 0.4));
    if (!on) setTimeout(() => { if (!this.enabled && ctx.state === 'running') ctx.suspend(); }, 600);
  }
  get live() { return this.enabled && this.ctx && this.ctx.state === 'running'; }

  setSection(i) {
    if (!this.ctx || i === this.section) return;
    this.section = i;
    const t = this.ctx.currentTime;
    CHORDS[i].forEach((n, v) => this.voices[v].forEach(o => o.frequency.setTargetAtTime(NOTE(n), t, 0.45)));
    this.sub.frequency.setTargetAtTime(NOTE(CHORDS[i][0] - 12), t, 0.6);
  }
  setEnergy(v) { // 0..1, from scroll speed
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.padFilter.frequency.setTargetAtTime(650 + v * 1700, t, 0.25);
    this.airGain.gain.setTargetAtTime(0.004 + v * 0.018, t, 0.3);
  }

  whoosh(dur = 1.3, rise = true) {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(rise ? 280 : 3200, t);
    f.frequency.exponentialRampToValueAtTime(rise ? 3400 : 260, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.7, t); p.pan.linearRampToValueAtTime(0.7, t + dur); g.connect(p); out = p; }
    src.connect(f).connect(g); out.connect(this.dry); out.connect(this.verbIn);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  blip(pitch = 1) {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(1320 * pitch, t); o.frequency.exponentialRampToValueAtTime(1760 * pitch, t + 0.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g); g.connect(this.dry); g.connect(this.verbIn); o.start(t); o.stop(t + 0.13);
  }
  click() { this.blip(0.75); setTimeout(() => this.blip(1.125), 55); }
  tick() {
    if (!this.live) return;
    const now = performance.now(); if (now - this.lastTick < 38) return; this.lastTick = now;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3800 + Math.random() * 1500; f.Q.value = 8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(f).connect(g).connect(this.dry); src.start(t, Math.random()); src.stop(t + 0.04);
  }
  shimmer(count = 5) {
    if (!this.live) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < count; i++) {
      const t = t0 + i * 0.07 + Math.random() * 0.03;
      const n = SHIMMER[(Math.random() * SHIMMER.length) | 0];
      const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = NOTE(n);
      m.frequency.value = NOTE(n) * 2.01; mg.gain.value = NOTE(n) * 0.6; m.connect(mg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g); g.connect(this.verbIn); g.connect(this.dry);
      o.start(t); m.start(t); o.stop(t + 1.5); m.stop(t + 1.5);
    }
  }
  impact() {
    if (!this.live) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(this.dry); g.connect(this.verbIn); o.start(t); o.stop(t + 1);
    this.whoosh(1.6, false); this.shimmer(6);
  }
}
