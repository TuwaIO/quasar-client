import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONTINUES_MS, rememberShown, shownLast } from './statusMemory';

afterEach(() => vi.useRealTimers());

describe('what the status screens of a store show', () => {
  // The memory was written only as a screen left. React renders the next screen before the one it replaces leaves, so
  // that screen found nothing: "Confirming" never went on into "Paid", and the steps drew themselves again
  it('is there for the next screen while the screen that shows it is still on the page', () => {
    vi.useFakeTimers();
    const store = {};
    rememberShown(store, 'title', 'Confirming', false);
    vi.advanceTimersByTime(60_000);
    expect(shownLast(store, 'title')).toBe('Confirming');
  });

  it('stays for a moment after that screen left, and no longer', () => {
    vi.useFakeTimers();
    const store = {};
    rememberShown(store, 'title', 'Confirming', false);
    rememberShown(store, 'title', 'Confirming');
    vi.advanceTimersByTime(CONTINUES_MS - 1);
    expect(shownLast(store, 'title')).toBe('Confirming');
    vi.advanceTimersByTime(2);
    expect(shownLast(store, 'title')).toBeUndefined();
  });

  it('is kept part by part and store by store', () => {
    const store = {};
    rememberShown(store, 'title', 'Confirming', false);
    expect(shownLast(store, 'chip')).toBeUndefined();
    expect(shownLast({}, 'title')).toBeUndefined();
  });
});
