// localStorage helpers. Storage can be unavailable (private windows, blocked
// site data); every access is wrapped so the sim still runs without it.
import { DEFAULT_SETTINGS, PRESETS } from './config.js';

const SETTINGS_KEY = 'fpvsim.settings.v1';
const MAPPINGS_KEY = 'fpvsim.mappings.v1';

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

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Merge stored settings over defaults, keeping only known keys of the right type. */
export function mergeSettings(stored) {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (!isObj(stored)) return out;
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    const v = stored[k];
    if (v === undefined) continue;
    if (k === 'rates') {
      if (!isObj(v)) continue;
      for (const axis of ['roll', 'pitch', 'yaw']) {
        for (const f of ['center', 'max', 'expo']) {
          const n = v[axis]?.[f];
          if (Number.isFinite(n)) out.rates[axis][f] = n;
        }
      }
    } else if (k === 'preset') {
      if (typeof v === 'string' && PRESETS[v]) out.preset = v;
    } else if (typeof v === typeof def && (typeof v !== 'number' || Number.isFinite(v))) {
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

export function loadMappings() {
  const m = readJSON(MAPPINGS_KEY);
  return isObj(m) && isObj(m.byId) ? m : { byId: {}, preferredId: null };
}

export function saveMappings(m) {
  return writeJSON(MAPPINGS_KEY, m);
}
