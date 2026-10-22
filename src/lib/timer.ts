/** Pure, clock-injected countdown model: remaining time is derived from timestamps, never from tick counts. */
export type TimerState = { durationMs: number; remainingMs: number; startedAt: number | null };

export const createTimer = (durationMs: number): TimerState => {
  const d = Math.max(0, Math.floor(durationMs));
  return { durationMs: d, remainingMs: d, startedAt: null };
};

export const getRemainingMs = (t: TimerState, now: number): number =>
  t.startedAt === null ? t.remainingMs : Math.min(t.remainingMs, Math.max(0, t.remainingMs - (now - t.startedAt)));

export const isFinished = (t: TimerState, now: number): boolean => getRemainingMs(t, now) <= 0;

/** Whole seconds shown on screen (rounded up so 00:00 only appears when time is really up). */
export const toDisplaySeconds = (ms: number): number => Math.max(0, Math.ceil(ms / 1000));

export function startTimer(t: TimerState, now: number): TimerState {
  if (t.startedAt !== null || t.remainingMs <= 0) return t;
  return { ...t, startedAt: now };
}

/** Pausing (or finishing) freezes the remaining time; it never goes below zero. */
export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.startedAt === null) return t;
  return { ...t, remainingMs: getRemainingMs(t, now), startedAt: null };
}

export const resetTimer = (t: TimerState): TimerState => createTimer(t.durationMs);
