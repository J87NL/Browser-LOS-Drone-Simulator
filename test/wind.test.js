import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { windAt, gustFactor } from '../src/physics/wind.js';
import { Quad } from '../src/physics/quad.js';
import { CollisionWorld } from '../src/physics/colliders.js';
import { PRESETS, DEFAULT_RATES } from '../src/config.js';

const P = PRESETS.freestyle5;
const cmd = (o = {}) => ({ thrust: 1 / P.thrustToWeight, roll: 0, pitch: 0, yaw: 0, mode: 'angle', rates: DEFAULT_RATES, ...o });

describe('windAt', () => {
  it('is calm at speed 0', () => {
    expect(windAt(3, { windSpeed: 0, windFrom: 90, windGusts: 1 }, new Vector3()).length()).toBe(0);
  });

  it('wind from the right blows to the left (-X); from ahead blows towards the pilot (+Z)', () => {
    const steady = { windSpeed: 5, windGusts: 0 };
    const right = windAt(0, { ...steady, windFrom: 90 }, new Vector3());
    expect(right.x).toBeCloseTo(-5, 6);
    expect(right.z).toBeCloseTo(0, 6);
    const ahead = windAt(0, { ...steady, windFrom: 0 }, new Vector3());
    expect(ahead.z).toBeCloseTo(5, 6);
  });

  it('gusts stay within 1 ± gustiness and are smooth', () => {
    let prev = gustFactor(0, 0.5);
    for (let t = 0; t < 120; t += 0.01) {
      const g = gustFactor(t, 0.5);
      expect(g).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(g).toBeLessThanOrEqual(1.5 + 1e-9);
      expect(Math.abs(g - prev)).toBeLessThan(0.05);
      prev = g;
    }
  });
});

describe('wind on the quad', () => {
  it('a hovering quad drifts downwind until it moves with the air', () => {
    const q = new Quad(P);
    q.reset(new Vector3(0, 30, 0));
    q.armed = true;
    q.thrust = q.maxThrust / P.thrustToWeight;
    q.wind.set(-5, 0, 0);
    for (let i = 0; i < 10000; i++) q.step(0.002, cmd());
    expect(q.vel.x).toBeLessThan(-4.5);
    expect(q.vel.x).toBeGreaterThan(-5.01);
    expect(q.pos.x).toBeLessThan(-20);
  });

  it('a quad resting on the ground is not blown away', () => {
    const q = new Quad(P);
    q.reset(new Vector3(0, P.radius, 0));
    q.wind.set(-12, 0, 0);
    const w = new CollisionWorld(() => 0);
    for (let i = 0; i < 2500; i++) q.step(0.002, cmd({ thrust: 0 }), w);
    expect(Math.abs(q.pos.x)).toBeLessThan(0.01);
  });
});
