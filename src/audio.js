// Optional motor sound: two detuned oscillators through a low-pass filter,
// pitch follows motor output. Created lazily after a user gesture.
export class MotorSound {
  constructor() {
    this.ctx = null;
    this.volume = 0;
  }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    b.detune.value = 12;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    a.connect(filter);
    b.connect(bGain).connect(filter);
    filter.connect(gain).connect(ctx.destination);
    a.start();
    b.start();
    Object.assign(this, { ctx, gain, filter, a, b });
  }

  /** Call from a user gesture handler so the AudioContext may start. */
  unlock() {
    if (this.volume <= 0) return;
    if (!this.ctx) this._init();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (v > 0) this.unlock();
  }

  update(motor, armed, distance = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 70 + motor * 380;
    this.a.frequency.setTargetAtTime(f, t, 0.03);
    this.b.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.filter.frequency.setTargetAtTime(600 + motor * 3000, t, 0.05);
    const fall = 1 / Math.max(1, distance / 4);
    const level = armed || motor > 0.02 ? this.volume * 0.18 * (0.35 + motor) * fall : 0;
    this.gain.gain.setTargetAtTime(level, t, 0.05);
  }
}
