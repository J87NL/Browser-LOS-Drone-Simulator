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

describe('flag banner collider', () => {
  it('sits on the banner side of the pole and turns with the flag', async () => {
    const { placeBanner } = await import('../src/world/course.js');
    const { CollisionWorld } = await import('../src/physics/colliders.js');
    const { Vector3 } = await import('three');
    const w = new CollisionWorld(() => -100);
    const collider = w.addBox({ x: 5, y: 2, z: 5, hx: 0.35, hy: 1.2, hz: 0.05, reach: 0.75 });
    const flag = { rotation: { y: 0 }, userData: { collider, pole: { x: 5, z: 5 } } };
    placeBanner(flag); // banner towards +X
    expect(w.contacts(new Vector3(5.5, 2, 5), 0.07).length).toBe(1);
    expect(w.contacts(new Vector3(4.5, 2, 5), 0.07).length).toBe(0); // empty side
    flag.rotation.y = Math.PI / 2; // banner towards -Z
    placeBanner(flag);
    expect(w.contacts(new Vector3(5, 2, 4.5), 0.07).length).toBe(1);
    expect(w.contacts(new Vector3(5.5, 2, 5), 0.07).length).toBe(0);
  });
});
