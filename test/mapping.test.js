import { describe, it, expect } from 'vitest';
import {
  applyDeadzone, normalizeStick, normalizeThrottle, modePreset, mapGamepad, defaultMapping,
  AxisDetector, calibrationFromDetection, detectBinding, bindingActive, sanitizeMapping, heldAtEnd, assignDetectedAxis, stickLocation,
} from '../src/input/mapping.js';
import { actionEvents, InputManager, shouldFailsafe } from '../src/input/input.js';
import { GamepadManager } from '../src/input/gamepad.js';

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

  it('names the physical stick for each function and mode', () => {
    expect(stickLocation('yaw', 2)).toEqual({ stick: 'left', direction: 'left–right' });
    expect(stickLocation('throttle', 2)).toEqual({ stick: 'left', direction: 'up–down' });
    expect(stickLocation('pitch', 1)).toEqual({ stick: 'left', direction: 'up–down' });
    expect(stickLocation('throttle', 1)).toEqual({ stick: 'right', direction: 'up–down' });
    expect(stickLocation('yaw', 4)).toEqual({ stick: 'right', direction: 'left–right' });
    expect(stickLocation('roll', 3)).toEqual({ stick: 'left', direction: 'left–right' });
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

  it('only accepts a detection when the stick is held at an end', () => {
    expect(heldAtEnd({ min: -1, max: 1, range: 2, last: 0.95 })).toBe(true);
    expect(heldAtEnd({ min: -1, max: 1, range: 2, last: -0.6 })).toBe(true);
    expect(heldAtEnd({ min: -1, max: 1, range: 2, last: 0.02 })).toBe(false);
  });

  it('a centring stick pushed only one way is rejected (centre is not an end)', () => {
    const oneWay = { min: 0, max: 1, range: 1, last: 0 };
    expect(heldAtEnd(oneWay, true)).toBe(false);
    expect(heldAtEnd({ min: -1, max: 1, range: 2, last: 1 }, true)).toBe(true);
    expect(heldAtEnd({ ...oneWay, last: 1 })).toBe(true); // throttle: one-sided is fine
  });

  it('single-stick detect swaps axes and gives the other stick a neutral calibration', () => {
    const m = defaultMapping(true, 2); // throttle axis 1 (inverted), yaw axis 0
    m.axes.yaw = { index: 0, invert: true, min: -0.7, max: 0.8, center: 0.1 };
    const swapped = assignDetectedAxis(m, 'throttle', { index: 0, min: -1, max: 1, last: 1, range: 2 }, true);
    expect(swapped).toBe('yaw');
    expect(m.axes.yaw).toEqual({ index: 1, invert: false, min: -1, max: 1, center: 0 });
    expect(m.axes.throttle).toMatchObject({ index: 0, invert: false });
    const g = defaultMapping(true, 2);
    expect(assignDetectedAxis(g, 'throttle', { index: 0, min: -1, max: 1, last: 1, range: 2 }, false)).toBeNull();
    expect(g.axes.yaw.index).toBe(0); // guided setup does not swap
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

  it('falls back to mode 2 for a stored stick mode that does not exist', () => {
    const base = { axes: {}, buttons: {} };
    expect(sanitizeMapping({ ...base, stickMode: 7 }).stickMode).toBe(2);
    expect(sanitizeMapping({ ...base, stickMode: '3' }).stickMode).toBe(2);
    expect(sanitizeMapping({ ...base, stickMode: 4 }).stickMode).toBe(4);
  });

  it('round-trips through JSON', () => {
    const m = defaultMapping(true, 3);
    expect(sanitizeMapping(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });
});

describe('InputManager', () => {
  const fakePads = (getThrottleRaw) => {
    const t = new EventTarget();
    t.poll = () => {
      const gp = pad([0, getThrottleRaw(), 0, 0]);
      const mapping = defaultMapping(true);
      return { id: 'pad', gp, mapping, mapped: mapGamepad(gp, mapping) };
    };
    return t;
  };
  const fakeKeyboard = () => ({ enabled: true, usedSticks: false, usedThrottle: false, throttle: 0, sticks: { yaw: 0, pitch: 0, roll: 0 }, update() {}, takeEvents: () => [] });

  it('moving the gamepad throttle takes over from an earlier keyboard throttle', () => {
    let raw = 0; // left stick centre = 50% throttle
    const kb = fakeKeyboard();
    const im = new InputManager(fakePads(() => raw), kb);
    im.update(0.016);
    kb.throttle = 0.4;
    kb.usedThrottle = true;
    expect(im.update(0.016).state.throttle).toBeCloseTo(0.4, 6);
    raw = 1; // stick fully down
    expect(im.update(0.016).state.throttle).toBe(0);
    expect(kb.usedThrottle).toBe(false);
  });

  it('a W/S tap after the pad took over continues from the pad value', () => {
    let raw = 0;
    const kb = fakeKeyboard();
    const im = new InputManager(fakePads(() => raw), kb);
    im.update(0.016);
    kb.throttle = 0.7;
    kb.usedThrottle = true;
    im.update(0.016);
    raw = 1; // pad throttle to the bottom: takes over
    expect(im.update(0.016).state.throttle).toBe(0);
    kb.usedThrottle = true; // a tap on S
    kb.throttle = Math.max(0, kb.throttle - 0.01);
    expect(im.update(0.016).state.throttle).toBe(0);
  });

  it('pad stick noise does not take the throttle away from the keyboard', () => {
    let raw = 0;
    const kb = fakeKeyboard();
    const im = new InputManager(fakePads(() => raw), kb);
    im.update(0.016);
    kb.throttle = 0.42;
    kb.usedThrottle = true;
    for (let i = 0; i < 2000; i++) {
      raw = Math.sin(i * 1.7) * 0.06; // ±0.06 raw jitter around centre
      expect(im.update(0.016).state.throttle).toBe(0.42);
    }
  });

  it('failsafe only for the controller that is flying', () => {
    const st = { source: 'gamepad', gamepadKey: '0:Radio' };
    expect(shouldFailsafe(true, st, '0:Radio')).toBe(true);
    expect(shouldFailsafe(true, st, '1:Xbox pad')).toBe(false);
    expect(shouldFailsafe(false, st, '0:Radio')).toBe(false);
    expect(shouldFailsafe(true, { source: 'keyboard', gamepadKey: null }, '0:Radio')).toBe(false);
  });

  it('does not fire switch events for the switch position at connect', () => {
    const t = new EventTarget();
    const mapping = { ...defaultMapping(false), buttons: { arm: { type: 'axis', index: 4, dir: 1 } } };
    let v = 1;
    t.poll = () => {
      const gp = pad([0, 1, 0, 1, v]);
      return { id: 'radio', gp, mapping, mapped: mapGamepad(gp, mapping) };
    };
    const im = new InputManager(t, fakeKeyboard());
    expect(im.update(0.016).events).toEqual([]);
    v = -1;
    expect(im.update(0.016).events).toEqual(['disarm']);
    v = 1;
    expect(im.update(0.016).events).toEqual(['arm']);
  });

  const switchRadio = (getArm, getMode = () => -1, key = '0:radio') => {
    const t = new EventTarget();
    const mapping = {
      ...defaultMapping(false),
      buttons: { arm: { type: 'axis', index: 4, dir: 1 }, flightMode: { type: 'axis', index: 5, dir: 1 }, reset: { type: 'button', index: 1 } },
    };
    t.poll = () => {
      const gp = pad([0, 1, 0, 1, getArm(), getMode()], t.pressed ?? []);
      return { id: 'radio', key: typeof key === 'function' ? key() : key, gp, mapping, mapped: mapGamepad(gp, mapping) };
    };
    return t;
  };

  it('a disarm or mode switch flipped while paused still applies, an arm flip does not', () => {
    let arm = 1;
    let mode = -1;
    const im = new InputManager(switchRadio(() => arm, () => mode), fakeKeyboard());
    im.update(0.016);
    im.enabled = false;
    arm = -1;
    mode = 1;
    expect(im.update(0.016).events).toEqual(['disarm', 'acro']);
    arm = 1;
    expect(im.update(0.016).events).toEqual([]);
    im.enabled = true;
    expect(im.update(0.016).events).toEqual([]);
  });

  it('button presses while paused are dropped', () => {
    const radio = switchRadio(() => -1);
    const im = new InputManager(radio, fakeKeyboard());
    im.update(0.016);
    im.enabled = false;
    radio.pressed = [1];
    expect(im.update(0.016).events).toEqual([]);
    radio.pressed = [];
    im.update(0.016);
    im.enabled = true;
    expect(im.update(0.016).events).toEqual([]);
  });

  it('a second identical controller taking over does not fire its switch positions', () => {
    let arm = -1;
    let key = '0:radio';
    const im = new InputManager(switchRadio(() => arm, () => -1, () => key), fakeKeyboard());
    im.update(0.016);
    key = '1:radio';
    arm = 1;
    expect(im.update(0.016).events).toEqual([]);
  });
});

describe('GamepadManager storage', () => {
  it('treats prototype-like device ids as plain keys', () => {
    const gm = new GamepadManager();
    expect(gm.hasMapping('__proto__')).toBe(false);
    expect(gm.hasMapping('constructor')).toBe(false);
    gm.setMapping('__proto__', defaultMapping(true));
    expect(gm.hasMapping('__proto__')).toBe(true);
    expect(gm.getMapping({ id: '__proto__', mapping: 'standard' })).toEqual(defaultMapping(true));
    expect(gm.hasMapping('constructor')).toBe(false);
  });
});
