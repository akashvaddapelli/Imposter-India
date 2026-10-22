import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './useCountdown';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

describe('useCountdown', () => {
  it('counts down accurately and stops at zero without leaking intervals', () => {
    const { result } = renderHook(() => useCountdown(5));
    expect(result.current.seconds).toBe(5);
    act(() => result.current.start());
    expect(vi.getTimerCount()).toBe(1);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.seconds).toBe(3);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(result.current.seconds).toBe(0);
    expect(result.current.finished).toBe(true);
    expect(result.current.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('is accurate when ticks arrive late (throttled tab)', () => {
    const { result } = renderHook(() => useCountdown(45));
    act(() => result.current.start());
    act(() => { vi.setSystemTime(30000); document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.seconds).toBe(15);
  });
  it('supports pause, resume and reset', () => {
    const { result } = renderHook(() => useCountdown(45));
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(10000); });
    act(() => result.current.pause());
    expect(vi.getTimerCount()).toBe(0);
    const frozen = result.current.seconds;
    act(() => { vi.advanceTimersByTime(20000); });
    expect(result.current.seconds).toBe(frozen);
    act(() => result.current.toggle());
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.seconds).toBe(frozen - 5);
    act(() => result.current.reset());
    expect(result.current.seconds).toBe(45);
  });
  it('never creates duplicate intervals on repeated start', () => {
    const { result } = renderHook(() => useCountdown(45));
    act(() => { result.current.start(); result.current.start(); result.current.start(); });
    expect(vi.getTimerCount()).toBe(1);
  });
  it('clears its interval on unmount', () => {
    const { result, unmount } = renderHook(() => useCountdown(45));
    act(() => result.current.start());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useCountdown onFinish', () => {
  it('fires once when the countdown reaches zero', () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() => useCountdown(3, onFinish));
    expect(onFinish).not.toHaveBeenCalled();
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.finished).toBe(true);
    expect(onFinish).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10000); });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
  it('does not fire on pause or reset, and fires again after a reset run', () => {
    const onFinish = vi.fn();
    const { result } = renderHook(() => useCountdown(3, onFinish));
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => result.current.pause());
    act(() => result.current.reset());
    expect(onFinish).not.toHaveBeenCalled();
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onFinish).toHaveBeenCalledTimes(1);
    act(() => result.current.reset());
    act(() => result.current.start());
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onFinish).toHaveBeenCalledTimes(2);
  });
});
