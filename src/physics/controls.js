// Turns stick input into the command the flight model consumes.
import { throttleCurve, hoverMappedStick } from './rates.js';

/**
 * @param {'angle'|'acro'} mode
 * @param {{gps?: boolean}} preset
 * @returns {'angle'|'acro'|'gps'}
 */
export function effectiveFlightMode(mode, preset) {
  if (!preset.gps) return mode;
  return mode === 'angle' ? 'gps' : 'angle';
}

export function gpsClimb(rawThrottle) {
  return Math.min(1, Math.max(-1, (rawThrottle - 0.5) * 2));
}

export const FLIGHT_MODE_LABELS = { angle: 'ANGLE', acro: 'ACRO', gps: 'GPS' };

/**
 * @param {number} rawThrottle 0..1 stick position after calibration
 * @param {object} o
 * @param {'angle'|'acro'} o.mode
 * @param {boolean} o.hoverAtCenter map mid stick to hover in angle mode
 * @param {number} o.throttleExpo
 * @param {number} o.thrustToWeight
 * @returns {number} thrust fraction 0..1
 */
export function shapeThrottle(rawThrottle, { mode, hoverAtCenter, throttleExpo, thrustToWeight }) {
  let s = Math.min(1, Math.max(0, rawThrottle));
  if (mode === 'angle' && hoverAtCenter) {
    s = hoverMappedStick(s, 1 / thrustToWeight, throttleExpo);
  }
  return throttleCurve(s, throttleExpo);
}
