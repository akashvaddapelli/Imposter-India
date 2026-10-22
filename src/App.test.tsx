import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { EXTRA_WORDS_KEY, NOTICE_DISMISSED_KEY, QUARANTINE_KEY } from './lib/words';

const click = (name: RegExp | string) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const goToSetup = () => { click(/Play offline/); click(/One Mobile/); };
const legacy = (over: Record<string, unknown> = {}) => ({ id: 'custom-1700000000000', name: 'Old Custom', category: 'objects', aliases: [], languages: ['English'], regions: ['User added'], difficulty: 'Medium', recognition: 'Regional', ...over });

beforeEach(() => {
  localStorage.clear();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(() => cleanup());

describe('App: components keep their identity (no remounting while typing)', () => {
  it('the category search input is the same element, and keeps focus, after typing', () => {
    render(<App />);
    goToSetup();
    const input = screen.getByLabelText('Search categories');
    input.focus();
    fireEvent.change(input, { target: { value: 'fo' } });
    const after = screen.getByLabelText('Search categories');
    expect(after).toBe(input);
    expect(input.isConnected).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(screen.getAllByText(/words$/).length).toBeGreaterThan(0);
  });
  it('a button keeps keyboard focus after it changes state', () => {
    render(<App />);
    goToSetup();
    const plus = screen.getByLabelText('More players');
    plus.focus();
    fireEvent.click(plus);
    expect(document.activeElement).toBe(screen.getByLabelText('More players'));
    expect(screen.getByLabelText('More players')).toBe(plus);
  });
});

describe('App: language filter on the setup screen', () => {
  it('starts on Any language and shows how the pool changes with a language', () => {
    render(<App />);
    goToSetup();
    const select = screen.getByLabelText('Word language') as HTMLSelectElement;
    expect(select.value).toBe('Any');
    const pool = () => Number(/Word pool\s*(\d+) words/.exec(document.querySelector('.setup-summary')!.textContent ?? '')?.[1]);
    const any = pool();
    fireEvent.change(select, { target: { value: 'Telugu' } });
    expect(pool()).toBeGreaterThan(0);
    expect(pool()).toBeLessThan(any);
  });
  it('explains an empty pool and disables the start button', () => {
    render(<App />);
    goToSetup();
    fireEvent.change(screen.getByLabelText('Word language'), { target: { value: 'Assamese' } });
    fireEvent.change(screen.getByLabelText('Word difficulty'), { target: { value: 'Hard' } });
    // default categories contain Assamese words only at lower difficulty, so Hard + Assamese is empty
    // the phone-only deal bar duplicates the summary panel's warning and button (CSS hides one of them)
    const alerts = screen.queryAllByRole('alert');
    const deals = screen.getAllByRole('button', { name: /Deal the cards/ }) as HTMLButtonElement[];
    if (alerts.length) {
      alerts.forEach(a => expect(a.textContent).toMatch(/Assamese/));
      deals.forEach(d => expect(d.disabled).toBe(true));
    } else {
      deals.forEach(d => expect(d.disabled).toBe(false));
    }
  });
  it('remembers the chosen language between screens and reloads', () => {
    const { unmount } = render(<App />);
    goToSetup();
    fireEvent.change(screen.getByLabelText('Word language'), { target: { value: 'Tamil' } });
    click(/Back to modes/);
    click(/One Mobile/);
    expect((screen.getByLabelText('Word language') as HTMLSelectElement).value).toBe('Tamil');
    unmount();
    render(<App />);
    goToSetup();
    expect((screen.getByLabelText('Word language') as HTMLSelectElement).value).toBe('Tamil');
  });
});

describe('App: leaving a game', () => {
  it('asks before abandoning a running game, and Keep playing returns to it', () => {
    render(<App />);
    goToSetup();
    click(/Deal the cards/);
    expect(screen.getByText(/PRIVATE CARD/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /imposterindia/i })[0]);
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/Leave this game\?/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Keep playing/ }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(/PRIVATE CARD/)).toBeTruthy();
  });
  it('Leave game discards the round and goes where the player asked', () => {
    render(<App />);
    goToSetup();
    click(/Deal the cards/);
    fireEvent.click(screen.getAllByRole('button', { name: /imposterindia/i })[0]);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Leave game/ }));
    expect(screen.queryByText(/PRIVATE CARD/)).toBeNull();
    expect(screen.getByText(/Play offline/)).toBeTruthy();
  });
  it('Settings and Back return to the game without ending it', () => {
    render(<App />);
    goToSetup();
    click(/Deal the cards/);
    click('Settings');
    expect(screen.getByText(/Your game settings/)).toBeTruthy();
    click(/Done/);
    expect(screen.getByText(/PRIVATE CARD/)).toBeTruthy();
  });
  it('hides a revealed secret card when leaving the screen', () => {
    render(<App />);
    goToSetup();
    click(/Deal the cards/);
    click(/Tap to reveal/);
    expect(screen.getByRole('region', { name: /secret card/i })).toBeTruthy();
    click('Settings');
    click(/Done/);
    expect(screen.queryByRole('region', { name: /secret card/i })).toBeNull();
    expect(screen.getByText(/Tap to reveal/)).toBeTruthy();
  });
});

describe('App: saved-word notices and recovery', () => {
  const seed = () => localStorage.setItem(EXTRA_WORDS_KEY, JSON.stringify([legacy({ id: 'custom-1', name: 'Family Pickle', category: 'food' }), legacy({ id: 'custom-2', name: 'delhi', category: 'places', languages: ['Telugu'] }), { foo: 'bar' }]));
  const openLibrary = () => click(/Word library/);

  it('shows the recovery notice, and keeps it dismissed after a reload without any save', () => {
    seed();
    const first = render(<App />);
    openLibrary();
    expect(screen.getByText(/already in the built-in library/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(localStorage.getItem(NOTICE_DISMISSED_KEY)).toBeTruthy();
    first.unmount();
    render(<App />);
    openLibrary();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
  it('dismissing never deletes recovery data, and the download stays available', () => {
    seed();
    const before = localStorage.getItem(EXTRA_WORDS_KEY);
    render(<App />);
    openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(localStorage.getItem(EXTRA_WORDS_KEY)).toBe(before);
    expect(screen.getByRole('button', { name: /Download unrecovered data/ })).toBeTruthy();
  });
  it('the recovery record survives later saves (adding a word) and reloads', () => {
    seed();
    const first = render(<App />);
    openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Add word' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText(/Pesarattu/), { target: { value: 'Brand New Dish' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^(Add word|Save|Add)/ }));
    expect(JSON.parse(localStorage.getItem(QUARANTINE_KEY)!)).toEqual([{ foo: 'bar' }]);
    first.unmount();
    render(<App />);
    openLibrary();
    expect(screen.getByRole('button', { name: /Download unrecovered data/ })).toBeTruthy();
    // the library is paginated and sorted A-Z, so find the new word by searching
    fireEvent.change(screen.getByPlaceholderText(/Search words, aliases/), { target: { value: 'Brand New Dish' } });
    expect(screen.getAllByText('Brand New Dish').length).toBeGreaterThan(0);
  });
  it('asks about automatic English tags and applies the player’s choice', () => {
    seed();
    render(<App />);
    openLibrary();
    expect(screen.getByText(/tagged English automatically/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag' }));
    expect(screen.queryByText(/tagged English automatically/)).toBeNull();
    const saved = JSON.parse(localStorage.getItem(EXTRA_WORDS_KEY)!);
    expect(saved.find((w: { id: string }) => w.id === 'custom-1').languages).toEqual([]);
  });
  it('Keep English changes no word', () => {
    seed();
    render(<App />);
    openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'Keep English' }));
    const saved = JSON.parse(localStorage.getItem(EXTRA_WORDS_KEY)!);
    expect(saved.find((w: { id: string }) => w.id === 'custom-1').languages).toEqual(['English']);
    expect(screen.queryByText(/tagged English automatically/)).toBeNull();
  });
});

describe('App: settings', () => {
  it('applies and remembers the motion and theme choices', () => {
    const { unmount } = render(<App />);
    click('Settings');
    fireEvent.change(screen.getByLabelText('Motion and animations'), { target: { value: 'reduced' } });
    fireEvent.change(screen.getByLabelText('Appearance'), { target: { value: 'Dark' } });
    expect(document.documentElement.dataset.motion).toBe('reduced');
    expect(document.documentElement.dataset.theme).toBe('dark');
    unmount();
    render(<App />);
    click('Settings');
    expect((screen.getByLabelText('Motion and animations') as HTMLSelectElement).value).toBe('reduced');
    expect((screen.getByLabelText('Appearance') as HTMLSelectElement).value).toBe('Dark');
  });
  it('the sound control is a labelled switch that is disabled when audio is unsupported', () => {
    render(<App />);
    click('Settings');
    const sw = screen.getByRole('switch', { name: 'Sound effects' }) as HTMLButtonElement;
    expect(sw.disabled).toBe(true);
    expect(screen.getByText(/Not supported by this browser/)).toBeTruthy();
    act(() => undefined);
  });
});

describe('App: storage unavailable', () => {
  it('still loads and plays when the browser blocks localStorage entirely', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    render(<App />);
    goToSetup();
    expect((screen.getByLabelText('Word language') as HTMLSelectElement).value).toBe('Any');
    click(/Deal the cards/);
    expect(screen.getByText(/PRIVATE CARD/)).toBeTruthy();
    vi.restoreAllMocks();
  });
});

const dealAndRevealAll = (players: number) => {
  click(/Deal the cards/);
  for (let i = 0; i < players; i++) { click(/Tap to reveal/); click(/Hide card/); }
};
const voteAll = (target: (voter: number) => string, players: number) => {
  click(/Everyone's had a turn/);
  for (let v = 0; v < players; v++) {
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^.?${target(v)}`) })[0]);
    click(v === players - 1 ? /Reveal votes/ : /Lock vote/);
  }
};

describe('App: screen changes keep keyboard focus', () => {
  it('moves focus to the main region when the screen changes under a focused button', () => {
    render(<App />);
    const play = screen.getAllByRole('button', { name: /Play offline/ })[0];
    play.focus();
    fireEvent.click(play);
    expect(document.activeElement).toBe(document.getElementById('main'));
  });
});

describe('App: full offline flow', () => {
  it('plays the minimum 3-player game through to results and starts a new round', () => {
    render(<App />);
    goToSetup();
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByLabelText('Fewer players'));
    dealAndRevealAll(3);
    expect(screen.getByRole('heading', { name: /Drop your clue/ })).toBeTruthy();
    // everyone votes for Player 2 (Player 2 votes for You): a clear result either way
    voteAll(v => (v === 1 ? 'You' : 'Player 2'), 3);
    expect(screen.getByText(/THE SECRET WORD WAS/i)).toBeTruthy();
    click(/Play again/);
    expect(screen.getByLabelText('Fewer players')).toBeTruthy();
  });
  it('explains a multi-imposter round where the votes could not single out every imposter', () => {
    render(<App />);
    goToSetup();
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByLabelText('More players'));
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByLabelText('More imposters'));
    expect(screen.getByLabelText('More imposters')).toHaveProperty('disabled', true);
    dealAndRevealAll(7);
    // everyone piles on Player 2, who votes for You: only two players get votes, but three imposters exist
    voteAll(v => (v === 1 ? 'You' : 'Player 2'), 7);
    expect(screen.getByRole('heading', { name: 'No clear verdict.' })).toBeTruthy();
    expect(screen.getByText(/didn't clearly single out all 3 imposters/)).toBeTruthy();
  });
});
