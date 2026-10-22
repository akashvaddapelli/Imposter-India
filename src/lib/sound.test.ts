import { describe, expect, it, vi } from 'vitest';
import { CUES, createSoundPlayer, type Cue } from './sound';

function fakeContext(state: AudioContextState = 'running') {
  const freqs: number[] = [];
  const raw = {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn((): Promise<void> => Promise.resolve()),
    createOscillator: vi.fn(() => {
      const osc = {
        type: '',
        frequency: { set value(v: number) { freqs.push(v); } },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      return osc;
    }),
    createGain: vi.fn(() => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() })),
  };
  return { ctx: raw as unknown as AudioContext, freqs, raw };
}

describe('sound player', () => {
  it('plays nothing and never touches audio when sound is off', () => {
    const make = vi.fn(() => fakeContext().ctx);
    const p = createSoundPlayer(make);
    expect(p.play('reveal', false)).toBe(false);
    expect(make).not.toHaveBeenCalled();
  });
  it('plays one oscillator per note when enabled', () => {
    (Object.keys(CUES) as Cue[]).forEach(cue => {
      const f = fakeContext();
      expect(createSoundPlayer(() => f.ctx).play(cue, true)).toBe(true);
      expect(f.freqs).toEqual(CUES[cue].map(n => n.freq));
    });
  });
  it('stays silent and does not throw when audio is unsupported', () => {
    const p = createSoundPlayer(() => null);
    expect(p.play('vote', true)).toBe(false);
    expect(() => p.unlock()).not.toThrow();
  });
  it('stays silent when creating the context throws (blocked or unavailable)', () => {
    const p = createSoundPlayer(() => { throw new Error('blocked'); });
    expect(p.play('vote', true)).toBe(false);
  });
  it('does not throw when resume is rejected or oscillators fail', () => {
    const f = fakeContext('suspended');
    f.raw.resume.mockReturnValue(Promise.reject(new Error('no gesture')));
    expect(() => createSoundPlayer(() => f.ctx).play('result', true)).not.toThrow();
    const bad = fakeContext();
    bad.raw.createOscillator.mockImplementation(() => { throw new Error('boom'); });
    expect(createSoundPlayer(() => bad.ctx).play('result', true)).toBe(false);
  });
  it('unlock resumes a suspended context from a user gesture', () => {
    const f = fakeContext('suspended');
    createSoundPlayer(() => f.ctx).unlock();
    expect(f.raw.resume).toHaveBeenCalledTimes(1);
  });
  it('reuses one context', () => {
    const make = vi.fn(() => fakeContext().ctx);
    const p = createSoundPlayer(make);
    p.play('reveal', true);
    p.play('vote', true);
    p.unlock();
    expect(make).toHaveBeenCalledTimes(1);
  });
});
