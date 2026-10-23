import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css: string = readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); // tests run from the project root; comments removed

/*
 * CSS SOURCE GUARDS — these read the stylesheet text. They prove that the declared minimums and
 * wrapping rules are present, so a later edit cannot silently remove them. They do NOT measure layout:
 * jsdom does not calculate CSS box sizes or overflow. Real 320–1280px layout and 44px target sizes are
 * checked in the browser (see docs/browser-qa.md).
 */

/** Innermost rules as [selector list, declarations]. @media wrappers are skipped; their rules are kept. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => [m[1].trim(), m[2]] as const);

/** The last value of `prop` for a selector, in source order (later rules win at equal specificity). Lists count. */
function lastValue(selector: string, prop: string): string | undefined {
  let value: string | undefined;
  for (const [sel, body] of rules) {
    if (!sel.split(',').map(x => x.trim()).includes(selector)) continue;
    for (const decl of body.split(';')) {
      const [name, ...rest] = decl.split(':');
      if (name.trim() === prop) value = rest.join(':').trim();
    }
  }
  return value;
}

/** Whether some rule lists `selector` in its selector list and declares `prop: value`. */
const declares = (selector: string, prop: string, value: string) =>
  rules.some(([sel, body]) => sel.split(',').map(s => s.trim()).includes(selector) && body.replace(/\s/g, '').includes(`${prop}:${value}`));

const atLeast = (v: string | undefined, min: number) => parseFloat(v ?? '0') >= min;

describe('CSS guard: primary touch targets are declared at 44px or more', () => {
  it('player-count steppers are 44×44', () => {
    expect(atLeast(lastValue('.stepper button', 'width'), 44)).toBe(true);
    expect(atLeast(lastValue('.stepper button', 'height'), 44)).toBe(true);
  });
  it('header help and settings buttons are 44×44', () => {
    expect(atLeast(lastValue('.icon-btn', 'width'), 44)).toBe(true);
    expect(atLeast(lastValue('.icon-btn', 'height'), 44)).toBe(true);
  });
  it('footer controls are at least 44px tall', () => {
    expect(atLeast(lastValue('.footer-inner>div button', 'min-height'), 44)).toBe(true);
    expect(atLeast(lastValue('.footer button', 'min-height'), 44)).toBe(true);
  });
  it('header brand button, primary buttons and text links are at least 44px tall', () => {
    expect(atLeast(lastValue('.topbar .brand', 'min-height'), 44)).toBe(true);
    expect(atLeast(lastValue('.btn', 'min-height'), 44)).toBe(true);
    expect(atLeast(lastValue('.text-link', 'min-height'), 44)).toBe(true);
  });
  it('category-removal chips and "Clear all" are at least 44px tall', () => {
    expect(atLeast(lastValue('.chip', 'min-height'), 44)).toBe(true);
    expect(atLeast(lastValue('.clear-link', 'min-height'), 44)).toBe(true);
  });
  it('the category search and player-name fields are 44px controls', () => {
    expect(atLeast(lastValue('.search-field', 'height'), 44)).toBe(true);
    expect(atLeast(lastValue('.player-input', 'height'), 44)).toBe(true);
  });
});

describe('CSS guard: long names wrap instead of widening the page (320px, 12 players)', () => {
  it('the phone voting grid uses shrinkable columns', () => {
    expect(lastValue('.vote-grid', 'grid-template-columns')).toContain('minmax(0,1fr)');
  });
  it('voting, speaking-order and heading text can break long words', () => {
    expect(declares('.vote-card b', 'overflow-wrap', 'anywhere')).toBe(true);
    expect(declares('.turn-item b', 'overflow-wrap', 'anywhere')).toBe(true);
    expect(declares('main h1', 'overflow-wrap', 'anywhere')).toBe(true);
  });
  it('speaking-order rows and vote cards can shrink below their content width', () => {
    expect(declares('.vote-card', 'min-width', '0')).toBe(true);
  });
  it('body enforces min-width 320px and secret word titles wrap safely', () => {
    expect(declares('body', 'min-width', '320px')).toBe(true);
    expect(declares('.secret-word-title', 'overflow-wrap', 'anywhere')).toBe(true);
  });
});
