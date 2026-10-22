import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from './settings';
import { browserStorage } from './storage';
import { loadDismissedNotice, loadSavedWords, saveSavedWords } from './words';
import { words } from '../data/words';

const blockStorage = () => vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });

afterEach(() => vi.restoreAllMocks());

describe('blocked browser storage', () => {
  it('browserStorage returns working storage normally', () => {
    browserStorage().setItem('ii-test', '1');
    expect(browserStorage().getItem('ii-test')).toBe('1');
    window.localStorage.removeItem('ii-test');
  });
  it('browserStorage never throws when touching localStorage is itself an error', () => {
    blockStorage();
    expect(() => browserStorage()).not.toThrow();
    expect(() => browserStorage().getItem('x')).toThrow();
  });
  it('loading and saving settings fall back to defaults instead of crashing', () => {
    blockStorage();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(DEFAULT_SETTINGS)).toBe(false);
  });
  it('saved words load as empty, writes are refused, and nothing throws', () => {
    blockStorage();
    const s = loadSavedWords(words);
    expect(s.extras).toEqual([]);
    expect(s.readFailed).toBe(true);
    expect(saveSavedWords(s)).toBe(false);
    expect(loadDismissedNotice()).toBeNull();
  });
});
