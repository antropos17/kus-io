// ---------- sound (synthesised, no files) ----------
const Sfx = {
  // every sound is made on the spot. The mix is close, soft and a little wet: crisp sugar, sticky taffy, no harsh edges
  ac: null,
  out: null,
  noise: null,
  on: true,
  lastPop: 0,
  lastBoing: 0,
  pan: 0,
  init() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ac = (this.ac = new AC());
      this.out = ac.createGain();
      this.out.gain.value = 0.55;
      const warm = ac.createBiquadFilter();
      warm.type = 'lowpass';
      warm.frequency.value = 9500;
      warm.Q.value = 0.3; // nothing shrill gets through
      const comp = ac.createDynamicsCompressor();
      this.out.connect(warm);
      warm.connect(comp);
      comp.connect(ac.destination);
      const len = ac.sampleRate,
        buf = ac.createBuffer(1, len, ac.sampleRate),
        d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      try {
        // a small soft room, so sounds sit close to the ear instead of in a void
        const n = Math.floor(ac.sampleRate * 0.24),
          ir = ac.createBuffer(2, n, ac.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const q = ir.getChannelData(ch);
          for (let i = 0; i < n; i++) q[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.4);
        }
        const cv = ac.createConvolver(),
          wet = ac.createGain();
        cv.buffer = ir;
        wet.gain.value = 0.13;
        warm.connect(cv);
        cv.connect(wet);
        wet.connect(comp);
      } catch (e) {}
      if (ac.state === 'suspended') ac.resume().catch(() => {});
    } catch (e) {
      this.ac = null;
    }
  },
  ok() {
    return this.ac && this.on && this.ac.state === 'running';
  },
  at(x) {
    this.pan = clamp(((x - cam.x) * cam.z) / (W * 0.6), -0.8, 0.8);
    return this;
  }, // where on the screen the next sound comes from
  dest() {
    // left or right ear for things that happen off to the side
    const p = this.pan;
    this.pan = 0;
    if ((p > -0.1 && p < 0.1) || !this.ac.createStereoPanner) return this.out;
    const n = this.ac.createStereoPanner();
    n.pan.value = p;
    n.connect(this.out);
    return n;
  },
  env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  },
  hiss(t, f0, f1, q, peak, dur, type = 'bandpass', to = this.out) {
    const ac = this.ac,
      s = ac.createBufferSource(),
      f = ac.createBiquadFilter(),
      g = ac.createGain();
    s.buffer = this.noise;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, 0.005, peak, dur);
    s.connect(f);
    f.connect(g);
    g.connect(to);
    s.start(t, Math.random() * 0.8);
    s.stop(t + dur + 0.05);
  },
  tone(t, type, f0, f1, peak, dur, a = 0.008, to = this.out) {
    const ac = this.ac,
      o = ac.createOscillator(),
      g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, a, peak, dur);
    o.connect(g);
    g.connect(to);
    o.start(t);
    o.stop(t + a + dur + 0.05);
  },
  chomp(v = 1, p = 1) {
    // teeth through a sugar shell into soft filling: a crack, a wet squish, a low thump, then the lips smack
    if (!this.ok()) return;
    const t = this.ac.currentTime,
      to = this.dest(),
      j = rand(0.92, 1.08);
    this.hiss(t, 5200 * j, 2600, 0.7, 0.2 * v, 0.028, 'highpass', to);
    this.hiss(t + 0.004, 1500 * p * j, 230 * p, 1.2, 0.5 * v, 0.11, 'bandpass', to);
    this.tone(t, 'sine', 200 * p, 58 * p, 0.55 * v, 0.13, 0.006, to);
    this.hiss(t + 0.055, 760 * p * j, 280 * p, 2.6, 0.2 * v, 0.075, 'bandpass', to);
  },
  stretch(dur = 0.35, p = 1) {
    // taffy pulled thin: a soft rising creak under the string
    if (!this.ok()) return;
    const t = this.ac.currentTime + 0.03;
    this.tone(t, 'triangle', 150 * p, 380 * p, 0.055, dur, 0.05);
    this.hiss(t, 520 * p, 1500 * p, 9, 0.11, dur);
  },
  snap(v = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime,
      to = this.dest();
    this.tone(t, 'sine', rand(560, 680), 170, 0.26 * v, 0.055, 0.003, to);
    this.hiss(t, 3600, 1400, 0.8, 0.09 * v, 0.03, 'highpass', to);
  }, // the string lets go with a soft pop
  munch() {
    if (!this.ok()) return;
    const t = this.ac.currentTime,
      f = rand(480, 880);
    this.hiss(t, f, f * 0.4, 2.2, 0.2, 0.06);
    this.hiss(t, 4200, 2800, 0.8, 0.06, 0.02, 'highpass');
  }, // each chew is a little different
  bloop(p = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    this.tone(t, 'sine', 250 * p, 120 * p, 0.2, 0.06, 0.006);
    this.tone(t + 0.06, 'sine', 170 * p, 420 * p, 0.2, 0.09, 0.008);
  }, // down the throat
  ding(step) {
    // a soft bell, one note higher for every bite in a streak
    if (!this.ok()) return;
    const t = this.ac.currentTime + 0.04,
      f = 523.25 * [1, 1.125, 1.25, 1.5, 1.667][clamp(step - 2, 0, 4)];
    this.tone(t, 'sine', f, f, 0.14, 0.4, 0.004);
    this.tone(t, 'sine', f * 2.76, f * 2.76, 0.035, 0.16, 0.003);
    this.tone(t, 'sine', f * 5.4, f * 5.4, 0.012, 0.06, 0.002);
  },
  hurt() {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    this.hiss(t, 700, 150, 1.4, 0.45, 0.17);
    this.tone(t, 'sine', 140, 52, 0.6, 0.2);
  },
  gulp(v = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime,
      to = this.dest();
    this.tone(t, 'sine', 320, 90, 0.7 * v, 0.16, 0.01, to);
    this.tone(t + 0.12, 'sine', 150, 300, 0.45 * v, 0.14, 0.012, to);
    this.hiss(t, 500, 160, 2, 0.2 * v, 0.14, 'bandpass', to);
  },
  pop() {
    // a grain of sugar between the teeth: a tiny crisp tick, never twice the same
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    if (t - this.lastPop < 0.045) return;
    this.lastPop = t;
    const f = rand(1500, 2600);
    this.tone(t, 'sine', f, f * 0.55, 0.05, 0.03, 0.002);
    this.hiss(t, rand(5000, 7500), 3500, 1.2, 0.05, 0.014, 'highpass');
  },
  boing(v = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    if (t - this.lastBoing < 0.25) return;
    this.lastBoing = t;
    const f = rand(95, 125);
    this.tone(t, 'sine', f * 1.5, f, 0.3 * v, 0.2, 0.01);
    this.tone(t + 0.09, 'sine', f * 1.2, f * 0.9, 0.12 * v, 0.16, 0.02);
  }, // jelly bumping into jelly
  thwip() {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    this.tone(t, 'triangle', 500, 1500, 0.2, 0.09);
    this.hiss(t, 1200, 3500, 1, 0.11, 0.08);
  },
  squelch() {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    this.hiss(t, 700, 180, 3, 0.4, 0.14);
    this.tone(t, 'sine', 260, 90, 0.35, 0.12);
  },
  power() {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    this.tone(t, 'sine', 523, 523, 0.16, 0.3, 0.004);
    this.tone(t + 0.09, 'sine', 784, 784, 0.14, 0.34, 0.004);
    this.tone(t + 0.18, 'sine', 1046, 1046, 0.1, 0.4, 0.004);
  },
  dash() {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    this.hiss(t, 260, 1700, 0.7, 0.24, 0.22);
  },
};
