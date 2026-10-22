import { browserStorage } from './storage';
import { ANY_LANGUAGE } from './words';

export type MotionPref = 'system' | 'full' | 'reduced';
export type ThemePref = 'Light' | 'Dark' | 'System';
export type Settings = { sound: boolean; motion: MotionPref; theme: ThemePref; language: string };

export const SETTINGS_KEY = 'ii-settings';
export const DEFAULT_SETTINGS: Settings = { sound: true, motion: 'system', theme: 'Light', language: ANY_LANGUAGE };

const MOTION: MotionPref[] = ['system', 'full', 'reduced'];
const THEMES: ThemePref[] = ['Light', 'Dark', 'System'];

/** Reads saved settings defensively: anything missing, malformed or from an older shape falls back to a default. */
export function parseSettings(raw: string | null | undefined): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ...DEFAULT_SETTINGS }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...DEFAULT_SETTINGS };
  const d = data as Record<string, unknown>;
  // Older builds kept `motion` as a boolean (true = animations on).
  const motion: MotionPref = typeof d.motion === 'boolean' ? (d.motion ? 'full' : 'reduced') : MOTION.find(m => m === d.motion) ?? DEFAULT_SETTINGS.motion;
  return {
    sound: typeof d.sound === 'boolean' ? d.sound : DEFAULT_SETTINGS.sound,
    motion,
    theme: THEMES.find(t => t === d.theme) ?? DEFAULT_SETTINGS.theme,
    language: typeof d.language === 'string' && d.language.trim() && d.language.length <= 40 ? d.language.trim() : DEFAULT_SETTINGS.language,
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> = browserStorage()): Settings {
  try { return parseSettings(storage.getItem(SETTINGS_KEY)); } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s: Settings, storage: Pick<Storage, 'setItem'> = browserStorage()): boolean {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

/** True when animations should be minimised. "system" follows the operating-system setting. */
export const shouldReduceMotion = (pref: MotionPref, systemPrefersReduced: boolean): boolean => (pref === 'system' ? systemPrefersReduced : pref === 'reduced');

export const resolveTheme = (pref: ThemePref, systemPrefersDark: boolean): 'light' | 'dark' => (pref === 'System' ? (systemPrefersDark ? 'dark' : 'light') : pref === 'Dark' ? 'dark' : 'light');
