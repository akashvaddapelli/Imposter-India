# Browser layout checks (manual, repeatable)

Unit tests cannot measure CSS layout: jsdom does not calculate box sizes, overflow or wrapping. The
regression tests in `src/styles.guard.test.ts` only check that the stylesheet *declares* the minimums.
Layout itself is checked in a real browser with the procedure below.

## Procedure

1. `npm run dev` and open the app.
2. Set the viewport to each width: **320, 360, 390, 768, 1280** px.
3. Play a 12-player game with long names (for example `Anantharamakrishnan` and a 20-letter name):
   Setup → Deal → reveal every card → Discussion → Voting (all 12 votes) → Results.
4. On each screen, run the snippet below in the browser console. It must print `overflowX: false`,
   no `offscreen` entries, and an empty `small` list (apart from the header links, see the note).

```js
(() => {
  const W = document.documentElement.clientWidth;
  const shown = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const overflowX = document.documentElement.scrollWidth > W;
  const offscreen = [...document.querySelectorAll('body *')]
    .filter(e => shown(e) && !e.closest('.skip-link, .library-categories, .library-sidebar') && getComputedStyle(e).position !== 'fixed')
    .filter(e => e.getBoundingClientRect().right > W + 1 || e.getBoundingClientRect().left < -1)
    .slice(0, 5).map(e => (e.className.toString().split(' ')[0] || e.tagName));
  const small = [...new Set([...document.querySelectorAll('button, a[href], select, [role=switch]')]
    .filter(e => shown(e) && !e.closest('.skip-link'))
    .filter(e => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; })
    .map(e => (e.getAttribute('aria-label') || e.textContent.trim() || e.tagName).slice(0, 24)))];
  return { width: W, screen: document.querySelector('h1')?.textContent, overflowX, offscreen, small };
})()
```

## Notes

- The decisive check is `overflowX`. Decorative art on the home screen (`art-sun`, `hero-art`) can appear in
  `offscreen` while it sits inside a clipped container; that is expected as long as `overflowX` is `false`.
- Text fields (player names, search, add-word, import) are excluded from the snippet on purpose: the
  visible 44px control wraps the native field, and the native field fills it.
- The snippet proves layout at the tested width only. It does not check screen readers, real touch
  behaviour, or device-specific browsers.

## Limits of this check

- It runs in the browser's emulated viewport (for example the in-app browser's device emulation). It is
  **not** a physical phone test. Real-device testing (Android Chrome, iOS Safari) is still required before a
  release.
- Results depend on the fonts that load. Google Fonts are used when online; system fonts are used offline and
  can change line wrapping.
