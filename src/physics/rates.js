// Rate curves and throttle shaping. Pure functions, no three.js.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Betaflight "actual rates" for one axis.
 * @param {number} stick -1..1
 * @param {{center:number,max:number,expo:number}} r center sensitivity and max rate in deg/s, expo 0..1
 * @returns {number} target rate in deg/s
 */
export function actualRate(stick, r) {
  const x = clamp(stick, -1, 1);
  const ax = Math.abs(x);
  const expo = clamp(r.expo ?? 0, 0, 1);
  const expof = ax * (x ** 5 * expo + x * (1 - expo));
  const stickMovement = Math.max(0, r.max - r.center);
  return x * r.center + stickMovement * expof;
}

/** Same as actualRate but in rad/s. */
export function actualRateRad(stick, r) {
  return (actualRate(stick, r) * Math.PI) / 180;
}

/**
 * Throttle expo around mid stick (Betaflight style). 0 = linear.
 * @param {number} t 0..1
 * @param {number} expo 0..1
 */
export function throttleCurve(t, expo = 0) {
  const x = clamp(t, 0, 1) * 2 - 1;
  const e = clamp(expo, 0, 1);
  const y = x * (1 - e) + x ** 3 * e;
  return (y + 1) / 2;
}

/** Inverse of throttleCurve by bisection (the curve is monotonic). */
export function inverseThrottleCurve(out, expo = 0) {
  let lo = 0;
  let hi = 1;
  const target = clamp(out, 0, 1);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (throttleCurve(mid, expo) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Hover helper: remap a 0..1 stick so that mid stick (0.5) lands exactly on the
 * stick position that produces hover thrust after the throttle curve.
 * @param {number} stick 0..1
 * @param {number} hoverFraction hover thrust / max thrust (1 / thrust-to-weight)
 * @param {number} expo throttle expo
 */
export function hoverMappedStick(stick, hoverFraction, expo = 0) {
  const s = clamp(stick, 0, 1);
  const hoverStick = inverseThrottleCurve(clamp(hoverFraction, 0.02, 0.98), expo);
  if (s <= 0.5) return (s / 0.5) * hoverStick;
  return hoverStick + ((s - 0.5) / 0.5) * (1 - hoverStick);
}
