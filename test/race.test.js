import { describe, it, expect } from 'vitest';
import { RACE, crossesGate, createRace, ghostPose, lapBonus } from '../src/race/race.js';

const gate = { x: 0, z: 0, yaw: 0, width: 2, height: 2, bottom: 0.5 };
const p = (x, y, z) => ({ x, y, z });

describe('crossesGate', () => {
  it('counts a pass through the opening in the pass direction', () => {
    expect(crossesGate(gate, p(0, 1.5, 1), p(0, 1.5, -1))).toBe(true);
  });

  it('ignores the wrong direction, a miss beside, under or over the opening', () => {
    expect(crossesGate(gate, p(0, 1.5, -1), p(0, 1.5, 1))).toBe(false);
    expect(crossesGate(gate, p(1.5, 1.5, 1), p(1.5, 1.5, -1))).toBe(false);
    expect(crossesGate(gate, p(0, 0.2, 1), p(0, 0.2, -1))).toBe(false);
    expect(crossesGate(gate, p(0, 3, 1), p(0, 3, -1))).toBe(false);
  });

  it('follows the gate yaw and the ground height', () => {
    const turned = { ...gate, yaw: -Math.PI / 2 };
    expect(crossesGate(turned, p(-1, 1.5, 0), p(1, 1.5, 0))).toBe(true);
    expect(crossesGate(turned, p(1, 1.5, 0), p(-1, 1.5, 0))).toBe(false);
    expect(crossesGate(gate, p(0, 1.5, 1), p(0, 1.5, -1), 2)).toBe(false);
    expect(crossesGate(gate, p(0, 3.5, 1), p(0, 3.5, -1), 2)).toBe(true);
  });
});

describe('createRace', () => {
  const gates = [0, -10, -20].map((z) => ({ ...gate, z }));
  const through = (race, z, dt = 1) => race.update(dt, p(0, 1.5, z + 1), p(0, 1.5, z - 1));

  it('starts at the start gate, scores the gates in order and times the lap', () => {
    const race = createRace(gates);
    expect(through(race, 0)[0].type).toBe('start');
    expect(through(race, -20)).toEqual([]);
    expect(through(race, -10)[0]).toMatchObject({ type: 'gate', gate: 1 });
    expect(through(race, -20)[0]).toMatchObject({ type: 'gate', gate: 2 });
    const [lap] = through(race, 0, 10);
    expect(lap).toMatchObject({ type: 'lap', lapSeconds: 13, best: true });
    expect(race.state.points).toBe(2 * RACE.gatePoints + lapBonus(13));
    expect(race.state.next).toBe(1);
  });

  it('keeps the best lap and costs points on a crash, which ends the run', () => {
    const race = createRace(gates);
    through(race, 0);
    through(race, -10);
    through(race, -20);
    through(race, 0, 5);
    through(race, -10, 20);
    through(race, -20);
    expect(through(race, 0)[0]).toMatchObject({ best: false });
    expect(race.state.bestLap).toBe(7);
    const before = race.state.points;
    expect(race.update(0.1, p(0, 1, 5), p(0, 1, 5), true)[0].type).toBe('crash');
    expect(race.state.points).toBe(before + RACE.crashPoints);
    expect(race.state.running).toBe(false);
  });

  it('gives no time bonus over par', () => {
    expect(lapBonus(RACE.parSeconds + 10)).toBe(RACE.lapPoints);
    expect(lapBonus(RACE.parSeconds - 2)).toBe(RACE.lapPoints + 2 * RACE.pointsPerSecondUnderPar);
  });
});

describe('ghostPose', () => {
  it('interpolates between samples and ends after the last one', () => {
    const samples = [0, 1, 0, 0, 1, 1, -2, 0.5];
    expect(ghostPose(samples, RACE.ghostInterval / 2)).toMatchObject({ x: 0.5, z: -1, heading: 0 });
    expect(ghostPose(samples, RACE.ghostInterval * 2)).toBeNull();
  });
});
