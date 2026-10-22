import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const describe = (el: HTMLElement) => ({ tag: el.tagName, text: (el.textContent ?? '').trim(), aria: el.getAttribute('aria-label') });

/** Focus the opener; if the page re-created it while the dialog was open, find its equivalent. */
function restoreFocus(opener: HTMLElement | null, label: ReturnType<typeof describe> | null) {
  if (opener && opener.isConnected) { opener.focus(); return; }
  if (!label) return;
  const match = [...document.querySelectorAll<HTMLElement>(label.tag)].find(e => !e.closest('[role="dialog"],[role="alertdialog"]') && (e.textContent ?? '').trim() === label.text && e.getAttribute('aria-label') === label.aria);
  match?.focus();
}

/**
 * Basic modal behaviour: focus moves into the dialog, Tab stays inside it, Escape closes it,
 * and focus returns to whatever opened it.
 */
export function useDialog<T extends HTMLElement>(open: boolean, onClose: () => void): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Remember what had focus *before* the dialog rendered (autoFocus inside it would otherwise win).
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) openerRef.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    const label = opener ? describe(opener) : null;
    const node = ref.current;
    const items = () => (node ? [...node.querySelectorAll<HTMLElement>(FOCUSABLE)] : []);
    if (node && !node.contains(document.activeElement)) (items()[0] ?? node).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !node) return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreFocus(opener, label);
    };
  }, [open]);

  return ref;
}
