import { describe, expect, it } from 'vitest';
import { createTimer, getRemainingMs, isFinished, pauseTimer, resetTimer, startTimer, toDisplaySeconds } from './timer';

describe('timer model', () => {
  it('does not change while idle', () => {
    expect(getRemainingMs(createTimer(45000), 999999)).toBe(45000);
  });
  it('counts down from timestamps, not tick counts', () => {
    const t = startTimer(createTimer(45000), 1000);
    expect(getRemainingMs(t, 1000)).toBe(45000);
    expect(getRemainingMs(t, 11500)).toBe(34500);
    expect(getRemainingMs(t, 21000)).toBe(25000);
  });
  it('never goes below zero and reports finished', () => {
    const t = startTimer(createTimer(3000), 0);
    expect(getRemainingMs(t, 3000)).toBe(0);
    expect(getRemainingMs(t, 10 ** 9)).toBe(0);
    expect(isFinished(t, 10 ** 9)).toBe(true);
    expect(pauseTimer(t, 10 ** 9).remainingMs).toBe(0);
  });
  it('pause freezes and resume continues from the paused value', () => {
    let t = startTimer(createTimer(45000), 0);
    t = pauseTimer(t, 10000);
    expect(getRemainingMs(t, 500000)).toBe(35000);
    t = startTimer(t, 600000);
    expect(getRemainingMs(t, 605000)).toBe(30000);
  });
  it('start and pause are idempotent', () => {
    const t = startTimer(createTimer(45000), 0);
    expect(startTimer(t, 5000)).toBe(t);
    const p = pauseTimer(t, 5000);
    expect(pauseTimer(p, 9000)).toBe(p);
  });
  it('cannot restart a finished timer, but reset restores it', () => {
    const done = pauseTimer(startTimer(createTimer(1000), 0), 5000);
    expect(startTimer(done, 6000)).toBe(done);
    expect(getRemainingMs(startTimer(resetTimer(done), 6000), 6000)).toBe(1000);
  });
  it('rounds the display up so 0 only shows when time is up', () => {
    expect([45000, 44001, 1, 0, -50].map(toDisplaySeconds)).toEqual([45, 45, 1, 0, 0]);
  });
  it('clamps invalid durations', () => {
    expect(createTimer(-5).remainingMs).toBe(0);
  });
});
