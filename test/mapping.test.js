import { describe, it, expect } from 'vitest';
import {
  applyDeadzone, normalizeStick, normalizeThrottle, modePreset, mapGamepad, defaultMapping,
  AxisDetector, calibrationFromDetection, detectBinding, bindingActive, sanitizeMapping,
} from '../src/input/mapping.js';
import { actionEvents } from '../src/input/input.js';

const pad = (axes, pressed = []) => ({
  axes,
  buttons: Array.from({ length: 12 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
});

describe('deadzone and normalisation', () => {
  it('applies a rescaled deadzone', () => {
    expect(applyDeadzone(0.02, 0.03)).toBe(0);
    expect(applyDeadzone(1, 0.03)).toBeCloseTo(1, 9);
    expect(applyDeadzone(-1, 0.03)).toBeCloseTo(-1, 9);
    expect(applyDeadzone(0.515, 0.03)).toBeCloseTo(0.5, 9);
  });

  it('normalises an asymmetric stick around its captured center', () => {
    const cal = { min: -0.8, max: 0.9, center: 0.1, invert: false };
    expect(normalizeStick(0.1, cal, 0)).toBe(0);
    expect(normalizeStick(0.9, cal, 0)).toBeCloseTo(1, 9);
    expect(normalizeStick(-0.8, cal, 0)).toBeCloseTo(-1, 9);
    expect(normalizeStick(0.5, cal, 0)).toBeCloseTo(0.5, 9);
    expect(normalizeStick(2, cal, 0)).toBe(1);
    expect(normalizeStick(0.9, { ...cal, invert: true }, 0)).toBeCloseTo(-1, 9);
  });

  it('does not divide by zero on a degenerate calibration', () => {
    expect(normalizeStick(0.5, { min: 0, max: 0, center: 0 }, 0)).toBe(0);
    expect(normalizeThrottle(0.5, { min: 0.2, max: 0.2 }, 0)).toBe(0);
  });

  it('normalises throttle over the full range, with invert and bottom deadzone', () => {
    const cal = { min: -1, max: 1, invert: false };
    expect(normalizeThrottle(-1, cal, 0.03)).toBe(0);
    expect(normalizeThrottle(-0.97, cal, 0.03)).toBe(0);
    expect(normalizeThrottle(1, cal, 0.03)).toBeCloseTo(1, 9);
    expect(normalizeThrottle(0, cal, 0)).toBeCloseTo(0.5, 9);
    expect(normalizeThrottle(-1, { ...cal, invert: true }, 0)).toBeCloseTo(1, 9);
  });
});

describe('mode presets', () => {
  it('mode 2 puts throttle on the left vertical axis, inverted', () => {
    const m = modePreset(2);
    expect(m.throttle).toMatchObject({ index: 1, invert: true });
    expect(m.yaw).toMatchObject({ index: 0, invert: false });
    expect(m.pitch).toMatchObject({ index: 3, invert: true });
    expect(m.roll).toMatchObject({ index: 2, invert: false });
  });

  it('every mode uses each of the four axes once', () => {
    for (const mode of [1, 2, 3, 4]) {
      const m = modePreset(mode);
      const idx = Object.values(m).map((a) => a.index).sort();
      expect(idx).toEqual([0, 1, 2, 3]);
    }
  });

  it('mode 1 swaps throttle and pitch compared to mode 2', () => {
    const m1 = modePreset(1);
    const m2 = modePreset(2);
    expect(m1.throttle.index).toBe(m2.pitch.index);
    expect(m1.pitch.index).toBe(m2.throttle.index);
  });

  it('maps a standard gamepad: stick up reads -1 -> full throttle and forward pitch', () => {
    const out = mapGamepad(pad([0, -1, 0.5, -1], [0]), defaultMapping(true, 2));
    expect(out.throttle).toBeCloseTo(1, 6);
    expect(out.pitch).toBeCloseTo(1, 6);
    expect(out.roll).toBeGreaterThan(0.4);
    expect(out.yaw).toBe(0);
    expect(out.actions.arm).toBe(true);
    expect(out.actions.camera).toBe(false);
  });
});

describe('detection', () => {
  it('picks the axis that moved most and derives invert from where it ended', () => {
    const d = new AxisDetector();
    d.sample([0, 0, 0.02]);
    d.sample([0, 0.95, 0.01]);
    d.sample([0.05, -0.98, 0]);
    d.sample([0.02, -0.97, 0]); // user ends holding "up", which reads negative
    const r = d.result();
    expect(r.index).toBe(1);
    const cal = calibrationFromDetection(r);
    expect(cal).toMatchObject({ index: 1, invert: true, min: -0.98, max: 0.95 });
  });

  it('ignores excluded axes and tiny movements', () => {
    const d = new AxisDetector([1]);
    d.sample([0, -1, 0]);
    d.sample([0.1, 1, 0]);
    expect(d.result()).toBeNull();
  });

  it('detects a button press and a switch axis, ignoring stick axes', () => {
    const base = pad([0, 0, 0, 0, -1]);
    expect(detectBinding(base, pad([0, 0, 0, 0, -1], [4]))).toEqual({ type: 'button', index: 4 });
    expect(detectBinding(base, pad([0, 0, 0, 0, 1]))).toEqual({ type: 'axis', index: 4, dir: 1 });
    expect(detectBinding(base, pad([0, 0.9, 0, 0, -1]), [0, 1, 2, 3])).toBeNull();
  });

  it('switch bindings use the 0.5 threshold in their direction', () => {
    const b = { type: 'axis', index: 0, dir: -1 };
    expect(bindingActive(b, pad([-0.6]))).toBe(true);
    expect(bindingActive(b, pad([-0.4]))).toBe(false);
    expect(bindingActive(b, pad([0.9]))).toBe(false);
  });
});

describe('action events', () => {
  const m = defaultMapping(true);
  it('toggles on button press only', () => {
    expect(actionEvents({ arm: false }, { arm: true }, m)).toEqual(['armToggle']);
    expect(actionEvents({ arm: true }, { arm: false }, m)).toEqual([]);
  });

  it('switch arm and flight mode are state based', () => {
    const sm = { ...m, buttons: { ...m.buttons, arm: { type: 'axis', index: 4, dir: 1 }, flightMode: { type: 'axis', index: 5, dir: 1 } } };
    expect(actionEvents({ arm: false }, { arm: true }, sm)).toEqual(['arm']);
    expect(actionEvents({ arm: true }, { arm: false }, sm)).toEqual(['disarm']);
    expect(actionEvents({ flightMode: false }, { flightMode: true }, sm)).toEqual(['acro']);
    expect(actionEvents({ flightMode: true }, { flightMode: false }, sm)).toEqual(['angle']);
  });
});

describe('sanitizeMapping', () => {
  it('rejects junk and repairs partial data', () => {
    expect(sanitizeMapping(null)).toBeNull();
    expect(sanitizeMapping('x')).toBeNull();
    const m = sanitizeMapping({
      axes: { throttle: { index: 2, invert: 1, min: 'a', max: 1, center: 0 } },
      buttons: { arm: { type: 'axis', index: 5, dir: -3 }, reset: { type: 'nope' } },
      deadzone: 9,
    });
    expect(m.axes.throttle).toEqual({ index: 2, invert: true, min: -1, max: 1, center: 0 });
    expect(m.buttons.arm).toEqual({ type: 'axis', index: 5, dir: -1 });
    expect(m.buttons.reset).toBeNull();
    expect(m.deadzone).toBe(0.5);
  });

  it('round-trips through JSON', () => {
    const m = defaultMapping(true, 3);
    expect(sanitizeMapping(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
});
