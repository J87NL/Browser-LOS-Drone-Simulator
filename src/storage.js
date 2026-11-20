// localStorage helpers. Storage can be unavailable (private windows, blocked
// site data); every access is wrapped so the sim still runs without it.
import { DEFAULT_SETTINGS, DRONE_SIZE_BASE, PRESETS, SETTING_RANGES as RANGES } from './config.js';
import { RACE } from './race/race.js';

const SETTINGS_KEY = 'fpvsim.settings.v1';
const MAPPINGS_KEY = 'fpvsim.mappings.v1';
const RACE_KEY = 'fpvsim.race.v1';
const EXERCISES_KEY = 'fpvsim.exercises.v1';
const EXERCISE_FIELDS = ['hover', 'landing', 'eight'];

export function readJSON(key, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJSON(key, value, storage = globalThis.localStorage) {
  try {
    storage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LEGACY_DEFAULT_DRONE_SIZE = 1.5;

function migrateDroneSize(stored) {
  const legacy = stored.droneSize;
  if (stored.droneScale !== undefined || !Number.isFinite(legacy) || legacy === LEGACY_DEFAULT_DRONE_SIZE) return stored;
  return { ...stored, droneScale: legacy / DRONE_SIZE_BASE };
}

/** Merge stored settings over defaults, keeping only known keys of the right type. */
export function mergeSettings(stored) {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (!isObj(stored)) return out;
  stored = migrateDroneSize(stored);
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = stored[k];
    if (v === undefined) continue;
    if (k === 'rates') {
      if (!isObj(v)) continue;
      for (const axis of ['roll', 'pitch', 'yaw']) {
        for (const f of ['center', 'max', 'expo']) {
          const n = v[axis]?.[f];
          const [lo, hi] = f === 'expo' ? RANGES.rateExpo : RANGES.rate;
          if (Number.isFinite(n)) out.rates[axis][f] = clamp(n, lo, hi);
        }
      }
    } else if (k === 'preset') {
      if (typeof v === 'string' && Object.hasOwn(PRESETS, v)) out.preset = v;
    } else if (typeof v === 'number' && typeof def === 'number') {
      if (Number.isFinite(v)) out[k] = RANGES[k] ? clamp(v, RANGES[k][0], RANGES[k][1]) : v;
    } else if (typeof v === typeof def) {
      out[k] = v;
    }
  }
  return out;
}

export function loadSettings() {
  return mergeSettings(readJSON(SETTINGS_KEY));
}

export function saveSettings(s) {
  return writeJSON(SETTINGS_KEY, s);
}

export function loadRaceBests(storage = globalThis.localStorage) {
  const stored = readJSON(RACE_KEY, storage);
  const bests = Object.create(null);
  if (!isObj(stored)) return bests;
  for (const [preset, best] of Object.entries(stored)) {
    if (!Object.hasOwn(PRESETS, preset) || !isObj(best)) continue;
    if (!Number.isFinite(best.lap) || !Number.isFinite(best.points)) continue;
    const validGhost = Array.isArray(best.ghost)
      && best.ghost.length % 4 === 0
      && best.ghost.length <= RACE.ghostMaxSamples * 4
      && best.ghost.every(Number.isFinite);
    const ghost = validGhost ? best.ghost : [];
    bests[preset] = { lap: best.lap, points: best.points, ghost };
  }
  return bests;
}

export function saveRaceBests(bests, storage = globalThis.localStorage) {
  return writeJSON(RACE_KEY, bests, storage);
}

export function loadExerciseBests(storage = globalThis.localStorage) {
  const stored = readJSON(EXERCISES_KEY, storage);
  const bests = Object.create(null);
  if (!isObj(stored)) return bests;
  for (const [preset, best] of Object.entries(stored)) {
    if (!Object.hasOwn(PRESETS, preset) || !isObj(best)) continue;
    bests[preset] = {};
    for (const field of EXERCISE_FIELDS) {
      if (Number.isFinite(best[field])) bests[preset][field] = best[field];
    }
  }
  return bests;
}

export function saveExerciseBests(bests, storage = globalThis.localStorage) {
  return writeJSON(EXERCISES_KEY, bests, storage);
}

export function loadMappings() {
  const m = readJSON(MAPPINGS_KEY);
  // Null-prototype map: device ids like "__proto__" are just keys.
  const byId = Object.create(null);
  if (isObj(m) && isObj(m.byId)) {
    for (const [k, v] of Object.entries(m.byId)) Object.defineProperty(byId, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return { byId, preferredId: isObj(m) && typeof m.preferredId === 'string' ? m.preferredId : null };
}

export function saveMappings(m) {
  return writeJSON(MAPPINGS_KEY, m);
}
