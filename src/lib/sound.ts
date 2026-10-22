/** Tiny Web Audio cues for meaningful game events. Everything is a no-op when audio is unsupported or blocked. */
export type Cue = 'reveal' | 'vote' | 'timerEnd' | 'result';

type Note = { freq: number; at: number; dur: number };
export const CUES: Record<Cue, Note[]> = {
  reveal: [{ freq: 660, at: 0, dur: 0.09 }],
  vote: [{ freq: 440, at: 0, dur: 0.08 }, { freq: 554, at: 0.09, dur: 0.1 }],
  timerEnd: [{ freq: 880, at: 0, dur: 0.14 }, { freq: 880, at: 0.22, dur: 0.14 }, { freq: 880, at: 0.44, dur: 0.22 }],
  result: [{ freq: 523, at: 0, dur: 0.12 }, { freq: 659, at: 0.13, dur: 0.12 }, { freq: 784, at: 0.26, dur: 0.22 }],
};

type AudioCtor = new () => AudioContext;
const audioCtor = (): AudioCtor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext;
};

export const isSoundSupported = (): boolean => !!audioCtor();

export type SoundPlayer = { unlock: () => void; play: (cue: Cue, enabled: boolean) => boolean };

/** `makeContext` is injectable so behaviour can be tested without a real browser. */
export function createSoundPlayer(makeContext: () => AudioContext | null = () => { const C = audioCtor(); return C ? new C() : null; }): SoundPlayer {
  let ctx: AudioContext | null | undefined;
  const get = () => {
    if (ctx === undefined) { try { ctx = makeContext(); } catch { ctx = null; } }
    return ctx;
  };
  const resume = (c: AudioContext) => {
    try { if (c.state === 'suspended') void Promise.resolve(c.resume()).catch(() => undefined); } catch { /* blocked */ }
  };
  return {
    /** Call from a user gesture (tap) so browsers allow audio later, e.g. when the timer ends. */
    unlock() { const c = get(); if (c) resume(c); },
    play(cue, enabled) {
      if (!enabled) return false;
      const c = get();
      if (!c) return false;
      try {
        resume(c);
        const t0 = c.currentTime;
        for (const n of CUES[cue]) {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = 'sine';
          osc.frequency.value = n.freq;
          gain.gain.setValueAtTime(0.0001, t0 + n.at);
          gain.gain.exponentialRampToValueAtTime(0.12, t0 + n.at + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
          osc.connect(gain);
          gain.connect(c.destination);
          osc.start(t0 + n.at);
          osc.stop(t0 + n.at + n.dur + 0.02);
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}

export const sound = createSoundPlayer();
