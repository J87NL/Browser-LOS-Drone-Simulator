// DJI-style "combination stick command": hold both sticks in the bottom
// corners (both outward or both inward) to arm. The same gesture disarms, but
// only on the ground. Works on functions (throttle, yaw, pitch, roll), so it
// is the same physical corners in every stick mode.
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
    this.held = 0;
    this.fired = false; // sticks must leave the corners before it can fire again
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
      this.held = 0;
      this.fired = false;
      return null;
    }
    if (this.fired) return null;
    this.held += dt;
    if (this.held < HOLD) return null;
    this.fired = true;
    if (!armed) return 'arm';
    return grounded ? 'disarm' : null;
  }
}
