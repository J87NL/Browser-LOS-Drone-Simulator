// Minimal HUD: armed state, flight mode, camera, throttle bar, speed, altitude.
import { h } from './dom.js';
import { CAMERA_LABELS } from '../cameras.js';

export class Hud {
  constructor(parent) {
    this.armed = h('div', { class: 'hud-pill' });
    this.mode = h('div', { class: 'hud-pill' });
    this.cam = h('div', { class: 'hud-pill' });
    this.thrFill = h('div', { class: 'thr-fill' });
    this.thrText = h('span', { class: 'hud-num' });
    this.speed = h('span', { class: 'hud-num' });
    this.alt = h('span', { class: 'hud-num' });
    this.source = h('div', { class: 'hud-source' });
    this.el = h(
      'div',
      { class: 'hud panel' },
      h('div', { class: 'hud-row' }, this.armed, this.mode, this.cam),
      h('div', { class: 'hud-row thr' }, h('span', { class: 'hud-label', text: 'THR' }), h('div', { class: 'thr-bar' }, this.thrFill), this.thrText),
      h('div', { class: 'hud-row' },
        h('span', { class: 'hud-label', text: 'SPD' }), this.speed,
        h('span', { class: 'hud-label', text: 'ALT' }), this.alt),
      this.source,
    );
    this.crash = h('div', { class: 'crash panel hidden' });
    this.paused = h('div', { class: 'paused hidden', text: 'Paused' });
    this.help = h('div', { class: 'help panel' },
      h('b', { text: 'Keys ' }),
      'W/S throttle · A/D yaw · arrows pitch/roll · Space arm · M mode · C camera · R reset · P pilot here · Esc menu',
    );
    parent.append(this.el, this.crash, this.paused, this.help);
    this._last = {};
  }

  _set(el, key, text, cls) {
    if (this._last[key] === text) return;
    this._last[key] = text;
    el.textContent = text;
    if (cls !== undefined) el.dataset.state = cls;
  }

  update({ armed, mode, camera, throttle, speed, altitude, crashed, source, paused, armProgress = 0 }) {
    // While a stick-command hold is in progress, show how far along it is.
    const holding = armProgress > 0 ? ` ${'▮'.repeat(Math.ceil(armProgress * 5)).padEnd(5, '▯')}` : '';
    const label = armProgress > 0 ? (armed ? 'DISARMING' : 'ARMING') + holding : armed ? 'ARMED' : 'DISARMED';
    this._set(this.armed, 'armed', label, armed ? 'on' : 'off');
    this._set(this.mode, 'mode', mode === 'acro' ? 'ACRO' : 'ANGLE', mode);
    this._set(this.cam, 'cam', CAMERA_LABELS[camera], camera);
    this.thrFill.style.transform = `scaleX(${throttle.toFixed(3)})`;
    this._set(this.thrText, 'thr', `${Math.round(throttle * 100)}%`);
    this._set(this.speed, 'spd', `${(speed * 3.6).toFixed(0)} km/h`);
    this._set(this.alt, 'alt', `${altitude.toFixed(1)} m`);
    this._set(this.source, 'src', source);
    const crashText = crashed ? `Crashed at ${crashed.speed.toFixed(1)} m/s. Press reset (R) to go back to the pad.` : '';
    this._set(this.crash, 'crash', crashText);
    this.crash.classList.toggle('hidden', !crashed);
    this.paused.classList.toggle('hidden', !paused);
  }
}
