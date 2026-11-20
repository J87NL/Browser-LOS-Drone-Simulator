import { crossesGate } from './race.js';

export const HOVER_SPOT = { x: 8, z: -4, radius: 1.5, low: 1.5, high: 3.5, noseInCos: Math.cos(Math.PI / 4), zone: 8 };

export const LANDING_SPOT = {
  x: -8,
  z: -4,
  top: 0.12,
  half: 1.6,
  rings: [
    { radius: 0.25, points: 100 },
    { radius: 0.5, points: 50 },
    { radius: 1, points: 25 },
    { radius: 1.6, points: 10 },
  ],
  liftOff: 1,
  restSpeed: 0.5,
  zone: 8,
};

export const EIGHT_POLES = { left: { x: -6, z: -12 }, right: { x: 6, z: -12 }, height: 4, zone: 10 };

export const EIGHT_GATES = [
  { x: 0, z: -12, yaw: 0, width: 4, height: 8, bottom: 0.3 },
  { x: 12, z: -12, yaw: Math.PI, width: 6, height: 8, bottom: 0.3 },
  { x: 0, z: -12, yaw: 0, width: 4, height: 8, bottom: 0.3 },
  { x: -12, z: -12, yaw: Math.PI, width: 6, height: 8, bottom: 0.3 },
];

const near = (pos, spot, distance) => Math.hypot(pos.x - spot.x, pos.z - spot.z) < distance;

/** Whether the drone's nose points at the pilot, within `minCos` (cosine of the allowed angle). */
export function isNoseIn(pos, heading, pilot, minCos = HOVER_SPOT.noseInCos) {
  const dx = pilot.x - pos.x;
  const dz = pilot.z - pos.z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return false;
  return (-Math.sin(heading) * dx - Math.cos(heading) * dz) / length >= minCos;
}

/** Hold a hover inside the ring with the nose towards the pilot as long as you can. */
export function createHoverExercise() {
  const state = { streak: 0, best: 0, inside: false, noseIn: false };
  return {
    state,
    active: (pos) => near(pos, HOVER_SPOT, HOVER_SPOT.zone),
    /** @returns {{type:'end', seconds:number, best:boolean}|null} */
    update(dt, { pos, heading, pilot, armed, crashed, ground = 0 }) {
      const height = pos.y - ground;
      state.inside = armed && !crashed && near(pos, HOVER_SPOT, HOVER_SPOT.radius)
        && height >= HOVER_SPOT.low && height <= HOVER_SPOT.high;
      state.noseIn = isNoseIn(pos, heading, pilot);
      if (state.inside && state.noseIn) {
        state.streak += dt;
        return null;
      }
      if (state.streak === 0) return null;
      const seconds = state.streak;
      const best = seconds > state.best;
      if (best) state.best = seconds;
      state.streak = 0;
      return { type: 'end', seconds, best };
    },
  };
}

export function landingPoints(distance) {
  return LANDING_SPOT.rings.find((ring) => distance <= ring.radius)?.points ?? 0;
}

/** Land on the target: points for how close to the centre the drone comes to rest. */
export function createLandingExercise() {
  const state = { airborne: false, last: null, best: 0 };
  return {
    state,
    active: (pos) => near(pos, LANDING_SPOT, LANDING_SPOT.zone),
    /** @returns {{type:'landed', points:number, distance:number, best:boolean}|null} */
    update(dt, { pos, vel, grounded, armed, crashed, ground = 0 }) {
      if (crashed) {
        state.airborne = false;
        return null;
      }
      if (armed && pos.y - ground > LANDING_SPOT.liftOff) state.airborne = true;
      if (!state.airborne || !grounded || vel.length() > LANDING_SPOT.restSpeed) return null;
      state.airborne = false;
      const distance = Math.hypot(pos.x - LANDING_SPOT.x, pos.z - LANDING_SPOT.z);
      if (distance > LANDING_SPOT.half * Math.SQRT2) return null;
      const points = landingPoints(distance);
      const best = points > state.best;
      if (best) state.best = points;
      state.last = points;
      return { type: 'landed', points, distance, best };
    },
  };
}

/** Fly figure eights around the two poles: through the middle, round the right pole, through the middle, round the left pole. */
export function createEightExercise(groundAt = () => 0) {
  const state = { next: 0, time: 0, started: false, last: null, best: null, count: 0 };
  return {
    state,
    active: (pos) => near(pos, { x: 0, z: EIGHT_POLES.left.z }, EIGHT_POLES.zone),
    reset() {
      state.next = 0;
      state.time = 0;
      state.started = false;
    },
    /** @returns {{type:'eight', seconds:number, best:boolean}|null} */
    update(dt, { from, to, crashed }) {
      if (crashed) {
        this.reset();
        return null;
      }
      if (state.started) state.time += dt;
      const gate = EIGHT_GATES[state.next];
      if (!crossesGate(gate, from, to, groundAt(gate.x, gate.z))) return null;
      if (state.next === 0 && state.started) {
        const seconds = state.time;
        const best = state.best === null || seconds < state.best;
        if (best) state.best = seconds;
        state.last = seconds;
        state.count++;
        state.time = 0;
        state.next = 1;
        return { type: 'eight', seconds, best };
      }
      if (state.next === 0) {
        state.started = true;
        state.time = 0;
      }
      state.next = (state.next + 1) % EIGHT_GATES.length;
      return null;
    },
  };
}
