// ---------- sound (recorded takes from SFX_DATA, synthesised when they are missing) ----------
const Sfx = {
  // most events play a short recorded take (05-sound-data, made with earshot by tools/sfx.mjs), pitched and levelled
  // by the same parameters as before; the synth below plays whenever a take is missing, not decoded yet or switched off.
  // The mix is close, soft and a little wet: crisp sugar, sticky taffy, no harsh edges
  ac: null,
  out: null,
  noise: null,
  on: true,
  lastPop: 0,
  lastBoing: 0,
  pan: 0,
  buf: null, // event -> {g, b: [{buf, o}], n}: decoded takes, o = where the sound starts in the buffer
  useBuf: true,
  ready: null,
  decodeMs: -1,
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
      this.load();
    } catch (e) {
      this.ac = null;
    }
  },
  load() {
    // decode every embedded take off the main thread; an event plays as soon as its first take is ready
    const ac = this.ac,
      t0 = performance.now(),
      jobs = [];
    this.buf = {};
    for (const k in SFX_DATA) {
      const d = SFX_DATA[k],
        e = { g: d.g, b: [], n: -1 };
      for (const b64 of d.r)
        jobs.push(
          new Promise((res) => {
            const ok = (buf) => {
              const c = buf.getChannelData(0);
              let i = 0;
              while (i < c.length - 1 && Math.abs(c[i]) < 0.003) i++; // skip the decoder's leading padding
              e.b.push({ buf, o: Math.max(0, i - 24) / buf.sampleRate });
              this.buf[k] = e;
              res(true);
            };
            try {
              const s = atob(b64),
                u = new Uint8Array(s.length);
              for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
              const p = ac.decodeAudioData(u.buffer, ok, () => res(false));
              if (p && p.catch) p.catch(() => res(false));
            } catch (err) {
              res(false);
            }
          }),
        );
    }
    this.ready = Promise.all(jobs).then((r) => {
      this.decodeMs = performance.now() - t0;
      return r.filter((x) => !x).length; // takes that failed to decode
    });
  },
  play(k, v, rate, to, dur) {
    // one recorded take of event k: v scales the level, rate the pitch and speed; dur cuts it short with a fade
    const e = this.useBuf && this.buf && this.buf[k];
    if (!e || !e.b.length) return false;
    const n = e.b.length,
      i = (e.n = n > 1 ? (Math.max(0, e.n) + 1 + Math.floor(Math.random() * (n - 1))) % n : 0), // never the same take twice
      ac = this.ac,
      t = ac.currentTime,
      s = ac.createBufferSource(),
      g = ac.createGain(),
      lv = Math.max(0.0001, e.g * v);
    s.buffer = e.b[i].buf;
    s.playbackRate.value = rate;
    g.gain.value = lv;
    s.connect(g);
    g.connect(to || this.out);
    s.start(t, e.b[i].o);
    if (dur) {
      g.gain.setValueAtTime(lv, t + dur);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.06);
      s.stop(t + dur + 0.08);
    }
    return true;
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
    if (this.play('chomp', v, p * rand(0.95, 1.05), to)) return;
    this.hiss(t, 5200 * j, 2600, 0.7, 0.2 * v, 0.028, 'highpass', to);
    this.hiss(t + 0.004, 1500 * p * j, 230 * p, 1.2, 0.5 * v, 0.11, 'bandpass', to);
    this.tone(t, 'sine', 200 * p, 58 * p, 0.55 * v, 0.13, 0.006, to);
    this.hiss(t + 0.055, 760 * p * j, 280 * p, 2.6, 0.2 * v, 0.075, 'bandpass', to);
  },
  stretch(dur = 0.35, p = 1) {
    // taffy pulled thin: a soft rising creak under the string
    if (!this.ok()) return;
    if (this.play('stretch', 1, p, null, dur)) return;
    const t = this.ac.currentTime + 0.03;
    this.tone(t, 'triangle', 150 * p, 380 * p, 0.055, dur, 0.05);
    this.hiss(t, 520 * p, 1500 * p, 9, 0.11, dur);
  },
  snap(v = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime,
      to = this.dest();
    if (this.play('snap', v, rand(0.92, 1.1), to)) return;
    this.tone(t, 'sine', rand(560, 680), 170, 0.26 * v, 0.055, 0.003, to);
    this.hiss(t, 3600, 1400, 0.8, 0.09 * v, 0.03, 'highpass', to);
  }, // the string lets go with a soft pop
  munch() {
    if (!this.ok() || this.play('munch', 1, rand(0.88, 1.15))) return;
    const t = this.ac.currentTime,
      f = rand(480, 880);
    this.hiss(t, f, f * 0.4, 2.2, 0.2, 0.06);
    this.hiss(t, 4200, 2800, 0.8, 0.06, 0.02, 'highpass');
  }, // each chew is a little different
  bloop(p = 1) {
    if (!this.ok() || this.play('bloop', 1, p)) return;
    const t = this.ac.currentTime;
    this.tone(t, 'sine', 250 * p, 120 * p, 0.2, 0.06, 0.006);
    this.tone(t + 0.06, 'sine', 170 * p, 420 * p, 0.2, 0.09, 0.008);
  }, // down the throat
  ding(step) {
    // a soft bell, one note higher for every bite in a streak
    if (!this.ok()) return;
    const r = [1, 1.125, 1.25, 1.5, 1.667][clamp(step - 2, 0, 4)];
    if (this.play('ding', 1, r)) return; // the take is a C5, like the synth's first note
    const t = this.ac.currentTime + 0.04,
      f = 523.25 * r;
    this.tone(t, 'sine', f, f, 0.14, 0.4, 0.004);
    this.tone(t, 'sine', f * 2.76, f * 2.76, 0.035, 0.16, 0.003);
    this.tone(t, 'sine', f * 5.4, f * 5.4, 0.012, 0.06, 0.002);
  },
  hurt() {
    if (!this.ok() || this.play('hurt', 1, rand(0.96, 1.04))) return;
    const t = this.ac.currentTime;
    this.hiss(t, 700, 150, 1.4, 0.45, 0.17);
    this.tone(t, 'sine', 140, 52, 0.6, 0.2);
  },
  gulp(v = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime,
      to = this.dest();
    if (this.play('gulp', v, rand(0.96, 1.04), to)) return;
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
    if (this.play('pop', 1, rand(0.85, 1.2))) return;
    const f = rand(1500, 2600);
    this.tone(t, 'sine', f, f * 0.55, 0.05, 0.03, 0.002);
    this.hiss(t, rand(5000, 7500), 3500, 1.2, 0.05, 0.014, 'highpass');
  },
  boing(v = 1) {
    if (!this.ok()) return;
    const t = this.ac.currentTime;
    if (t - this.lastBoing < 0.25) return;
    this.lastBoing = t;
    if (this.play('boing', v, rand(0.9, 1.1))) return;
    const f = rand(95, 125);
    this.tone(t, 'sine', f * 1.5, f, 0.3 * v, 0.2, 0.01);
    this.tone(t + 0.09, 'sine', f * 1.2, f * 0.9, 0.12 * v, 0.16, 0.02);
  }, // jelly bumping into jelly
  thwip() {
    if (!this.ok() || this.play('thwip', 1, rand(0.96, 1.04))) return;
    const t = this.ac.currentTime;
    this.tone(t, 'triangle', 500, 1500, 0.2, 0.09);
    this.hiss(t, 1200, 3500, 1, 0.11, 0.08);
  },
  squelch() {
    if (!this.ok() || this.play('squelch', 1, rand(0.96, 1.04))) return;
    const t = this.ac.currentTime;
    this.hiss(t, 700, 180, 3, 0.4, 0.14);
    this.tone(t, 'sine', 260, 90, 0.35, 0.12);
  },
  power() {
    if (!this.ok() || this.play('power', 1, rand(0.96, 1.04))) return;
    const t = this.ac.currentTime;
    this.tone(t, 'sine', 523, 523, 0.16, 0.3, 0.004);
    this.tone(t + 0.09, 'sine', 784, 784, 0.14, 0.34, 0.004);
    this.tone(t + 0.18, 'sine', 1046, 1046, 0.1, 0.4, 0.004);
  },
  dash() {
    if (!this.ok() || this.play('dash', 1, rand(0.96, 1.04))) return;
    const t = this.ac.currentTime;
    this.hiss(t, 260, 1700, 0.7, 0.24, 0.22);
  },
};
