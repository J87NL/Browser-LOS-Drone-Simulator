// Debug overlay: physics step counts, inputs, rates. Toggle with ` (backquote).
import { h } from './dom.js';

const f = (v, d = 2) => (v >= 0 ? ' ' : '') + v.toFixed(d);
const RAD = 180 / Math.PI;

export class DebugOverlay {
  constructor(parent) {
    this.el = h('pre', { class: 'debug panel hidden' });
    parent.append(this.el);
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.lastText = 0;
  }

  setVisible(v) {
    this.el.classList.toggle('hidden', !v);
  }

  update(dt, d) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
    }
    if (this.el.classList.contains('hidden')) return;
    const now = performance.now();
    if (now - this.lastText < 100) return;
    this.lastText = now;
    const q = d.quad;
    this.el.textContent = [
      `fps ${this.fps.toFixed(0)}  steps/frame ${d.steps}  sim t ${d.simTime.toFixed(2)}s`,
      `input ${d.input.source}  thr ${d.input.throttle.toFixed(2)} → thrust ${d.thrust.toFixed(2)}`,
      `sticks  roll ${f(d.input.roll)} pitch ${f(d.input.pitch)} yaw ${f(d.input.yaw)}`,
      `ω body  x ${f(q.omega.x * RAD, 0)} y ${f(q.omega.y * RAD, 0)} z ${f(q.omega.z * RAD, 0)} °/s`,
      `target  x ${f(q.targetRates.x * RAD, 0)} y ${f(q.targetRates.y * RAD, 0)} z ${f(q.targetRates.z * RAD, 0)} °/s`,
      `pos ${f(q.pos.x, 1)} ${f(q.pos.y, 1)} ${f(q.pos.z, 1)}  vel ${f(q.vel.x, 1)} ${f(q.vel.y, 1)} ${f(q.vel.z, 1)}`,
      `heading ${(q.heading * RAD).toFixed(0)}°  grounded ${q.grounded}  last impact ${q.lastImpact.toFixed(1)} m/s`,
      d.pad ? `pad ${d.pad.id.slice(0, 48)}\naxes ${d.pad.gp.axes.map((a) => a.toFixed(2)).join(' ')}` : 'no gamepad',
    ].join('\n');
  }
}
