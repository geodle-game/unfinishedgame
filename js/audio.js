// js/audio.js
let ctx = null, master = null, volume = 0.6;

export function initAudio() {
  if (ctx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

function tone(freq, dur, type = 'sine', gain = 0.18, slideTo = null) {
  if (!ctx || volume <= 0.001) return;
  try {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  } catch (e) {}
}

export const SFX = {
  jump:      () => tone(430, 0.13, 'triangle', 0.16, 640),
  doubleJump:() => tone(600, 0.14, 'triangle', 0.14, 900),
  dash:      () => tone(170, 0.22, 'sawtooth', 0.14, 780),
  land:      () => tone(130, 0.11, 'sine', 0.18, 70),
  slide:     () => tone(240, 0.3, 'sawtooth', 0.07, 120),
  grapple:   () => tone(760, 0.1, 'square', 0.09, 1250),
  release:   () => tone(520, 0.09, 'square', 0.07, 300),
  wallrun:   () => tone(320, 0.12, 'triangle', 0.08, 420),
  checkpoint:() => { tone(660, 0.1, 'sine', 0.13); setTimeout(() => tone(990, 0.16, 'sine', 0.13), 90); },
  finish:    () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.24, 'triangle', 0.14), i * 100)); },
  death:     () => tone(220, 0.42, 'sawtooth', 0.18, 55),
  heal:      () => { tone(440, 0.14, 'sine', 0.13); setTimeout(() => tone(700, 0.2, 'sine', 0.13), 100); },
  ui:        () => tone(560, 0.05, 'square', 0.07),
  upgrade:   () => { tone(440, 0.1, 'triangle', 0.12); setTimeout(() => tone(880, 0.18, 'triangle', 0.12), 90); },
  slam:      () => tone(300, 0.3, 'sawtooth', 0.16, 60),
  blink:     () => tone(900, 0.12, 'sine', 0.12, 1600)
};
