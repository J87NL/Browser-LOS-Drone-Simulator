// Keyboard fallback: W/S throttle (non-centring), A/D yaw, arrows pitch/roll.
import { INPUT } from '../config.js';

const KEY_EVENTS = {
  Space: 'armToggle',
  KeyC: 'camera',
  KeyM: 'flightModeToggle',
  KeyR: 'reset',
  KeyP: 'pilot',
};

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.events = [];
    this.sticks = { yaw: 0, pitch: 0, roll: 0 };
    this.throttle = 0;
    this.usedSticks = false;
    this.usedThrottle = false;
    this.enabled = true;
    target.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.enabled) return;
      this.down.add(e.code);
      if (!e.repeat && KEY_EVENTS[e.code]) this.events.push(KEY_EVENTS[e.code]);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  axis(neg, pos) {
    return (this.down.has(pos) ? 1 : 0) - (this.down.has(neg) ? 1 : 0);
  }

  update(dt) {
    if (!this.enabled) this.down.clear();
    const ramp = INPUT.keyboardRamp * dt;
    const step = (cur, target) => {
      // Snap back faster than pushing out so releasing feels crisp.
      const r = target === 0 ? ramp * 2 : ramp;
      return cur + Math.max(-r, Math.min(r, target - cur));
    };
    const tYaw = this.axis('KeyA', 'KeyD');
    const tPitch = this.axis('ArrowDown', 'ArrowUp');
    const tRoll = this.axis('ArrowLeft', 'ArrowRight');
    this.sticks.yaw = step(this.sticks.yaw, tYaw);
    this.sticks.pitch = step(this.sticks.pitch, tPitch);
    this.sticks.roll = step(this.sticks.roll, tRoll);
    this.usedSticks = tYaw !== 0 || tPitch !== 0 || tRoll !== 0 ||
      this.sticks.yaw !== 0 || this.sticks.pitch !== 0 || this.sticks.roll !== 0;
    const th = this.axis('KeyS', 'KeyW');
    if (th !== 0) this.usedThrottle = true;
    this.throttle = Math.min(1, Math.max(0, this.throttle + th * INPUT.keyboardThrottleRate * dt));
  }

  takeEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}
