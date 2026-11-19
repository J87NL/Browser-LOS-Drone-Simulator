// Wind: a steady wind plus smooth gusts, as a pure function of simulation time
// (so it is the same at any frame rate). Directions are relative to the
// pilot's view at the start position, who looks towards -Z.
const D2R = Math.PI / 180;

/**
 * Gust factor around 1: a sum of slow sines, so it varies smoothly between
 * about 1 - gustiness and 1 + gustiness.
 */
export function gustFactor(t, gustiness) {
  const g = 0.5 * Math.sin(0.63 * t) + 0.3 * Math.sin(1.71 * t + 1.3) + 0.2 * Math.sin(4.1 * t + 2.1);
  return Math.max(0, 1 + gustiness * g);
}

/**
 * Wind velocity (m/s, world frame) at time t.
 * @param {number} t simulation time (s)
 * @param {{windSpeed:number, windFrom:number, windGusts:number}} s
 *   windFrom: where the wind comes from, degrees clockwise from straight
 *   ahead of the pilot (0 = in your face, 90 = from the right).
 * @param {{x:number,y:number,z:number}} out
 */
export function windAt(t, { windSpeed, windFrom, windGusts }, out) {
  if (!(windSpeed > 0)) {
    out.x = out.y = out.z = 0;
    return out;
  }
  const speed = windSpeed * gustFactor(t, windGusts);
  // Gusts also swing the direction a little (up to about 15 degrees).
  const a = (windFrom + windGusts * 15 * Math.sin(0.37 * t + 0.5)) * D2R;
  // "From" direction is (sin a, 0, -cos a); the air moves the other way.
  out.x = -Math.sin(a) * speed;
  out.y = 0;
  out.z = Math.cos(a) * speed;
  return out;
}
