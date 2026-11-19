import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { FixedStepper } from '../src/physics/stepper.js';
import { Quad } from '../src/physics/quad.js';
import { CollisionWorld } from '../src/physics/colliders.js';
import { PRESETS, DEFAULT_RATES, GRAVITY } from '../src/config.js';

const P = PRESETS.freestyle5;
const flat = () => new CollisionWorld(() => 0);
const cmd = (o = {}) => ({ thrust: 0, roll: 0, pitch: 0, yaw: 0, mode: 'acro', rates: DEFAULT_RATES, ...o });
const hover = 1 / P.thrustToWeight;

function airborne(height = 20) {
  const q = new Quad(P);
  q.reset(new Vector3(0, height, 0));
  q.armed = true;
  q.thrust = q.maxThrust * hover;
  return q;
}

describe('FixedStepper', () => {
  it('runs the right number of steps and keeps the remainder', () => {
    const s = new FixedStepper(500);
    let n = 0;
    const r = s.advance(0.0105, () => n++);
    expect(n).toBe(5);
    expect(r.alpha).toBeCloseTo(0.25, 6);
    s.advance(0.0015, () => n++);
    expect(n).toBe(6);
  });

  it('caps a huge frame to avoid the spiral of death', () => {
    const s = new FixedStepper(500, 0.1);
    let n = 0;
    s.advance(5, () => n++);
    expect(n).toBe(50);
  });

  it('ignores zero, negative and NaN frame times', () => {
    const s = new FixedStepper(500);
    let n = 0;
    for (const dt of [0, -1, NaN]) s.advance(dt, () => n++);
    expect(n).toBe(0);
  });

  it('gives the same simulation at 24, 60 and 144 fps', () => {
    const run = (fps) => {
      const q = airborne();
      const s = new FixedStepper(500);
      const world = flat();
      let t = 0;
      const frame = 1 / fps;
      while (t < 3 - 1e-9) {
        const c = cmd({ thrust: 0.4, roll: t < 1 ? 0.3 : 0, pitch: 0.2 });
        s.advance(frame, (dt) => q.step(dt, c, world));
        t += frame;
      }
      // Finish on an exact step boundary.
      return { q, time: s.time };
    };
    const a = run(24);
    const b = run(60);
    const c = run(144);
    // Sticks change on frame boundaries, so allow a small difference.
    expect(a.q.pos.distanceTo(c.q.pos)).toBeLessThan(0.5);
    expect(b.q.pos.distanceTo(c.q.pos)).toBeLessThan(0.3);
    expect(Math.abs(a.time - c.time)).toBeLessThan(0.05);
  });

  it('is exactly deterministic for constant input regardless of frame rate', () => {
    const run = (fps) => {
      const q = airborne();
      const s = new FixedStepper(500);
      const c = cmd({ thrust: 0.5, roll: 0.2, pitch: 0.1, yaw: 0.1 });
      for (let i = 0; i < fps * 2; i++) s.advance(1 / fps, (dt) => q.step(dt, c));
      return q;
    };
    const a = run(25);
    const b = run(100);
    expect(a.pos.distanceTo(b.pos)).toBeLessThan(1e-6);
  });
});

describe('Quad flight model', () => {
  it('hovers at hover thrust without drifting', () => {
    const q = airborne();
    for (let i = 0; i < 2500; i++) q.step(0.002, cmd({ thrust: hover }));
    expect(Math.abs(q.pos.y - 20)).toBeLessThan(0.01);
    expect(Math.hypot(q.pos.x, q.pos.z)).toBeLessThan(1e-6);
    expect(q.omega.length()).toBeLessThan(1e-9);
  });

  it('falls with no thrust when disarmed and lands without crashing from low height', () => {
    const q = new Quad(P);
    q.reset(new Vector3(0, 0.5, 0));
    const w = flat();
    for (let i = 0; i < 1000; i++) q.step(0.002, cmd(), w);
    expect(q.crashed).toBeNull();
    expect(q.grounded).toBe(true);
    expect(q.pos.y).toBeCloseTo(P.radius, 2);
  });

  it('crashes on a hard impact', () => {
    const q = new Quad(P);
    q.reset(new Vector3(0, 1, 0));
    q.vel.set(0, -15, 0);
    q.step(0.002, cmd(), flat());
    for (let i = 0; i < 100; i++) q.step(0.002, cmd(), flat());
    expect(q.crashed).not.toBeNull();
    expect(q.armed).toBe(false);
  });

  it('acro: angular velocity follows the target with ~30 ms time constant', () => {
    const q = airborne();
    const c = cmd({ thrust: hover, roll: 1 });
    for (let i = 0; i < 15; i++) q.step(0.002, c); // one time constant
    const target = (670 * Math.PI) / 180;
    expect(-q.omega.z / target).toBeCloseTo(1 - Math.exp(-1), 1);
  });

  it('acro: a full roll returns to level and holds attitude when sticks centre', () => {
    const q = airborne(50);
    // Full right roll for long enough to rotate ~360 deg at 670 deg/s.
    for (let i = 0; i < 260; i++) q.step(0.002, cmd({ thrust: 0.6, roll: 1 }));
    for (let i = 0; i < 100; i++) q.step(0.002, cmd({ thrust: 0.6 }));
    expect(q.omega.length()).toBeLessThan(0.05);
    const quatBefore = q.quat.clone();
    for (let i = 0; i < 500; i++) q.step(0.002, cmd({ thrust: hover }));
    expect(q.quat.angleTo(quatBefore)).toBeLessThan(1e-3);
  });

  it('acro: roll right banks right, pitch forward tilts nose down, yaw right turns right', () => {
    const tilt = (c) => {
      const q = airborne();
      for (let i = 0; i < 50; i++) q.step(0.002, cmd({ thrust: hover, ...c }));
      return q;
    };
    expect(tilt({ roll: 1 }).up().x).toBeGreaterThan(0.3); // thrust vector points right
    expect(tilt({ pitch: 1 }).up().z).toBeLessThan(-0.3); // thrust vector points forward (-Z)
    const y = tilt({ yaw: 1 });
    const fwd = new Vector3(0, 0, -1).applyQuaternion(y.quat);
    expect(fwd.x).toBeGreaterThan(0.3);
  });

  it('angle mode: holds the commanded tilt and returns to level when centred', () => {
    const q = airborne(50);
    const maxTilt = (P.angleMaxTilt * Math.PI) / 180;
    for (let i = 0; i < 1000; i++) q.step(0.002, cmd({ mode: 'angle', thrust: 0.4, roll: 1 }));
    const angle = Math.acos(q.up().y);
    expect(angle).toBeGreaterThan(maxTilt - 0.05);
    expect(angle).toBeLessThan(maxTilt + 0.05);
    expect(q.up().x).toBeGreaterThan(0);
    for (let i = 0; i < 1000; i++) q.step(0.002, cmd({ mode: 'angle', thrust: 0.4 }));
    expect(q.up().y).toBeGreaterThan(0.9999);
  });

  it('angle mode recovers from inverted', () => {
    const q = airborne(80);
    q.quat.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI);
    for (let i = 0; i < 1500; i++) q.step(0.002, cmd({ mode: 'angle', thrust: hover }));
    expect(q.up().y).toBeGreaterThan(0.999);
  });

  it('reaches a sane top speed at full tilt (carving drag)', () => {
    const q = airborne(200);
    q.quat.setFromAxisAngle(new Vector3(1, 0, 0), -1.2);
    for (let i = 0; i < 5000; i++) q.step(0.002, cmd({ thrust: 1 }));
    const v = q.vel.length();
    expect(v).toBeGreaterThan(20);
    expect(v).toBeLessThan(45);
    expect(GRAVITY).toBe(9.81);
  });

  it('disarmed: no thrust', () => {
    const q = airborne();
    q.armed = false;
    for (let i = 0; i < 50; i++) q.step(0.002, cmd({ thrust: 1 }));
    expect(q.vel.y).toBeLessThan(0);
  });
});

describe('CollisionWorld', () => {
  it('pushes a sphere out of a box and a cylinder', () => {
    const w = new CollisionWorld(() => -100);
    w.addBox({ x: 0, y: 1, z: 0, hx: 1, hy: 1, hz: 1 });
    w.addCylinder({ x: 10, z: 0, y0: 0, y1: 5, r: 0.5 });
    let c = w.contacts(new Vector3(1.05, 1, 0), 0.1);
    expect(c).toHaveLength(1);
    expect(c[0].normal.x).toBeCloseTo(1, 6);
    expect(c[0].depth).toBeCloseTo(0.05, 6);
    c = w.contacts(new Vector3(10, 3, -0.55), 0.1);
    expect(c[0].normal.z).toBeCloseTo(-1, 6);
    c = w.contacts(new Vector3(10, 4.9, 0), 0.1); // inside, near the top
    expect(c[0].normal.y).toBe(1);
    expect(w.contacts(new Vector3(5, 1, 0), 0.1)).toHaveLength(0);
  });

  it('handles rotated boxes', () => {
    const w = new CollisionWorld(() => -100);
    w.addBox({ x: 0, y: 0, z: 0, hx: 2, hy: 1, hz: 0.1, yaw: Math.PI / 2 });
    // Rotated 90 deg, the long side now runs along Z.
    expect(w.contacts(new Vector3(0, 0, 1.9), 0.1).length).toBe(1);
    expect(w.contacts(new Vector3(1.9, 0, 0), 0.1).length).toBe(0);
  });

  it('skips disabled colliders', () => {
    const w = new CollisionWorld(() => -100);
    const c = w.addCylinder({ x: 0, z: 0, y0: 0, y1: 5, r: 1 });
    c.enabled = false;
    expect(w.contacts(new Vector3(0, 1, 0), 0.1)).toHaveLength(0);
  });
});
