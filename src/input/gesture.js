// DJI-style "combination stick command": hold both sticks in the bottom
// corners (both outward or both inward) to arm. The same gesture disarms, but
// only on the ground. Works on functions (throttle, yaw, pitch, roll), so it
// is the same physical corners in every stick mode.
//
// Thresholds are loose enough for round-gated gamepads, where a stick pushed
// into a diagonal reads about 0.7 on each axis (and throttle about 0.12).
import { INPUT } from '../config.js';

const { stickArmHold: HOLD, stickArmThreshold: T, stickArmThrottle: THR } = INPUT;

/** True while the sticks are in either corner combination. */
export function inArmCorners({ throttle, yaw, pitch, roll }) {
  if (throttle > THR || pitch > -T) return false;
  const outward = yaw <= -T && roll >= T;
  const inward = yaw >= T && roll <= -T;
  return outward || inward;
}

export class ArmGesture {
  constructor() {
    this.reset();
  }

  reset() {
    this.held = 0;
    this.fired = false; // sticks must leave the corners before it can fire again
    this.armedAtStart = false;
  }

  /** 0..1 progress of the current hold, for UI feedback. */
  get progress() {
    return this.fired ? 0 : Math.min(1, this.held / HOLD);
  }

  /**
   * @returns {'arm'|'disarm'|null}
   */
  update(dt, sticks, { armed, grounded }) {
    if (!inArmCorners(sticks)) {
      this.reset();
      return null;
    }
    if (this.fired) return null;
    // A disarm hold only counts while on the ground (it cannot start in the
    // air and complete on touchdown).
    if (armed && !grounded) {
      this.held = 0;
      return null;
    }
    this.held += dt;
    if (this.held < HOLD) return null;
    this.fired = true;
    return armed ? 'disarm' : 'arm';
  }
}
