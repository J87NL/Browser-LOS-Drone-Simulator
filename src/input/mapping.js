// Pure gamepad mapping logic: calibration data, normalisation, mode presets,
// and stick/switch detection. No DOM access, so it can be unit tested.
import { INPUT } from '../config.js';

export const STICKS = ['throttle', 'yaw', 'pitch', 'roll'];
export const ACTIONS = ['arm', 'camera', 'flightMode', 'reset', 'pilot'];
/** Keyboard keys that always trigger the same actions (see keyboard.js). */
export const ACTION_KEYS = { arm: 'Space', camera: 'C', flightMode: 'M', reset: 'R', pilot: 'P' };
export const ACTION_LABELS = {
  arm: 'Arm / disarm',
  camera: 'Camera mode',
  flightMode: 'Flight mode',
  reset: 'Reset',
  pilot: 'Set pilot position',
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Rescale so |v| < dz -> 0 and the remaining range still reaches 1. */
export function applyDeadzone(v, dz) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return (Math.sign(v) * (a - dz)) / (1 - dz);
}

/**
 * Normalise a raw self-centring stick axis to -1..1 using min/center/max.
 * @param {number} raw
 * @param {{min:number,max:number,center:number,invert:boolean}} cal
 * @param {number} deadzone
 */
export function normalizeStick(raw, cal, deadzone = INPUT.deadzone) {
  const { min, max, center } = cal;
  let v;
  if (raw >= center) v = max - center > 1e-6 ? (raw - center) / (max - center) : 0;
  else v = center - min > 1e-6 ? (raw - center) / (center - min) : 0;
  v = clamp(v, -1, 1);
  if (cal.invert) v = -v;
  return applyDeadzone(v, deadzone);
}

/**
 * Normalise a throttle axis to 0..1 using the full min..max range.
 * A deadzone at the bottom makes "throttle low" reliable for arming.
 */
export function normalizeThrottle(raw, cal, deadzone = INPUT.deadzone) {
  const span = cal.max - cal.min;
  let t = Math.abs(span) > 1e-6 ? (raw - cal.min) / span : 0;
  t = clamp(t, 0, 1);
  if (cal.invert) t = 1 - t;
  if (t <= deadzone) return 0;
  return (t - deadzone) / (1 - deadzone);
}

/** Is a button binding active? */
export function bindingActive(binding, gp) {
  if (!binding || !gp) return false;
  if (binding.type === 'button') {
    const b = gp.buttons[binding.index];
    return !!b && (b.pressed || b.value > INPUT.switchThreshold);
  }
  if (binding.type === 'axis') {
    const v = gp.axes[binding.index];
    return typeof v === 'number' && v * binding.dir > (binding.threshold ?? INPUT.switchThreshold);
  }
  return false;
}

const stickCal = (index, invert = false) => ({ index, invert, min: -1, max: 1, center: 0 });

/**
 * Default axis layout for a standard-mapping gamepad.
 * Axes 0/1 = left stick X/Y, 2/3 = right stick X/Y. Stick "up" reads -1,
 * so vertical axes are inverted to make up = positive.
 * @param {1|2|3|4} mode
 */
export function modePreset(mode) {
  const LX = 0, LY = 1, RX = 2, RY = 3;
  const layouts = {
    1: { throttle: RY, yaw: LX, pitch: LY, roll: RX },
    2: { throttle: LY, yaw: LX, pitch: RY, roll: RX },
    3: { throttle: RY, yaw: RX, pitch: LY, roll: LX },
    4: { throttle: LY, yaw: RX, pitch: RY, roll: LX },
  };
  const l = layouts[mode] ?? layouts[2];
  const vertical = (i) => i === LY || i === RY;
  const axes = {};
  for (const s of STICKS) axes[s] = stickCal(l[s], vertical(l[s]));
  return axes;
}

/**
 * Which physical stick and direction a function is on for a stick mode,
 * e.g. yaw in mode 2 -> { stick: 'left', direction: 'left–right' }.
 */
export function stickLocation(stick, mode) {
  const index = modePreset(mode)[stick].index; // 0/1 left X/Y, 2/3 right X/Y
  return { stick: index < 2 ? 'left' : 'right', direction: index % 2 === 0 ? 'left–right' : 'up–down' };
}

/** A fresh mapping. Standard gamepads get sensible buttons too. */
export function defaultMapping(standard = true, mode = 2) {
  return {
    version: 1,
    stickMode: mode,
    axes: modePreset(mode),
    deadzone: INPUT.deadzone,
    buttons: standard
      ? {
          arm: { type: 'button', index: 0 }, // A / Cross
          camera: { type: 'button', index: 3 }, // Y / Triangle
          flightMode: { type: 'button', index: 2 }, // X / Square
          reset: { type: 'button', index: 1 }, // B / Circle
          pilot: { type: 'button', index: 5 }, // right bumper
        }
      : { arm: null, camera: null, flightMode: null, reset: null, pilot: null },
  };
}

/**
 * Apply a mapping to a gamepad snapshot ({axes:number[], buttons:{pressed,value}[]}).
 * @returns {{throttle:number,yaw:number,pitch:number,roll:number,actions:Record<string,boolean>}}
 */
export function mapGamepad(gp, mapping) {
  const out = { throttle: 0, yaw: 0, pitch: 0, roll: 0, actions: {} };
  if (!gp || !mapping) return out;
  const dz = mapping.deadzone ?? INPUT.deadzone;
  for (const s of STICKS) {
    const cal = mapping.axes[s];
    if (!cal || cal.index == null || cal.index < 0) continue;
    const raw = gp.axes[cal.index];
    if (typeof raw !== 'number') continue;
    out[s] = s === 'throttle' ? normalizeThrottle(raw, cal, dz) : normalizeStick(raw, cal, dz);
  }
  for (const a of ACTIONS) out.actions[a] = bindingActive(mapping.buttons[a], gp);
  return out;
}

/**
 * Tracks per-axis min/max while the user moves one stick, then picks the
 * axis that moved the most.
 */
export class AxisDetector {
  constructor(exclude = []) {
    this.exclude = new Set(exclude);
    this.min = [];
    this.max = [];
    this.last = [];
  }

  sample(axes) {
    axes.forEach((v, i) => {
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      this.min[i] = Math.min(this.min[i] ?? v, v);
      this.max[i] = Math.max(this.max[i] ?? v, v);
      this.last[i] = v;
    });
  }

  /**
   * @param {number} minRange movement below this is ignored
   * @returns {{index:number,min:number,max:number,last:number,range:number}|null}
   */
  result(minRange = 0.3) {
    let best = null;
    for (let i = 0; i < this.max.length; i++) {
      if (this.exclude.has(i) || this.max[i] == null) continue;
      const range = this.max[i] - this.min[i];
      if (range >= minRange && (!best || range > best.range)) {
        best = { index: i, min: this.min[i], max: this.max[i], last: this.last[i], range };
      }
    }
    return best;
  }
}

/**
 * True when the last sample sits within 25% of either end of the range. For a
 * self-centring stick (`twoSided`) the stick must also have moved both ways,
 * otherwise the centre would count as an "end".
 */
export function heldAtEnd(r, twoSided = false) {
  if (twoSided && r.range < 1.2) return false;
  return Math.min(Math.abs(r.last - r.min), Math.abs(r.last - r.max)) <= 0.25 * r.range;
}

/**
 * Put a detected axis on `step`. With `swap`, a stick that already used that
 * axis gets the old axis of `step` with a neutral calibration (its own
 * min/max/invert belonged to the other axis). Returns that stick's name, if any.
 */
export function assignDetectedAxis(mapping, step, det, swap) {
  const prev = mapping.axes[step];
  let swapped = null;
  if (swap) {
    swapped = STICKS.find((s) => s !== step && mapping.axes[s]?.index === det.index) ?? null;
    if (swapped) mapping.axes[swapped] = { index: prev?.index ?? -1, invert: false, min: -1, max: 1, center: 0 };
  }
  const prevCenter = prev?.index === det.index ? prev.center : null;
  mapping.axes[step] = calibrationFromDetection(det, prevCenter);
  return swapped;
}

/**
 * Build the calibration for a detected stick. The user ends the capture with
 * the stick held at its "positive" end (throttle up, yaw/roll right, pitch
 * forward); if that end reads closer to the axis minimum, the axis is inverted.
 */
export function calibrationFromDetection(det, previousCenter = null) {
  const invert = Math.abs(det.last - det.min) < Math.abs(det.last - det.max);
  const mid = (det.min + det.max) / 2;
  return {
    index: det.index,
    invert,
    min: det.min,
    max: det.max,
    center: previousCenter != null && previousCenter > det.min && previousCenter < det.max ? previousCenter : mid,
  };
}

/**
 * Detect a button press or a switch flip relative to a baseline snapshot.
 * Axes in `excludeAxes` (the sticks) are ignored.
 * @returns {{type:'button',index:number}|{type:'axis',index:number,dir:1|-1}|null}
 */
export function detectBinding(baseline, gp, excludeAxes = []) {
  for (let i = 0; i < gp.buttons.length; i++) {
    const now = gp.buttons[i]?.pressed;
    const before = baseline.buttons[i]?.pressed;
    if (now && !before) return { type: 'button', index: i };
  }
  const skip = new Set(excludeAxes);
  for (let i = 0; i < gp.axes.length; i++) {
    if (skip.has(i)) continue;
    const v = gp.axes[i];
    const b = baseline.axes[i] ?? 0;
    if (Math.abs(v - b) > INPUT.switchThreshold && Math.abs(v) > INPUT.switchThreshold) {
      return { type: 'axis', index: i, dir: v > 0 ? 1 : -1 };
    }
  }
  return null;
}

/** Snapshot a live Gamepad into plain data. */
export function snapshot(gp) {
  return {
    axes: Array.from(gp.axes),
    buttons: Array.from(gp.buttons, (b) => ({ pressed: b.pressed, value: b.value })),
  };
}

export function describeBinding(b) {
  if (!b) return '—';
  if (b.type === 'button') return `Button ${b.index}`;
  return `Axis ${b.index} ${b.dir > 0 ? '+' : '−'} (switch)`;
}

/** Validate/repair a mapping loaded from storage. Returns null if unusable. */
export function sanitizeMapping(m) {
  if (!m || typeof m !== 'object' || !m.axes || !m.buttons) return null;
  const out = defaultMapping(false, m.stickMode ?? 2);
  out.deadzone = Number.isFinite(m.deadzone) ? clamp(m.deadzone, 0, 0.5) : INPUT.deadzone;
  for (const s of STICKS) {
    const a = m.axes[s];
    if (!a) continue;
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    out.axes[s] = {
      index: Number.isInteger(a.index) ? a.index : -1,
      invert: !!a.invert,
      min: num(a.min, -1),
      max: num(a.max, 1),
      center: num(a.center, 0),
    };
  }
  for (const act of ACTIONS) {
    const b = m.buttons[act];
    if (b && b.type === 'button' && Number.isInteger(b.index)) out.buttons[act] = { type: 'button', index: b.index };
    else if (b && b.type === 'axis' && Number.isInteger(b.index)) out.buttons[act] = { type: 'axis', index: b.index, dir: b.dir < 0 ? -1 : 1 };
  }
  return out;
}
