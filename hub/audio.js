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
    this.outDry = this.dry; this.outVerb = this.verbIn;
    if (this.sceneWanted) this.beginScene();
  }
  // Everything the opening plays (bells, horn, the train pulling in, foley) goes through its own pair of gains,
  // so skipping the opening can fade all of it out at once, including sounds already scheduled ahead.
  beginScene() {
    this.endScene(0);
    if (!this.ctx) { this.sceneWanted = true; return; } // sound comes on later: start routing then
    this.sceneWanted = false;
    const s = this.scene = [this.ctx.createGain(), this.ctx.createGain()];
    s[0].connect(this.dry); s[1].connect(this.verbIn); [this.outDry, this.outVerb] = s;
  }
  endScene(fade = .4) {
    this.sceneWanted = false;
    const s = this.scene; if (!s) return;
    this.scene = null; this.outDry = this.dry; this.outVerb = this.verbIn;
    const t = this.ctx.currentTime;
    s.forEach(g => { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + Math.max(.01, fade)); });
    setTimeout(() => s.forEach(g => g.disconnect()), fade * 1000 + 200);
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
    g.connect(this.outDry); g.connect(this.outVerb); return g;
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
    o.connect(g).connect(this.outDry); o.start(t); o.stop(t + .1);
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
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(.95, t); pan.pan.linearRampToValueAtTime(-.05, t + dur); pan.connect(this.outDry); pan.connect(this.outVerb); }
    const dest = pan || this.outDry;
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
  // riding: wheel rumble, traction whine and rail joints that follow the speed. Returns { set(speed 0..1), stop() }.
  ride() {
    if (!this.ctx) return { set() {}, stop() {} };
    const ctx = this.ctx, t = ctx.currentTime, bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.dry); bus.connect(this.verbIn);
    const rumble = ctx.createBufferSource(); rumble.buffer = this.noise; rumble.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 200; const rg = ctx.createGain(); rg.gain.value = .5;
    rumble.connect(rf).connect(rg).connect(bus); rumble.start(t);
    const tones = [[180, 'sawtooth', .03], [360, 'sine', .016]].map(([f, type, g0]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), f2 = ctx.createBiquadFilter(); o.type = type; o.frequency.value = f; f2.type = 'lowpass'; f2.frequency.value = 2200; g.gain.value = g0;
      o.connect(f2).connect(g).connect(bus); o.start(t); return { o, f };
    });
    let speed = 0, next = 0, dead = false;
    const joints = () => { if (dead) return; if (this.live && speed > .15) { const n = ctx.currentTime; this._click(n, .07 * speed); this._click(n + .11, .06 * speed); } setTimeout(joints, 240 + (1 - speed) * 900); };
    joints();
    return {
      set: v => {
        speed = v; const n = ctx.currentTime;
        bus.gain.setTargetAtTime(this.enabled ? .08 + v * .5 : 0, n, .25); rf.frequency.setTargetAtTime(200 + v * 900, n, .3);
        tones.forEach(({ o, f }) => o.frequency.setTargetAtTime(f * (.9 + v * 2.6), n, .3));
      },
      stop: () => { dead = true; const n = ctx.currentTime; bus.gain.setTargetAtTime(0, n, .4); setTimeout(() => { rumble.stop(); tones.forEach(x => x.o.stop()); bus.disconnect(); }, 2500); }
    };
  }
  // An original song in your headphones during the opening: slow, moody, dreamy indie (84 bpm, minor key):
  // echoing clean-guitar arpeggios, a deep round bass, half-time drums and a soft pad. It's quiet and dry (not in the
  // station's reverb, since it's in your ears), under the station sounds, and goes through the opening's own gains,
  // so skipping cuts it too. Returns { stop(fade) }.
  music() {
    if (!this.ctx) return { stop() {} };
    const ctx = this.ctx, bus = ctx.createGain(), tone = ctx.createBiquadFilter(), BEAT = 60 / 84;
    tone.type = 'lowpass'; tone.frequency.value = 3800; bus.gain.value = 0;
    bus.connect(tone).connect(this.outDry);
    bus.gain.setValueAtTime(0, ctx.currentTime); bus.gain.linearRampToValueAtTime(.17, ctx.currentTime + 2.2);
    // a dotted-eighth echo for the guitar, like a delay pedal
    const echo = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), damp = ctx.createBiquadFilter();
    echo.delayTime.value = BEAT * .75; fb.gain.value = .38; wet.gain.value = .45; damp.type = 'lowpass'; damp.frequency.value = 2200;
    echo.connect(damp).connect(fb).connect(echo); damp.connect(wet).connect(bus);
    const PROG = [[50, [62, 65, 69, 72, 76]], [46, [62, 65, 69, 70, 74]], [43, [62, 67, 70, 74, 77]], [45, [61, 64, 69, 73, 76]]]; // Dm9, Bbmaj7, Gm7, A7
    const pluck = (n, t, g) => { // a clean guitar string: a bright triangle that fades fast, into the echo
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), v = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'triangle'; o.frequency.value = NOTE(n); o2.type = 'sine'; o2.frequency.value = NOTE(n) * 2.003;
      f.type = 'lowpass'; f.frequency.setValueAtTime(3600, t); f.frequency.exponentialRampToValueAtTime(900, t + .6);
      v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(g, t + .006); v.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
      o.connect(f); o2.connect(f); f.connect(v); v.connect(bus); v.connect(echo);
      o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
    };
    const pad = (ns, t, len) => ns.slice(0, 3).forEach(n => { // a soft swell under it all
      const o = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sine'; o.frequency.value = NOTE(n - 12); o.detune.value = (Math.random() - .5) * 8;
      v.gain.setValueAtTime(.0001, t); v.gain.linearRampToValueAtTime(.022, t + len * .4); v.gain.linearRampToValueAtTime(.0001, t + len); o.connect(v).connect(bus); o.start(t); o.stop(t + len + .05);
    });
    const bass = (n, t, len) => { const o = ctx.createOscillator(), v = ctx.createGain(); o.type = 'sine'; o.frequency.value = NOTE(n - 12); v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(.42, t + .02); v.gain.setValueAtTime(.42, t + len * .7); v.gain.exponentialRampToValueAtTime(.0001, t + len); o.connect(v).connect(bus); o.start(t); o.stop(t + len + .05); };
    const kick = t => { const o = ctx.createOscillator(), v = ctx.createGain(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + .16); v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(.6, t + .005); v.gain.exponentialRampToValueAtTime(.0001, t + .4); o.connect(v).connect(bus); o.start(t); o.stop(t + .42); };
    const hiss = (t, dur, type, f, peak, toEcho) => { const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), v = ctx.createGain(); src.buffer = this.noise; fl.type = type; fl.frequency.value = f; fl.Q.value = .7; v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(peak, t + .004); v.gain.exponentialRampToValueAtTime(.0001, t + dur); src.connect(fl).connect(v).connect(bus); if (toEcho) v.connect(echo); src.start(t, Math.random() * 2); src.stop(t + dur + .02); };
    const ARP = [0, 2, 1, 3, 2, 4, 3, 2]; // eighth-note picking pattern across the chord
    let bar = 0, next = ctx.currentTime + .1, dead = false;
    const schedule = () => {
      if (dead) return;
      while (next < ctx.currentTime + .7) {
        const [root, ch] = PROG[bar % 4], t0 = next;
        ARP.forEach((k, i) => pluck(ch[k], t0 + i * BEAT / 2 + (i % 2) * .012, i === 0 ? .07 : .05));
        bass(root, t0, BEAT * 2.6); bass(root, t0 + BEAT * 3, BEAT * .9); pad(ch, t0, BEAT * 4.2);
        if (bar >= 1) { // drums come in after the first bar: kick on 1 (and the and of 3), a roomy snare on 3, soft hats
          kick(t0); kick(t0 + BEAT * 2.5); hiss(t0 + BEAT * 2, .32, 'bandpass', 1700, .13, true);
          for (let i = 0; i < 8; i++) hiss(t0 + i * BEAT / 2, .045, 'highpass', 7500, i % 2 ? .016 : .028);
        }
        bar++; next += BEAT * 4;
      }
      setTimeout(schedule, 200);
    };
    schedule();
    return { stop: (fade = 1.2) => { if (dead) return; dead = true; const t = ctx.currentTime; bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + fade); setTimeout(() => { bus.disconnect(); fb.disconnect(); }, fade * 1000 + 4000); } };
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
    o.connect(g).connect(this.outDry); o.start(t + .35); o.stop(t + .8);
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
      o.connect(f).connect(g); g.connect(this.outDry); o.start(t + d); o.stop(t + d + .1);
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
