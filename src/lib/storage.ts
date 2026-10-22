/**
 * The browser's localStorage, or a stand-in that fails every call when storage is blocked (some privacy
 * modes throw just from touching `window.localStorage`). Callers already treat a failing storage as
 * "nothing saved, writes refused", so the app keeps working for the session instead of crashing at load.
 */
const unavailable = (): never => { throw new Error('Storage is unavailable in this browser.'); };
const blocked: Pick<Storage, 'getItem' | 'setItem'> = { getItem: unavailable, setItem: unavailable };

export function browserStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage;
  } catch {
    return blocked;
  }
}
