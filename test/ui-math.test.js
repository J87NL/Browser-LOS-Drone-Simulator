import { describe, it, expect } from 'vitest';
import { unwrapDegrees } from '../src/ui/hud.js';
import { flagYaw } from '../src/world/course.js';

describe('wind arrow and flags', () => {
  it('the HUD arrow continues the short way round across ±180°', () => {
    expect(unwrapDegrees(174, -174)).toBeCloseTo(186, 6);
    expect(unwrapDegrees(186, 174)).toBeCloseTo(174, 6);
    expect(unwrapDegrees(10, 350)).toBeCloseTo(-10, 6);
    expect(unwrapDegrees(0, 90)).toBeCloseTo(90, 6);
  });

  it('a flag points its banner (local +X) downwind', () => {
    for (const [wx, wz] of [[1, 0], [-1, 0], [0, 1], [0.6, -0.8]]) {
      const yaw = flagYaw({ x: wx, z: wz });
      // Local +X after a rotation about Y by yaw is (cos, 0, -sin).
      expect(Math.cos(yaw)).toBeCloseTo(wx, 6);
      expect(-Math.sin(yaw)).toBeCloseTo(wz, 6);
    }
  });
});
