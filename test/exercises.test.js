import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  EIGHT_GATES, HOVER_SPOT, LANDING_SPOT,
  createEightExercise, createHoverExercise, createLandingExercise, isNoseIn, landingPoints,
} from '../src/race/exercises.js';

const pilot = new Vector3(0, 0, 6);

describe('isNoseIn', () => {
  it('is true when the nose points at the pilot, false tail-in or side-on', () => {
    const pos = new Vector3(0, 2, -10);
    expect(isNoseIn(pos, Math.PI, pilot)).toBe(true);
    expect(isNoseIn(pos, 0, pilot)).toBe(false);
    expect(isNoseIn(pos, Math.PI / 2, pilot)).toBe(false);
  });
});

describe('hover exercise', () => {
  const inRing = new Vector3(HOVER_SPOT.x, 2.5, HOVER_SPOT.z);
  const facing = Math.atan2(-(pilot.x - inRing.x), -(pilot.z - inRing.z));

  it('counts nose-in time inside the ring and keeps the best streak', () => {
    const hover = createHoverExercise();
    const flying = { pos: inRing, heading: facing, pilot, armed: true, crashed: false };
    for (let i = 0; i < 30; i++) hover.update(0.1, flying);
    expect(hover.state.streak).toBeCloseTo(3);
    const end = hover.update(0.1, { ...flying, heading: facing + Math.PI });
    expect(end).toMatchObject({ type: 'end', best: true });
    expect(end.seconds).toBeCloseTo(3);
    expect(hover.state.best).toBeCloseTo(3);
  });

  it('does not count outside the height band', () => {
    const hover = createHoverExercise();
    hover.update(1, { pos: new Vector3(HOVER_SPOT.x, 0.5, HOVER_SPOT.z), heading: facing, pilot, armed: true, crashed: false });
    expect(hover.state.streak).toBe(0);
  });
});

describe('landing exercise', () => {
  const still = new Vector3();
  const at = (dx, y) => new Vector3(LANDING_SPOT.x + dx, y, LANDING_SPOT.z);

  it('scores a landing by distance only after a real lift-off', () => {
    const landing = createLandingExercise();
    expect(landing.update(0.1, { pos: at(0, 0.2), vel: still, grounded: true, armed: true })).toBeNull();
    landing.update(0.1, { pos: at(0, 3), vel: still, grounded: false, armed: true });
    expect(landing.update(0.1, { pos: at(0.4, 0.2), vel: still, grounded: true, armed: true })).toMatchObject({ points: 50, best: true });
    expect(landing.update(0.1, { pos: at(0.1, 0.2), vel: still, grounded: true, armed: true })).toBeNull();
  });

  it('maps distance to ring points', () => {
    expect(landingPoints(0.1)).toBe(100);
    expect(landingPoints(0.9)).toBe(25);
    expect(landingPoints(5)).toBe(0);
  });
});

describe('figure eight exercise', () => {
  const pass = (eight, gate, dt = 1) => {
    const back = { x: Math.sin(gate.yaw), z: Math.cos(gate.yaw) };
    return eight.update(dt, {
      from: new Vector3(gate.x + back.x, 2, gate.z + back.z),
      to: new Vector3(gate.x - back.x, 2, gate.z - back.z),
      crashed: false,
    });
  };

  it('times a full eight through the middle, round right, middle, round left', () => {
    const eight = createEightExercise();
    pass(eight, EIGHT_GATES[0]);
    pass(eight, EIGHT_GATES[1]);
    pass(eight, EIGHT_GATES[2]);
    pass(eight, EIGHT_GATES[3]);
    const done = pass(eight, EIGHT_GATES[0]);
    expect(done).toMatchObject({ type: 'eight', seconds: 4, best: true });
    expect(eight.state.count).toBe(1);
  });

  it('ignores the outer gates flown the wrong way', () => {
    const eight = createEightExercise();
    pass(eight, EIGHT_GATES[0]);
    const right = EIGHT_GATES[1];
    pass(eight, { ...right, yaw: right.yaw + Math.PI });
    expect(eight.state.next).toBe(1);
  });
});
