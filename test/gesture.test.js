import { describe, it, expect } from 'vitest';
import { ArmGesture, inArmCorners } from '../src/input/gesture.js';
import { INPUT } from '../src/config.js';
import { mapGamepad, defaultMapping } from '../src/input/mapping.js';

const outward = { throttle: 0, yaw: -1, pitch: -1, roll: 1 };
const inward = { throttle: 0, yaw: 1, pitch: -1, roll: -1 };
const hold = (g, sticks, seconds, ctx) => {
  let ev = null;
  for (let t = 0; t < seconds; t += 0.02) ev = g.update(0.02, sticks, ctx) ?? ev;
  return ev;
};

describe('stick-command arming', () => {
  it('recognises both corner combinations only with low throttle and pitch back', () => {
    expect(inArmCorners(outward)).toBe(true);
    expect(inArmCorners(inward)).toBe(true);
    expect(inArmCorners({ ...outward, throttle: 0.3 })).toBe(false);
    expect(inArmCorners({ ...outward, pitch: 0 })).toBe(false);
    expect(inArmCorners({ ...outward, roll: -1 })).toBe(false); // mixed corners
  });

  it('arms only after the hold time', () => {
    const g = new ArmGesture();
    const ctx = { armed: false, grounded: true };
    expect(hold(g, outward, INPUT.stickArmHold - 0.2, ctx)).toBeNull();
    expect(hold(g, outward, 0.4, ctx)).toBe('arm');
  });

  it('fires once per hold and resets when the sticks leave the corners', () => {
    const g = new ArmGesture();
    const ctx = { armed: false, grounded: true };
    expect(hold(g, inward, INPUT.stickArmHold + 0.1, ctx)).toBe('arm');
    expect(hold(g, inward, 5, { armed: true, grounded: true })).toBeNull();
    g.update(0.02, { throttle: 0, yaw: 0, pitch: 0, roll: 0 }, ctx);
    expect(hold(g, inward, INPUT.stickArmHold + 0.1, { armed: true, grounded: true })).toBe('disarm');
  });

  it('works with round-gated gamepad sticks pushed into the diagonals (mode 2)', () => {
    const d = Math.SQRT1_2; // a round gate reaches ~0.71 per axis on the diagonal
    const gp = { axes: [-d, d, d, d], buttons: [] }; // left: down-left, right: down-right
    const sticks = mapGamepad(gp, defaultMapping(true, 2));
    expect(inArmCorners(sticks)).toBe(true);
    const inwardGp = { axes: [d, d, -d, d], buttons: [] };
    expect(inArmCorners(mapGamepad(inwardGp, defaultMapping(true, 2)))).toBe(true);
  });

  it('boundaries: throttle and stick thresholds', () => {
    const T = INPUT.stickArmThreshold;
    expect(inArmCorners({ ...outward, throttle: INPUT.stickArmThrottle })).toBe(true);
    expect(inArmCorners({ ...outward, throttle: INPUT.stickArmThrottle + 0.01 })).toBe(false);
    expect(inArmCorners({ throttle: 0, yaw: -T, pitch: -T, roll: T })).toBe(true);
    expect(inArmCorners({ throttle: 0, yaw: -T + 0.01, pitch: -T, roll: T })).toBe(false);
  });

  it('a disarm hold started in the air does not complete on touchdown', () => {
    const g = new ArmGesture();
    hold(g, outward, 1.4, { armed: true, grounded: false });
    expect(hold(g, outward, 0.2, { armed: true, grounded: true })).toBeNull();
    expect(hold(g, outward, INPUT.stickArmHold, { armed: true, grounded: true })).toBe('disarm');
  });

  it('reset() drops a partial hold (used while paused)', () => {
    const g = new ArmGesture();
    hold(g, outward, INPUT.stickArmHold - 0.1, { armed: false, grounded: true });
    g.reset();
    expect(hold(g, outward, 0.2, { armed: false, grounded: true })).toBeNull();
    expect(g.progress).toBeGreaterThan(0);
  });

  it('never disarms in the air', () => {
    const g = new ArmGesture();
    expect(hold(g, outward, 5, { armed: true, grounded: false })).toBeNull();
  });
});

// Hold until the gesture fires (main arms the quad in that same frame).
const holdUntilFired = (g, sticks, ctx) => {
  for (let t = 0; t < 10; t += 0.02) if (g.update(0.02, sticks, ctx)) return;
};

describe('stick lock after a stick-command arm', () => {
  it('locks yaw/pitch/roll after arming until the sticks return to centre', () => {
    const g = new ArmGesture();
    holdUntilFired(g, outward, { armed: false, grounded: true });
    expect(g.sticksLocked).toBe(true);
    // Still holding the corners (and then moving out of them, not yet centred).
    g.update(0.02, outward, { armed: true, grounded: true });
    g.update(0.02, { throttle: 0, yaw: -0.5, pitch: 0, roll: 0 }, { armed: true, grounded: true });
    expect(g.sticksLocked).toBe(true);
    g.update(0.02, { throttle: 0, yaw: 0.05, pitch: -0.05, roll: 0 }, { armed: true, grounded: true });
    expect(g.sticksLocked).toBe(false);
  });

  it('releases the lock when disarmed', () => {
    const g = new ArmGesture();
    holdUntilFired(g, outward, { armed: false, grounded: true });
    expect(g.sticksLocked).toBe(true);
    g.update(0.02, outward, { armed: false, grounded: true });
    expect(g.sticksLocked).toBe(false);
  });
});

describe('releasing the stick lock', () => {
  it('ends on centred sticks, on take-off throttle, or when disarmed', async () => {
    const { releaseStickLock } = await import('../src/input/gesture.js');
    expect(releaseStickLock(outward, true)).toBe(false);
    expect(releaseStickLock({ throttle: 0, yaw: 0.05, pitch: 0, roll: -0.05 }, true)).toBe(true);
    expect(releaseStickLock({ ...outward, throttle: INPUT.stickArmUnlockThrottle + 0.05 }, true)).toBe(true);
    expect(releaseStickLock(outward, false)).toBe(true);
  });
});
