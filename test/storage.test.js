import { describe, it, expect } from 'vitest';
import { loadRaceBests, mergeSettings, readJSON, writeJSON } from '../src/storage.js';
import { DEFAULT_SETTINGS } from '../src/config.js';

describe('settings storage', () => {
  it('falls back to defaults on junk', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and drops wrong types or unknown keys', () => {
    const s = mergeSettings({ fpvFov: 120, losAutoZoom: 'yes', preset: 'nope', evil: 1, rates: { roll: { max: 800, expo: 'x' } } });
    expect(s.fpvFov).toBe(120);
    expect(s.losAutoZoom).toBe(true);
    expect(s.preset).toBe(DEFAULT_SETTINGS.preset);
    expect(s.evil).toBeUndefined();
    expect(s.rates.roll.max).toBe(800);
    expect(s.rates.roll.expo).toBe(DEFAULT_SETTINGS.rates.roll.expo);
  });

  it('rejects prototype keys as preset and clamps out-of-range numbers', () => {
    const s = mergeSettings({ preset: 'constructor', fpvFov: 0, angleMaxTilt: 500, volume: 50, rates: { yaw: { center: -5, expo: 3 } } });
    expect(s.preset).toBe(DEFAULT_SETTINGS.preset);
    expect(s.fpvFov).toBe(60);
    expect(s.angleMaxTilt).toBe(80);
    expect(s.volume).toBe(1);
    expect(mergeSettings({ droneScale: 50 }).droneScale).toBe(8);
    expect(mergeSettings({ droneScale: 0.1 }).droneScale).toBe(0.3);
    expect(mergeSettings({ droneScale: 'big' }).droneScale).toBe(DEFAULT_SETTINGS.droneScale);
    expect(mergeSettings({ stickArm: 'no', fpvPropsInView: 1 })).toMatchObject({
      stickArm: DEFAULT_SETTINGS.stickArm, fpvPropsInView: DEFAULT_SETTINGS.fpvPropsInView,
    });
    expect(s.rates.yaw.center).toBe(0);
    expect(s.rates.yaw.expo).toBe(1);
  });

  it('converts the old drone size to the new scale', () => {
    expect(mergeSettings({ droneSize: 3 }).droneScale).toBeCloseTo(1.2);
    expect(mergeSettings({ droneSize: 1 }).droneScale).toBeCloseTo(0.4);
    expect(mergeSettings({ droneSize: 1.5 }).droneScale).toBe(DEFAULT_SETTINGS.droneScale);
    expect(mergeSettings({ droneSize: 3, droneScale: 2 }).droneScale).toBe(2);
    expect(mergeSettings({ droneSize: 3 }).droneSize).toBeUndefined();
  });

  it('survives a throwing storage', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(readJSON('k', bad)).toBeNull();
    expect(writeJSON('k', 1, bad)).toBe(false);
  });

  it('round-trips through a storage', () => {
    const mem = new Map();
    const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    writeJSON('k', { a: 1 }, st);
    expect(readJSON('k', st)).toEqual({ a: 1 });
  });

  it('loads race bests per known preset and drops broken entries', () => {
    const raw = JSON.stringify({
      freestyle5: { lap: 31.2, points: 900, ghost: [1, 2, 3, 0] },
      whoop: { lap: 'fast', points: 1 },
      camera: { lap: 50, points: 400, ghost: [1, 'x'] },
      __proto__: { lap: 1, points: 1 },
      nope: { lap: 1, points: 1 },
    });
    const bests = loadRaceBests({ getItem: () => raw });
    expect(Object.keys(bests).sort()).toEqual(['camera', 'freestyle5']);
    expect(bests.freestyle5.ghost).toEqual([1, 2, 3, 0]);
    expect(bests.camera.ghost).toEqual([]);
  });
});
