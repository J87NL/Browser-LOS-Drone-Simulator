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
