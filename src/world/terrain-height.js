// Procedural ground height, shared by the terrain mesh and the physics.
// Flat around the launch pad, gentle undulation further out, hills at the edges.
import { WORLD } from '../config.js';

function hash(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function valueNoise(x, z, seed = WORLD.seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function fbm(x, z, octaves = 4, seed = WORLD.seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return smooth(t);
}

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < WORLD.flatRadius) return 0;
  const undulate = smoothstep(WORLD.flatRadius, WORLD.flatRadius + 60, r) * (fbm(x / 35, z / 35, 3) - 0.5) * 1.4;
  const hillMask = smoothstep(WORLD.hillStart, WORLD.hillStart + 220, r);
  const hills = hillMask * hillMask * (0.35 + fbm(x / 80, z / 80, 4)) * WORLD.hillHeight;
  return undulate + hills;
}
