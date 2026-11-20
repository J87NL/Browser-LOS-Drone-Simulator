export const RACE = {
  gatePoints: 100,
  lapPoints: 200,
  parSeconds: 45,
  pointsPerSecondUnderPar: 20,
  crashPoints: -150,
  ghostInterval: 0.05,
};

export const RACE_GATES = [
  { x: 38, z: -8, yaw: 0, width: 4, height: 2.6, bottom: 0, label: 'START' },
  { x: 38, z: -22, yaw: 0, width: 2.4, height: 1.8, bottom: 0.5 },
  { x: 46, z: -36, yaw: -0.6, width: 2.4, height: 1.8, bottom: 0.5 },
  { x: 56, z: -46, yaw: -1.2, width: 2.4, height: 1.8, bottom: 3.2 },
  { x: 62, z: -32, yaw: Math.PI, width: 2.4, height: 1.8, bottom: 0.5 },
  { x: 57, z: -16, yaw: 2.6, width: 2.4, height: 1.2, bottom: 0.4 },
  { x: 48, z: -3, yaw: Math.PI / 2, width: 2.4, height: 1.8, bottom: 0.5 },
];

/** Signed distance along the gate's pass direction axis: positive before the gate, negative after. */
function sideOf(gate, x, z) {
  return (x - gate.x) * Math.sin(gate.yaw) + (z - gate.z) * Math.cos(gate.yaw);
}

/**
 * Whether the straight move from `from` to `to` flies through the opening of
 * `gate` in its pass direction. `ground` is the terrain height at the gate.
 */
export function crossesGate(gate, from, to, ground = 0) {
  const before = sideOf(gate, from.x, from.z);
  const after = sideOf(gate, to.x, to.z);
  if (!(before > 0 && after <= 0)) return false;
  const t = before / (before - after);
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const z = from.z + (to.z - from.z) * t;
  const lateral = (x - gate.x) * Math.cos(gate.yaw) - (z - gate.z) * Math.sin(gate.yaw);
  const bottom = ground + gate.bottom;
  return Math.abs(lateral) <= gate.width / 2 && y >= bottom && y <= bottom + gate.height;
}

export function lapBonus(lapSeconds) {
  const underPar = Math.max(0, RACE.parSeconds - lapSeconds);
  return RACE.lapPoints + Math.round(underPar * RACE.pointsPerSecondUnderPar);
}

/**
 * Lap race through `gates` in order. Gate 0 is start and finish.
 * `update` returns the events of this move: start, gate, lap, crash.
 */
export function createRace(gates = RACE_GATES, groundAt = () => 0) {
  const state = {
    running: false,
    next: 0,
    time: 0,
    points: 0,
    lapStart: 0,
    lastLap: null,
    bestLap: null,
  };

  const crossed = (index, from, to) => {
    const gate = gates[index];
    return crossesGate(gate, from, to, groundAt(gate.x, gate.z));
  };

  return {
    state,
    gateCount: gates.length,
    reset() {
      state.running = false;
      state.next = 0;
      state.time = 0;
      state.points = 0;
    },
    /** @returns {{type:'start'|'gate'|'lap'|'crash', gate?:number, lapSeconds?:number, points?:number, best?:boolean}[]} */
    update(dt, from, to, crashed = false) {
      const events = [];
      if (state.running) state.time += dt;
      if (state.running && crashed) {
        state.points += RACE.crashPoints;
        state.running = false;
        state.next = 0;
        events.push({ type: 'crash', points: state.points });
        return events;
      }
      if (!crossed(state.next, from, to)) return events;

      if (!state.running) {
        state.running = true;
        state.time = 0;
        state.points = 0;
        state.lapStart = 0;
        state.next = 1;
        events.push({ type: 'start' });
        return events;
      }
      if (state.next !== 0) {
        state.points += RACE.gatePoints;
        events.push({ type: 'gate', gate: state.next });
        state.next = (state.next + 1) % gates.length;
        return events;
      }
      const lapSeconds = state.time - state.lapStart;
      const best = state.bestLap === null || lapSeconds < state.bestLap;
      state.points += lapBonus(lapSeconds);
      state.lastLap = lapSeconds;
      if (best) state.bestLap = lapSeconds;
      state.lapStart = state.time;
      state.next = 1;
      events.push({ type: 'lap', lapSeconds, points: state.points, best });
      return events;
    },
  };
}

/** Samples [x, y, z, yaw] every RACE.ghostInterval seconds of a lap. */
export function createGhostRecorder() {
  let samples = [];
  let since = 0;
  return {
    start() {
      samples = [];
      since = RACE.ghostInterval;
    },
    sample(dt, pos, heading) {
      since += dt;
      if (since < RACE.ghostInterval) return;
      since -= RACE.ghostInterval;
      samples.push(+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2), +heading.toFixed(2));
    },
    get samples() {
      return samples;
    },
  };
}

/** Ghost pose at `seconds` into the lap, interpolated between samples; null past the end. */
export function ghostPose(samples, seconds) {
  const count = samples.length / 4;
  if (count < 2) return null;
  const f = seconds / RACE.ghostInterval;
  const i = Math.floor(f);
  if (i >= count - 1) return null;
  const t = f - i;
  const at = (k) => samples[i * 4 + k] + (samples[(i + 1) * 4 + k] - samples[i * 4 + k]) * t;
  return { x: at(0), y: at(1), z: at(2), heading: samples[i * 4 + 3] };
}
