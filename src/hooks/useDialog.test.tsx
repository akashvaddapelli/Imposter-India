import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDialog } from './useDialog';

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useDialog<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      <button>outside</button>
      {open && (
        <div role="dialog" ref={ref}>
          <input aria-label="first" />
          <button>second</button>
          <button>last</button>
        </div>
      )}
    </div>
  );
}

afterEach(cleanup);

function Remounting() {
  const [open, setOpen] = useState(false);
  const ref = useDialog<HTMLDivElement>(open, () => setOpen(false));
  // The opener is re-created whenever the dialog toggles (a different key), like a component defined inside render.
  return (
    <div>
      <button key={String(open)} onClick={() => setOpen(true)}>remount opener</button>
      {open && <div role="dialog" ref={ref}><input aria-label="field" autoFocus /></div>}
    </div>
  );
}

const openDialog = () => {
  render(<Harness />);
  const opener = screen.getByText('opener');
  opener.focus();
  act(() => { opener.click(); });
  return opener;
};

describe('useDialog', () => {
  it('moves focus into the dialog when it opens', () => {
    openDialog();
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
  });
  it('keeps Tab inside the dialog in both directions', () => {
    openDialog();
    screen.getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByLabelText('first'));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });
  it('pulls focus back in if it escaped the dialog', () => {
    openDialog();
    screen.getByText('outside').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
  it('Escape closes the dialog and returns focus to the opener', () => {
    const opener = openDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it('returns focus to an equivalent opener when the page re-created it', () => {
    cleanup();
    render(<Remounting />);
    const first = screen.getByText('remount opener');
    first.focus();
    act(() => { first.click(); });
    expect(first.isConnected).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByText('remount opener'));
  });
});
