import { describe, it, expect } from 'vitest';
import { mergeSettings, readJSON, writeJSON } from '../src/storage.js';
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
    expect(s.rates.yaw.center).toBe(0);
    expect(s.rates.yaw.expo).toBe(1);
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
});
