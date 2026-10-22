import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, parseSettings, resolveTheme, saveSettings, SETTINGS_KEY, shouldReduceMotion } from './settings';

describe('parseSettings', () => {
  it('uses defaults for missing, empty or malformed data', () => {
    [null, undefined, '', '{nope', '[]', '"x"', '42', 'null'].forEach(raw => expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS));
  });
  it('defaults follow the system motion setting and do not filter by language', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ motion: 'system', language: 'Any', sound: true, theme: 'Light' });
  });
  it('reads a valid saved object', () => {
    expect(parseSettings(JSON.stringify({ sound: false, motion: 'reduced', theme: 'Dark', language: 'Tamil' }))).toEqual({ sound: false, motion: 'reduced', theme: 'Dark', language: 'Tamil' });
  });
  it('replaces invalid fields one by one and keeps the valid ones', () => {
    expect(parseSettings(JSON.stringify({ sound: 'yes', motion: 'wild', theme: 'Neon', language: 7 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ sound: false, theme: 'Neon' }))).toEqual({ ...DEFAULT_SETTINGS, sound: false });
    expect(parseSettings(JSON.stringify({ language: 'x'.repeat(100) })).language).toBe('Any');
  });
  it('migrates the older boolean motion flag', () => {
    expect(parseSettings('{"motion":true}').motion).toBe('full');
    expect(parseSettings('{"motion":false}').motion).toBe('reduced');
  });
  it('ignores unknown fields', () => {
    expect(parseSettings('{"sound":false,"extra":1}')).toEqual({ ...DEFAULT_SETTINGS, sound: false });
  });
});

describe('storage', () => {
  it('round-trips through storage', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const s = { sound: false, motion: 'full' as const, theme: 'System' as const, language: 'Hindi' };
    expect(saveSettings(s, store)).toBe(true);
    expect(data.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(store)).toEqual(s);
  });
  it('survives storage that throws', () => {
    expect(loadSettings({ getItem: () => { throw new Error('denied'); } })).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS, { setItem: () => { throw new Error('full'); } })).toBe(false);
  });
});

describe('resolving preferences', () => {
  it('motion: system follows the OS, explicit choices win', () => {
    expect(shouldReduceMotion('system', true)).toBe(true);
    expect(shouldReduceMotion('system', false)).toBe(false);
    expect(shouldReduceMotion('full', true)).toBe(false);
    expect(shouldReduceMotion('reduced', false)).toBe(true);
  });
  it('theme: System follows the OS', () => {
    expect(resolveTheme('System', true)).toBe('dark');
    expect(resolveTheme('System', false)).toBe('light');
    expect(resolveTheme('Dark', false)).toBe('dark');
    expect(resolveTheme('Light', true)).toBe('light');
  });
});
