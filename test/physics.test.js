import { describe, it, expect } from 'vitest';
import { Vector3, PerspectiveCamera } from 'three';
import { CameraRig } from '../src/cameras.js';
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

  it('acro: after a full-rate roll, sticks centred stop rotation and hold attitude', () => {
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

  it('angle mode keeps max tilt while yawing (yaw about world up)', () => {
    const q = airborne(80);
    const maxTilt = (P.angleMaxTilt * Math.PI) / 180;
    for (let i = 0; i < 1500; i++) q.step(0.002, cmd({ mode: 'angle', thrust: 0.4, pitch: 1, yaw: 1 }));
    expect(Math.abs(Math.acos(q.up().y) - maxTilt)).toBeLessThan((2 * Math.PI) / 180);
  });

  it('angle mode caps a corner stick at max tilt', () => {
    const q = airborne(80);
    const maxTilt = (P.angleMaxTilt * Math.PI) / 180;
    for (let i = 0; i < 1500; i++) q.step(0.002, cmd({ mode: 'angle', thrust: 0.4, pitch: 1, roll: 1 }));
    expect(Math.acos(q.up().y)).toBeLessThan(maxTilt + 0.02);
    expect(q.up().x).toBeGreaterThan(0);
    expect(q.up().z).toBeLessThan(0);
  });

  it('heading does not flip during an acro pitch flip', () => {
    const q = airborne(80);
    // Yaw to ~40 deg first, then a full pitch flip.
    for (let i = 0; i < 100; i++) q.step(0.002, cmd({ thrust: hover, yaw: -0.5 }));
    for (let i = 0; i < 100; i++) q.step(0.002, cmd({ thrust: hover }));
    const h0 = q.heading;
    let maxDev = 0;
    for (let i = 0; i < 400; i++) {
      q.step(0.002, cmd({ thrust: 0.5, pitch: 1 }));
      const d = Math.abs(Math.atan2(Math.sin(q.heading - h0), Math.cos(q.heading - h0)));
      maxDev = Math.max(maxDev, d);
    }
    expect(Math.abs(h0)).toBeGreaterThan(0.3);
    expect(maxDev).toBeLessThan((10 * Math.PI) / 180);
  });

  it('heading stays wrapped to (-pi, pi]', () => {
    const q = airborne();
    for (let i = 0; i < 3000; i++) {
      q.step(0.002, cmd({ thrust: hover, yaw: 1 }));
      expect(q.heading).toBeGreaterThan(-Math.PI - 1e-9);
      expect(q.heading).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('"pilot here" stands behind the drone, not in front of it', () => {
    const rig = new CameraRig(new PerspectiveCamera(), () => 0);
    const q = airborne();
    for (let i = 0; i < 300; i++) q.step(0.002, cmd({ thrust: hover, yaw: 0.6 }));
    rig.setPilotBehind(q.pos, q.heading);
    const nose = new Vector3(0, 0, -1).applyQuaternion(q.quat).setY(0).normalize();
    const toPilot = rig.pilot.clone().sub(q.pos).setY(0);
    expect(toPilot.length()).toBeCloseTo(5, 6);
    expect(toPilot.normalize().dot(nose)).toBeLessThan(-0.99);
  });

  it('crashes into an obstacle at speed but bounces off it gently', () => {
    const w = new CollisionWorld(() => -100);
    w.addBox({ x: 0, y: 20, z: -2, hx: 1, hy: 1, hz: 0.1 });
    const fast = airborne();
    fast.vel.set(0, 0, -12);
    for (let i = 0; i < 200; i++) fast.step(0.002, cmd({ thrust: hover }), w);
    expect(fast.crashed).not.toBeNull();
    const slow = airborne();
    slow.vel.set(0, 0, -3);
    let maxBack = 0;
    for (let i = 0; i < 500; i++) {
      slow.step(0.002, cmd({ thrust: hover }), w);
      maxBack = Math.max(maxBack, slow.vel.z);
    }
    expect(slow.crashed).toBeNull();
    // The props hit first; they flex rather than bounce, so it stops at the wall
    // (a little rebound at most) and never passes into it.
    expect(maxBack).toBeGreaterThanOrEqual(0);
    expect(slow.pos.z).toBeGreaterThan(-2 + 0.1);
  });

  it('a bigger drawn drone collides with its arms: banked low, a motor/prop probe touches first', () => {
    const firstContact = (size) => {
      const q = new Quad(P);
      q.setDrawScale(size);
      q.reset(new Vector3(0, 0.6, 0));
      q.quat.setFromAxisAngle(new Vector3(0, 0, 1), 0.7); // banked 40 deg
      q.vel.set(0, -1, 0);
      q.lastContactProbe = null;
      const w = flat();
      for (let i = 0; i < 600 && q.lastContactProbe === null; i++) q.step(0.002, cmd(), w);
      return { probe: q.lastContactProbe, gap: q.pos.y - P.radius };
    };
    const large = firstContact(3);
    expect(large.probe).toBeGreaterThanOrEqual(0); // not the centre sphere
    expect(large.gap).toBeGreaterThan(0.1); // the centre is still well clear
  });

  it('a thin pole between the front props of a 3x drone is hit', () => {
    const w = new CollisionWorld(() => -100);
    w.addCylinder({ x: 0, z: -0.2, y0: 0, y1: 40, r: 0.06 });
    const q = airborne();
    q.setDrawScale(3);
    q.vel.set(0, 0, -1);
    let touched = false;
    for (let i = 0; i < 300 && !touched; i++) {
      q.step(0.002, cmd({ thrust: hover }), w);
      touched = q.lastContactProbe !== null && q.lastContactProbe !== undefined;
    }
    expect(touched).toBe(true);
    expect(q.pos.z).toBeGreaterThan(-0.2 + 0.06 + P.radius); // stopped before the centre reached it
  });

  it('a disarmed drop below crash speed ends upright for every preset and size', () => {
    for (const preset of Object.values(PRESETS)) {
      for (const size of [1, 1.5, 3]) {
        for (const bank of [0.1, 0.2, 0.35]) {
          const q = new Quad(preset);
          q.setDrawScale(size);
          q.reset(new Vector3(0, 0.6, 0));
          q.quat.setFromAxisAngle(new Vector3(0, 0, 1), bank);
          q.vel.set(0, -Math.min(4, preset.crashSpeed * 0.6), 0);
          const w = flat();
          for (let i = 0; i < 2500; i++) q.step(0.002, cmd(), w);
          expect(q.crashed, `${preset.label} ${size}x bank ${bank}`).toBeNull();
          expect(q.up().y, `${preset.label} ${size}x bank ${bank}`).toBeGreaterThan(0.95);
        }
      }
    }
  });

  it('setParams keeps the drawn size for the probes', () => {
    const q = new Quad(P);
    q.setDrawScale(3);
    q.setParams(PRESETS.whoop);
    expect(q.drawScale).toBe(3);
    const reach = Math.max(...q.probes.map((p) => Math.hypot(p.offset.x, p.offset.z) + p.radius));
    expect(reach).toBeCloseTo((Math.hypot(0.078 + 0.042, 0.078) + 0.024) * PRESETS.whoop.modelScale * 3, 3);
  });

  it('a prop strike at speed is a crash for a big drone, even if the centre stays clear', () => {
    const q = new Quad(P);
    q.setDrawScale(3);
    q.reset(new Vector3(0, 0.3, 0));
    q.quat.setFromAxisAngle(new Vector3(0, 0, 1), 0.9); // steep bank: arm well below the centre
    q.vel.set(0, -8, 0);
    let minCentreGap = Infinity;
    for (let i = 0; i < 200 && !q.crashed; i++) {
      q.step(0.002, cmd(), flat());
      minCentreGap = Math.min(minCentreGap, q.pos.y - P.radius);
    }
    expect(q.crashed).not.toBeNull();
    expect(minCentreGap).toBeGreaterThan(0.05);
  });

  it('a level landing at 3x size rests on the centre sphere as before', () => {
    const q = new Quad(P);
    q.setDrawScale(3);
    q.reset(new Vector3(0, 0.5, 0));
    for (let i = 0; i < 1000; i++) q.step(0.002, cmd(), flat());
    expect(q.crashed).toBeNull();
    expect(q.pos.y).toBeCloseTo(P.radius, 2);
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

  it('armed on the ground at low throttle, full yaw/roll does not spin it', () => {
    const q = new Quad(P);
    q.reset(new Vector3(0, P.radius, 0));
    q.armed = true;
    const w = flat();
    for (let i = 0; i < 1000; i++) q.step(0.002, cmd({ thrust: 0, yaw: -1, roll: 1, pitch: -1 }), w);
    expect(q.omega.length()).toBeLessThan(0.01);
    // At most a degree or two from the first step, before the contact registers.
    expect(Math.abs(q.heading)).toBeLessThan(0.035);
    // With take-off thrust the sticks work again.
    for (let i = 0; i < 100; i++) q.step(0.002, cmd({ thrust: 0.6, yaw: 1 }), w);
    expect(q.omega.y).toBeLessThan(-1);
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

  it('pushes a sphere whose centre is inside a box out through the nearest face', () => {
    const w = new CollisionWorld(() => -100);
    w.addBox({ x: 0, y: 0, z: 0, hx: 1, hy: 1, hz: 1 });
    const c = w.contacts(new Vector3(0, 0.9, 0.2), 0.1);
    expect(c[0].normal.y).toBe(1);
    expect(c[0].depth).toBeCloseTo(0.2, 6);
  });

  it('skips disabled colliders', () => {
    const w = new CollisionWorld(() => -100);
    const c = w.addCylinder({ x: 0, z: 0, y0: 0, y1: 5, r: 1 });
    c.enabled = false;
    expect(w.contacts(new Vector3(0, 1, 0), 0.1)).toHaveLength(0);
  });
});
