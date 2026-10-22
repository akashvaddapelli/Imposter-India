import { useCallback, useEffect, useRef, useState } from 'react';
import { createTimer, getRemainingMs, pauseTimer, resetTimer, startTimer, toDisplaySeconds } from '../lib/timer';

const TICK_MS = 250;

/** `onFinish` runs once each time the countdown reaches zero (not on pause or reset). */
export function useCountdown(durationSeconds: number, onFinish?: () => void) {
  const [timer, setTimer] = useState(() => createTimer(durationSeconds * 1000));
  const [now, setNow] = useState(() => Date.now());
  const running = timer.startedAt !== null;
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setTimer(cur => (getRemainingMs(cur, t) <= 0 ? pauseTimer(cur, t) : cur));
    };
    const id = window.setInterval(tick, TICK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    tick();
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running]);

  const remainingMs = getRemainingMs(timer, now);
  const finished = remainingMs <= 0;
  const wasFinished = useRef(false);
  useEffect(() => {
    if (finished && !wasFinished.current) finishRef.current?.();
    wasFinished.current = finished;
  }, [finished]);

  const start = useCallback(() => { const t = Date.now(); setNow(t); setTimer(cur => startTimer(cur, t)); }, []);
  const pause = useCallback(() => setTimer(cur => pauseTimer(cur, Date.now())), []);
  const reset = useCallback(() => setTimer(cur => resetTimer(cur)), []);
  const toggle = useCallback(() => setTimer(cur => (cur.startedAt === null ? startTimer(cur, Date.now()) : pauseTimer(cur, Date.now()))), []);

  return { seconds: toDisplaySeconds(remainingMs), running, finished, start, pause, reset, toggle };
}
