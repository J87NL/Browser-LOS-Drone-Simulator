import { describe, it, expect } from 'vitest';
import { actualRate, throttleCurve, inverseThrottleCurve, hoverMappedStick } from '../src/physics/rates.js';
import { shapeThrottle } from '../src/physics/controls.js';

const R = { center: 200, max: 670, expo: 0 };

describe('actualRate', () => {
  it('is zero at center and reaches max at full stick', () => {
    expect(actualRate(0, R)).toBe(0);
    expect(actualRate(1, R)).toBeCloseTo(670, 6);
    expect(actualRate(-1, R)).toBeCloseTo(-670, 6);
  });

  it('is odd-symmetric and monotonic', () => {
    let prev = -Infinity;
    for (let x = -1; x <= 1.0001; x += 0.05) {
      const v = actualRate(x, { ...R, expo: 0.5 });
      expect(v).toBeGreaterThan(prev);
      expect(actualRate(-x, { ...R, expo: 0.5 })).toBeCloseTo(-v, 9);
      prev = v;
    }
  });

  it('has the center sensitivity as slope at center', () => {
    const h = 1e-4;
    expect(actualRate(h, R) / h).toBeCloseTo(200, 0);
  });

  it('expo lowers mid-stick rate but keeps the endpoints', () => {
    const lin = actualRate(0.5, R);
    const exp = actualRate(0.5, { ...R, expo: 0.8 });
    expect(exp).toBeLessThan(lin);
    expect(actualRate(1, { ...R, expo: 0.8 })).toBeCloseTo(670, 6);
  });

  it('never goes below the center rate line when max < center', () => {
    expect(actualRate(1, { center: 300, max: 200, expo: 0 })).toBeCloseTo(300, 6);
  });

  it('clamps stick input', () => {
    expect(actualRate(2, R)).toBeCloseTo(670, 6);
  });
});

describe('throttle curve', () => {
  it('is identity without expo and keeps endpoints and mid with expo', () => {
    expect(throttleCurve(0.3, 0)).toBeCloseTo(0.3, 9);
    for (const e of [0, 0.4, 1]) {
      expect(throttleCurve(0, e)).toBeCloseTo(0, 9);
      expect(throttleCurve(0.5, e)).toBeCloseTo(0.5, 9);
      expect(throttleCurve(1, e)).toBeCloseTo(1, 9);
    }
  });

  it('inverse round-trips', () => {
    for (const e of [0, 0.5, 0.9]) {
      for (const t of [0.1, 0.25, 0.7]) {
        expect(throttleCurve(inverseThrottleCurve(t, e), e)).toBeCloseTo(t, 6);
      }
    }
  });

  it('hover helper maps mid stick to hover thrust', () => {
    for (const e of [0, 0.5]) {
      const hover = 0.25;
      expect(throttleCurve(hoverMappedStick(0.5, hover, e), e)).toBeCloseTo(hover, 6);
      expect(hoverMappedStick(0, hover, e)).toBe(0);
      expect(hoverMappedStick(1, hover, e)).toBeCloseTo(1, 9);
    }
  });

  it('shapeThrottle only applies the hover helper in angle mode', () => {
    const o = { hoverAtCenter: true, throttleExpo: 0, thrustToWeight: 4 };
    expect(shapeThrottle(0.5, { ...o, mode: 'angle' })).toBeCloseTo(0.25, 6);
    expect(shapeThrottle(0.5, { ...o, mode: 'acro' })).toBeCloseTo(0.5, 6);
    expect(shapeThrottle(0.5, { ...o, mode: 'angle', hoverAtCenter: false })).toBeCloseTo(0.5, 6);
  });
});
