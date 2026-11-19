import { describe, it, expect } from 'vitest';
import { analyseSky } from '../src/photo.js';

function sky(w, h, sunX, sunY) {
  const data = new Float32Array(w * h * 4).fill(0.5);
  const i = (sunY * w + sunX) * 4;
  data[i] = data[i + 1] = data[i + 2] = 1000;
  return { width: w, height: h, data };
}

describe('analyseSky', () => {
  it('turns the brightest pixel into the sun direction (three.js equirect mapping)', () => {
    // u = 0.75 -> phi = +90 deg -> +Z; row 64 of 256 -> v = 0.748 -> ~44.6 deg up
    const { sun } = analyseSky(sky(512, 256, 383, 64));
    expect(sun.x).toBeCloseTo(0, 1);
    expect(sun.z).toBeGreaterThan(0.6);
    expect(Math.asin(sun.y) * 180 / Math.PI).toBeCloseTo(44.6, 0);
  });

  it('keeps the sun at least 12 degrees up so shadows stay usable', () => {
    const { sun } = analyseSky(sky(512, 256, 0, 126)); // just above the horizon
    expect(Math.asin(sun.y) * 180 / Math.PI).toBeGreaterThanOrEqual(11.99);
  });

  it('averages the horizon band for the fog colour', () => {
    const { horizon } = analyseSky(sky(64, 32, 10, 2));
    expect(horizon[0]).toBeCloseTo(0.5, 6);
  });
});
