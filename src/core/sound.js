// Sound effects, handed to every module as `ctx.sound`.
//
//   ctx.sound.play('chime', { note: 3, x: 400 });       // one-shot
//   const s = ctx.sound.play('whir', { duration: 1.2 }); s.stop();
//   const seq = ctx.sound.sequence([{ at: 0, name: 'swell' }, { at: 650, name: 'koto' }]);
//
// Everything is synthesised with the Web Audio API (oscillators and filtered
// noise through a compressor and a generated reverb): no audio files, works
// offline. Notes come from one pentatonic scale so overlapping sounds stay in
// tune with each other. `x` (a screen position) pans a sound towards where its
// animation happens.

const SETTINGS_KEY = 'prism:sound';
const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
const ROOT = 220; // A3
const JP_SCALE = [0, 1, 5, 7, 8]; // in-scale (miyako-bushi), for the koto

/** Frequency of scale degree `n` (0 = root; 5 = root an octave up…). */
export const noteHz = (n, scale = SCALE) => {
  const oct = Math.floor(n / scale.length);
  const deg = ((n % scale.length) + scale.length) % scale.length;
  return ROOT * 2 ** (oct + scale[deg] / 12);
};

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------ building blocks
// Every preset receives `c` = { ac, out, rev } so it can render into a live or
// an offline context (the tests render each preset offline).

let noiseBuf = null;
function noiseBuffer(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

function reverbImpulse(ac, seconds = 2.4, decay = 3.2) {
  const len = Math.floor(ac.sampleRate * seconds);
  const b = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return b;
}

/** Route a node to the output (with optional pan and reverb send). Returns the input node. */
function route(c, node, { pan = 0, wet = 0.15 } = {}) {
  let last = node;
  if (pan && c.ac.createStereoPanner) {
    const p = c.ac.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    last.connect(p);
    last = p;
  }
  last.connect(c.out);
  if (wet > 0 && c.rev) {
    const s = c.ac.createGain();
    s.gain.value = wet;
    last.connect(s);
    s.connect(c.rev);
  }
  return node;
}

/** An envelope-shaped gain: attack to `peak`, exponential release. */
function env(c, t, { peak = 0.2, attack = 0.004, hold = 0, release = 0.15 }) {
  hold = Math.max(0, hold);
  const g = c.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return g;
}

function tone(c, t, { type = 'sine', freq = 440, to = null, glide = 0.1, peak = 0.15, attack = 0.004, hold = 0, release = 0.2, pan = 0, wet = 0.15, detune = 0, filter = null }) {
  const o = c.ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + glide);
  o.detune.value = detune;
  const g = env(c, t, { peak, attack, hold, release });
  let head = o;
  if (filter) {
    const f = c.ac.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + (filter.time || release));
    f.Q.value = filter.Q ?? 0.8;
    o.connect(f);
    head = f;
  }
  head.connect(g);
  route(c, g, { pan, wet });
  o.start(t);
  o.stop(t + attack + hold + release + 0.05);
  return o;
}

function noise(c, t, { type = 'bandpass', freq = 2000, to = null, Q = 1, peak = 0.12, attack = 0.002, hold = 0, release = 0.08, pan = 0, wet = 0.1, sweep = null }) {
  const s = c.ac.createBufferSource();
  s.buffer = noiseBuffer(c.ac);
  s.loop = true;
  const f = c.ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + (sweep ?? attack + hold + release));
  f.Q.value = Q;
  const g = env(c, t, { peak, attack, hold, release });
  s.connect(f).connect(g);
  route(c, g, { pan, wet });
  s.start(t, Math.random() * 1.5);
  s.stop(t + attack + hold + release + 0.05);
  return { src: s, gain: g, filter: f };
}

/** A bell: a sine with an inharmonic partial, long soft tail. */
function bell(c, t, { freq, peak = 0.09, release = 0.9, pan = 0, wet = 0.35 }) {
  tone(c, t, { freq, peak, release, pan, wet });
  tone(c, t, { freq: freq * 2.76, peak: peak * 0.35, release: release * 0.45, pan, wet });
  tone(c, t, { freq: freq * 5.4, peak: peak * 0.12, release: release * 0.2, pan, wet });
}

// ------------------------------------------------------------------ presets
// Each preset: (c, t, opts) → optional { stop() } for sustained sounds.
const PRESETS = {
  // --- interface
  click(c, t, { pitch = 1, pan = 0 } = {}) {
    noise(c, t, { freq: 4200 * pitch, Q: 2.5, peak: 0.07, release: 0.018, pan, wet: 0.02 });
    tone(c, t, { freq: 1500 * pitch, to: 900 * pitch, glide: 0.03, peak: 0.05, release: 0.035, pan, wet: 0.04 });
  },
  press(c, t, { pan = 0 } = {}) {
    tone(c, t, { freq: 340, to: 190, glide: 0.09, peak: 0.16, release: 0.12, pan, wet: 0.1 });
    noise(c, t, { type: 'lowpass', freq: 900, peak: 0.08, release: 0.06, pan });
    noise(c, t, { freq: 5200, Q: 3, peak: 0.05, release: 0.015, pan });
  },
  hover(c, t, { pan = 0 } = {}) {
    tone(c, t, { freq: rnd(2300, 2700), peak: 0.03, release: 0.04, pan, wet: 0.05 });
  },
  toggle(c, t, { on = true, pan = 0 } = {}) {
    const [a, b] = on ? [noteHz(7), noteHz(9)] : [noteHz(9), noteHz(7)];
    tone(c, t, { type: 'triangle', freq: a, peak: 0.06, release: 0.08, pan });
    tone(c, t + 0.06, { type: 'triangle', freq: b, peak: 0.06, release: 0.12, pan });
    PRESETS.click(c, t, { pitch: on ? 1.1 : 0.9, pan });
  },
  key(c, t, { low = false, pan = 0 } = {}) {
    noise(c, t, { freq: low ? 1400 : rnd(2600, 3800), Q: 3, peak: 0.08, release: 0.014, pan, wet: 0.02 });
    tone(c, t, { type: 'triangle', freq: low ? 300 : rnd(520, 640), peak: 0.018, release: 0.03, pan, wet: 0 });
  },
  type(c, t, { pan = 0 } = {}) {
    // a soft teletype tick for streaming AI text
    noise(c, t, { freq: rnd(1800, 2600), Q: 2.5, peak: 0.12, release: 0.012, pan, wet: 0.04 });
    tone(c, t, { type: 'triangle', freq: rnd(900, 1200), peak: 0.012, release: 0.02, pan, wet: 0 });
  },
  toast(c, t) {
    bell(c, t, { freq: noteHz(12), peak: 0.05, release: 0.5 });
    bell(c, t + 0.08, { freq: noteHz(14), peak: 0.045, release: 0.7 });
  },
  error(c, t, { pan = 0 } = {}) {
    for (const k of [0, 0.11]) tone(c, t + k, { type: 'square', freq: 150, to: 120, glide: 0.08, peak: 0.05, release: 0.09, pan, wet: 0.05, filter: { freq: 900 } });
  },
  success(c, t, { pan = 0, level = 0 } = {}) {
    [5, 7, 10].forEach((n, i) => bell(c, t + i * 0.07, { freq: noteHz(n + 2 + level), peak: 0.07, release: 0.6, pan }));
  },
  fail(c, t, { pan = 0 } = {}) {
    tone(c, t, { type: 'triangle', freq: noteHz(4), to: noteHz(2), glide: 0.25, peak: 0.09, release: 0.3, pan, wet: 0.2 });
    tone(c, t, { type: 'sawtooth', freq: 110, peak: 0.03, release: 0.25, pan, filter: { freq: 500 } });
  },

  // --- the shared visual effects
  sparkle(c, t, { count = 20, pan = 0 } = {}) {
    const n = clamp(Math.round(Math.log2(count + 1) * 1.4), 2, 8);
    const peak = clamp(0.012 + count / 2400, 0.012, 0.045);
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.012, 0.03);
      const freq = noteHz(Math.floor(rnd(10, 19)));
      tone(c, at, { freq, peak, release: rnd(0.18, 0.4), pan: pan + rnd(-0.25, 0.25), wet: 0.4 });
    }
  },
  scrambleTick(c, t, { k = 0, pan = 0 } = {}) {
    noise(c, t, { freq: 2000 + k * 120 + rnd(-300, 300), Q: 3, peak: 0.07, release: 0.012, pan, wet: 0.02 });
    tone(c, t, { type: 'square', freq: rnd(900, 1600) + k * 25, peak: 0.012, release: 0.015, pan, wet: 0, filter: { freq: 4000 } });
  },
  settle(c, t, { pan = 0 } = {}) {
    bell(c, t, { freq: noteHz(15), peak: 0.035, release: 0.45, pan });
  },
  pulse(c, t, { amount = 1 } = {}) {
    const a = clamp(amount, 0.2, 1.6);
    tone(c, t, { freq: 95, to: 42, glide: 0.3, peak: 0.16 * a, attack: 0.008, release: 0.38, wet: 0.15 });
    noise(c, t, { type: 'lowpass', freq: 220, peak: 0.05 * a, release: 0.2 });
  },
  warp(c, t, { amount = 1 } = {}) {
    const a = clamp(amount, 0.2, 1.5);
    const dur = 0.45 + a * 0.35;
    noise(c, t, { freq: 300, to: 4200, Q: 1.4, peak: 0.07 * a, attack: dur * 0.6, release: dur * 0.5, sweep: dur, wet: 0.35 });
    tone(c, t, { type: 'sawtooth', freq: 90, to: 640, glide: dur, peak: 0.02 * a, attack: dur * 0.5, release: dur * 0.6, wet: 0.3, filter: { freq: 700, to: 2600, time: dur } });
  },

  // --- navigation
  navIn(c, t) {
    noise(c, t, { freq: 250, to: 3200, Q: 1.2, peak: 0.08, attack: 0.25, release: 0.35, sweep: 0.5, wet: 0.4 });
    [0, 2, 4].forEach((n, i) => tone(c, t + 0.18 + i * 0.05, { type: 'triangle', freq: noteHz(n + 5), peak: 0.035, attack: 0.08, release: 0.9, wet: 0.5 }));
  },
  navHome(c, t) {
    noise(c, t, { freq: 3000, to: 260, Q: 1.2, peak: 0.07, attack: 0.15, release: 0.4, sweep: 0.5, wet: 0.4 });
    [4, 2, 0].forEach((n, i) => tone(c, t + 0.15 + i * 0.05, { type: 'triangle', freq: noteHz(n + 5), peak: 0.03, attack: 0.06, release: 0.8, wet: 0.5 }));
  },

  // --- module flavours
  chime(c, t, { note = 0, pan = 0, peak = 0.06 } = {}) {
    bell(c, t, { freq: noteHz(10 + (note % 10)), peak, release: 0.7, pan });
  },
  koto(c, t, { note = 0, pan = 0, peak = 0.11 } = {}) {
    const f = noteHz(7 + note, JP_SCALE);
    tone(c, t, { type: 'triangle', freq: f * 1.01, to: f, glide: 0.05, peak, release: 0.9, pan, wet: 0.35 });
    tone(c, t, { freq: f * 2, peak: peak * 0.3, release: 0.4, pan, wet: 0.35 });
    noise(c, t, { freq: f * 3, Q: 8, peak: peak * 0.3, release: 0.03, pan });
  },
  pluck(c, t, { note = 0, pan = 0, peak = 0.08 } = {}) {
    const f = noteHz(note + 5);
    tone(c, t, { type: 'triangle', freq: f, peak, release: 0.5, pan, wet: 0.3 });
    tone(c, t, { type: 'sine', freq: f * 2, peak: peak * 0.25, release: 0.25, pan, wet: 0.3 });
  },
  stamp(c, t, { pan = 0 } = {}) {
    tone(c, t, { freq: 140, to: 48, glide: 0.18, peak: 0.24, attack: 0.003, release: 0.3, pan, wet: 0.2 });
    noise(c, t, { type: 'lowpass', freq: 1100, peak: 0.12, release: 0.09, pan, wet: 0.1 });
    PRESETS.click(c, t, { pitch: 0.7, pan });
  },
  lock(c, t, { pan = 0, pitch = 1 } = {}) {
    noise(c, t, { freq: 1400 * pitch, Q: 7, peak: 0.12, release: 0.05, pan, wet: 0.2 });
    tone(c, t, { type: 'square', freq: 210 * pitch, peak: 0.05, release: 0.06, pan, filter: { freq: 1200 } });
    tone(c, t, { freq: 1650 * pitch, peak: 0.03, release: 0.35, pan, wet: 0.4, detune: 7 });
  },
  tumbler(c, t, { pan = 0 } = {}) {
    noise(c, t, { freq: rnd(2800, 4000), Q: 3, peak: 0.14, release: 0.014, pan, wet: 0.05 });
  },
  drop(c, t, { pitch = 1, pan = 0 } = {}) {
    tone(c, t, { freq: 170 * pitch, to: 55, glide: 0.16, peak: 0.2, release: 0.26, pan, wet: 0.25 });
    noise(c, t, { type: 'lowpass', freq: 1400, peak: 0.08, release: 0.07, pan });
    bell(c, t + 0.01, { freq: noteHz(12 + Math.round(pitch * 3)), peak: 0.025, release: 0.5, pan });
  },
  chisel(c, t, { pan = 0 } = {}) {
    noise(c, t, { freq: rnd(2600, 3600), Q: 5, peak: 0.08, release: 0.03, pan, wet: 0.15 });
    tone(c, t, { freq: rnd(700, 900), to: 500, glide: 0.04, peak: 0.04, release: 0.05, pan });
    noise(c, t + 0.015, { type: 'highpass', freq: 5000, peak: 0.02, release: 0.12, pan, wet: 0.1 }); // falling grit
  },
  bleep(c, t, { pitch = 1, pan = 0 } = {}) {
    tone(c, t, { type: 'square', freq: 440 * pitch, peak: 0.03, release: 0.05, pan, wet: 0.05, filter: { freq: 3000 } });
  },
  beep(c, t) {
    tone(c, t, { type: 'square', freq: 880, peak: 0.03, release: 0.07, wet: 0.08, filter: { freq: 3500 } });
  },
  flip(c, t, { pan = 0 } = {}) {
    noise(c, t, { freq: 800, to: 3500, Q: 0.8, peak: 0.1, attack: 0.05, release: 0.12, sweep: 0.17, pan, wet: 0.15 });
  },
  shuffle(c, t, { pan = 0 } = {}) {
    for (let i = 0; i < 6; i++) noise(c, t + i * rnd(0.035, 0.06), { freq: rnd(1500, 4000), Q: 2.5, peak: 0.16, release: 0.02, pan: pan + rnd(-0.3, 0.3), wet: 0.1 });
  },
  brush(c, t, { pan = 0 } = {}) {
    noise(c, t, { type: 'bandpass', freq: 900, to: 2600, Q: 0.7, peak: 0.05, attack: 0.04, release: 0.2, sweep: 0.22, pan, wet: 0.2 });
  },
  swish(c, t, { pan = 0, up = true } = {}) {
    noise(c, t, { freq: up ? 600 : 3000, to: up ? 3000 : 600, Q: 1, peak: 0.11, attack: 0.06, release: 0.18, sweep: 0.22, pan, wet: 0.2 });
  },
  door(c, t) {
    noise(c, t, { type: 'lowpass', freq: 200, to: 2400, peak: 0.12, attack: 0.2, release: 0.6, sweep: 0.7, wet: 0.35 });
    tone(c, t, { freq: 55, to: 40, glide: 0.8, peak: 0.12, attack: 0.05, release: 0.8, wet: 0.2 });
    PRESETS.lock(c, t, { pitch: 0.6 });
  },
  boom(c, t) {
    tone(c, t, { freq: 70, to: 30, glide: 0.6, peak: 0.25, attack: 0.01, release: 0.9, wet: 0.4 });
    noise(c, t, { type: 'lowpass', freq: 500, to: 120, peak: 0.1, release: 0.6, wet: 0.4 });
  },

  // --- sustained (return a handle)
  whir(c, t, { duration = 1.2 } = {}) {
    const o = c.ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t);
    o.frequency.exponentialRampToValueAtTime(260, t + duration * 0.6);
    o.frequency.exponentialRampToValueAtTime(90, t + duration);
    const f = c.ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + duration * 0.6);
    f.frequency.exponentialRampToValueAtTime(500, t + duration);
    const g = env(c, t, { peak: 0.05, attack: 0.15, hold: duration - 0.35, release: 0.2 });
    o.connect(f).connect(g);
    route(c, g, { wet: 0.25 });
    o.start(t);
    o.stop(t + duration + 0.1);
    const n = noise(c, t, { freq: 900, to: 3000, Q: 2, peak: 0.03, attack: 0.2, hold: duration - 0.4, release: 0.2, sweep: duration * 0.6 });
    return { stop: () => fade(c, [g, n.gain]) };
  },
  wind(c, t, { duration = 1.6, peak = 0.08, freq = 500 } = {}) {
    const n = noise(c, t, { type: 'bandpass', freq, to: freq * 2.4, Q: 0.6, peak, attack: duration * 0.35, hold: duration * 0.25, release: duration * 0.4, sweep: duration * 0.5, wet: 0.3 });
    const m = noise(c, t + 0.1, { type: 'highpass', freq: 3500, peak: peak * 0.35, attack: duration * 0.4, hold: duration * 0.2, release: duration * 0.4, wet: 0.2 });
    return { stop: () => fade(c, [n.gain, m.gain]) };
  },
  swell(c, t, { duration = 1.2, notes = [0, 2, 4], peak = 0.03 } = {}) {
    const gains = notes.map((n, i) => {
      const o = c.ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = noteHz(n + 5);
      o.detune.value = (i - 1) * 6;
      const f = c.ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(1800, t + duration * 0.7);
      const g = env(c, t, { peak, attack: duration * 0.6, hold: duration * 0.1, release: duration * 0.5 });
      o.connect(f).connect(g);
      route(c, g, { wet: 0.5 });
      o.start(t);
      o.stop(t + duration * 1.3);
      return g;
    });
    return { stop: () => fade(c, gains) };
  },
  rain(c, t, { duration = 1.8 } = {}) {
    // digital rain: blips that get denser and higher as it speeds up
    const events = 70;
    for (let i = 0; i < events; i++) {
      const k = i / events;
      const at = t + duration * Math.sqrt(k) * 0.95;
      tone(c, at, { type: 'square', freq: noteHz(Math.floor(rnd(8, 14) + k * 6)), peak: 0.008 + k * 0.01, release: 0.03, pan: rnd(-0.8, 0.8), wet: 0.2, filter: { freq: 3500 } });
    }
    return null;
  },
};

function fade(c, gains) {
  const t = c.ac.currentTime;
  for (const g of gains) {
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    } catch {
      /* already stopped */
    }
  }
}

// Minimum time between two plays of a preset (ms), so fast repeats don't pile up.
const THROTTLE = { sparkle: 45, key: 18, type: 35, hover: 55, pulse: 90, warp: 220, click: 25, scrambleTick: 0, tumbler: 20, chisel: 35, bleep: 28, chime: 30, toast: 120, error: 150 };

// ---------------------------------------------------------------- the engine
function createSound() {
  let settings = { volume: 0.7, muted: false, typing: true };
  try {
    settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    /* defaults */
  }
  let c = null; // { ac, out, rev, master }
  const last = {};

  function context() {
    if (c) return c;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    const ac = new AC({ latencyHint: 'interactive' });
    const master = ac.createGain();
    master.gain.value = settings.muted ? 0 : settings.volume;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const out = ac.createGain();
    out.gain.value = 0.9;
    const rev = ac.createConvolver();
    rev.buffer = reverbImpulse(ac);
    const revOut = ac.createGain();
    revOut.gain.value = 0.55;
    out.connect(comp);
    rev.connect(revOut).connect(comp);
    comp.connect(master).connect(ac.destination);
    c = { ac, out, rev, master };
    return c;
  }
  // Browsers start audio suspended until the first gesture; any input wakes it.
  const wake = () => {
    const cc = context();
    if (cc && cc.ac.state === 'suspended') cc.ac.resume().catch(() => {});
  };
  addEventListener('pointerdown', wake, true);
  addEventListener('keydown', wake, true);

  const panFor = (x) => (typeof x === 'number' && innerWidth ? clamp((x / innerWidth) * 2 - 1, -1, 1) * 0.7 : 0);

  function play(name, opts = {}) {
    if (settings.muted || !settings.volume) return null;
    const fn = PRESETS[name];
    if (!fn) return null;
    const now = performance.now();
    const gap = THROTTLE[name] ?? 0;
    if (gap && now - (last[name] || 0) < gap) return null;
    last[name] = now;
    globalThis.__prismSoundLog?.push(name); // tests set this array to see what played
    const cc = context();
    if (!cc) return null;
    if (cc.ac.state === 'suspended') cc.ac.resume().catch(() => {});
    try {
      const t = cc.ac.currentTime + 0.005 + (opts.delay || 0);
      return fn(cc, t, { ...opts, pan: opts.pan ?? panFor(opts.x) }) || null;
    } catch (err) {
      console.warn('[sound]', name, err);
      return null;
    }
  }

  /** Play a timeline: [{ at: ms, name, ...opts }]. Returns { stop() } (cancels what hasn't played, fades what is still sounding). */
  function sequence(steps) {
    const timers = [];
    const live = [];
    for (const s of steps) {
      timers.push(setTimeout(() => {
        const h = play(s.name, s);
        if (h) live.push(h);
      }, s.at || 0));
    }
    return {
      stop() {
        timers.forEach(clearTimeout);
        live.forEach((h) => h.stop?.());
      },
    };
  }

  // A shared ticker for text scrambles: overlapping scrambles extend one
  // stream of ticks instead of stacking, and it ends on a soft settle note.
  let scrambleUntil = 0;
  let scrambleTimer = 0;
  let scrambleK = 0;
  function scramble(duration, x) {
    const end = performance.now() + duration;
    scrambleUntil = Math.max(scrambleUntil, end);
    if (scrambleTimer) return;
    scrambleK = 0;
    const tick = () => {
      if (performance.now() >= scrambleUntil) {
        scrambleTimer = 0;
        play('settle', { x });
        return;
      }
      play('scrambleTick', { k: scrambleK++ % 24, x });
      scrambleTimer = setTimeout(tick, 34);
    };
    tick();
  }

  function save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* not saved */
    }
  }
  function apply() {
    if (c) c.master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume, c.ac.currentTime, 0.05);
    save();
  }

  return {
    play,
    sequence,
    scramble,
    get settings() {
      return { ...settings };
    },
    setVolume(v) {
      settings.volume = clamp(v, 0, 1);
      settings.muted = false;
      apply();
    },
    setMuted(m) {
      settings.muted = Boolean(m);
      apply();
    },
    setTyping(on) {
      settings.typing = Boolean(on);
      save();
    },
    /** For the tests: render one preset offline and return its peak and RMS level. */
    async measure(name, opts = {}, seconds = 1.5) {
      const OAC = globalThis.OfflineAudioContext;
      const ac = new OAC(2, Math.ceil(44100 * seconds), 44100);
      const out = ac.createGain();
      const rev = ac.createConvolver();
      rev.buffer = reverbImpulse(ac, 1.2);
      out.connect(ac.destination);
      rev.connect(ac.destination);
      PRESETS[name]({ ac, out, rev }, 0.01, opts);
      const buf = await ac.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < d.length; i++) {
        peak = Math.max(peak, Math.abs(d[i]));
        sum += d[i] * d[i];
      }
      return { peak, rms: Math.sqrt(sum / d.length) };
    },
    presets: Object.keys(PRESETS),
  };
}

export const sound = createSound();
