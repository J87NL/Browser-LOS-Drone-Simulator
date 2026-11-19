import { describe, it, expect } from 'vitest';
import { ArmGesture, inArmCorners } from '../src/input/gesture.js';
import { INPUT } from '../src/config.js';

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

  it('never disarms in the air', () => {
    const g = new ArmGesture();
    expect(hold(g, outward, 5, { armed: true, grounded: false })).toBeNull();
  });
});
