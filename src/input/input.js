// Combines gamepad and keyboard into one stick state plus discrete events.
import { ACTIONS } from './mapping.js';
import { INPUT } from '../config.js';

const STATE_EVENTS_WHILE_PAUSED = new Set(['disarm', 'acro', 'angle']);

/**
 * Failsafe: disarm only when the controller that is actually flying goes
 * away (matched by index and id), not when some other pad disconnects.
 */
export function shouldFailsafe(armed, state, disconnectedKey) {
  return armed && state.source === 'gamepad' && state.gamepadKey === disconnectedKey;
}

/**
 * Turn gamepad action levels into events. Buttons fire on press; switch axes
 * fire on both edges for arm and flight mode, so a 2-position switch maps to
 * a state (armed/disarmed, acro/angle) like on a real transmitter.
 */
export function actionEvents(prev, now, mapping) {
  const ev = [];
  for (const a of ACTIONS) {
    const was = !!prev[a];
    const is = !!now[a];
    if (was === is) continue;
    const isSwitch = mapping.buttons[a]?.type === 'axis';
    if (a === 'arm') {
      if (isSwitch) ev.push(is ? 'arm' : 'disarm');
      else if (is) ev.push('armToggle');
    } else if (a === 'flightMode') {
      if (isSwitch) ev.push(is ? 'acro' : 'angle');
      else if (is) ev.push('flightModeToggle');
    } else if (is) {
      ev.push(a);
    }
  }
  return ev;
}

export class InputManager {
  constructor(gamepads, keyboard) {
    this.gamepads = gamepads;
    this.keyboard = keyboard;
    this.prevActions = null;
    this.prevKey = '';
    this.padAnchor = null;
    this.enabled = true;
    this.state = { throttle: 0, yaw: 0, pitch: 0, roll: 0, source: 'keyboard', gamepadId: null, gamepadKey: null };
    gamepads.addEventListener('mappingchange', () => (this.prevActions = null));
  }

  /** @returns {{state:object, events:string[], pad:object|null}} */
  update(dt) {
    this.keyboard.enabled = this.enabled;
    this.keyboard.update(dt);
    const pad = this.gamepads.poll();
    const events = this.keyboard.takeEvents();
    const s = this.state;
    let padEvents = [];

    if (pad) {
      const key = pad.key ?? pad.id;
      // First poll of a device (or after a mapping change): take the current
      // switch positions as the baseline so nothing fires on connect.
      if (this.prevActions === null || this.prevKey !== key) {
        this.prevActions = { ...pad.mapped.actions };
        this.prevKey = key;
      }
      padEvents = actionEvents(this.prevActions, pad.mapped.actions, pad.mapping);
      this.prevActions = { ...pad.mapped.actions };
      s.source = 'gamepad';
      s.gamepadId = pad.id;
      s.gamepadKey = pad.key;
      // Whichever throttle moved last wins. While the pad has it, the keyboard
      // throttle follows the pad so a W/S tap continues from the same value.
      // The pad takes it back only after a clear move (not stick noise) away
      // from where it was when the keyboard took over.
      const pt = pad.mapped.throttle;
      if (this.keyboard.usedThrottle) {
        if (this.padAnchor == null) this.padAnchor = pt;
        if (Math.abs(pt - this.padAnchor) > INPUT.padTakeover) {
          this.keyboard.usedThrottle = false;
          this.padAnchor = null;
        }
      } else this.padAnchor = null;
      if (!this.keyboard.usedThrottle) this.keyboard.throttle = pt;
      s.throttle = pt;
      s.yaw = pad.mapped.yaw;
      s.pitch = pad.mapped.pitch;
      s.roll = pad.mapped.roll;
      if (this.keyboard.usedThrottle) s.throttle = this.keyboard.throttle;
    } else {
      this.prevActions = null;
      this.padAnchor = null;
      s.source = 'keyboard';
      s.gamepadId = null;
      s.gamepadKey = null;
      s.throttle = this.keyboard.throttle;
      s.yaw = s.pitch = s.roll = 0;
    }
    if (this.keyboard.usedSticks) {
      const k = this.keyboard.sticks;
      s.yaw = Math.max(-1, Math.min(1, s.yaw + k.yaw));
      s.pitch = Math.max(-1, Math.min(1, s.pitch + k.pitch));
      s.roll = Math.max(-1, Math.min(1, s.roll + k.roll));
    }
    if (!this.enabled) {
      s.yaw = s.pitch = s.roll = 0;
      return { state: s, events: padEvents.filter((e) => STATE_EVENTS_WHILE_PAUSED.has(e)), pad };
    }
    return { state: s, events: [...events, ...padEvents], pad };
  }
}
