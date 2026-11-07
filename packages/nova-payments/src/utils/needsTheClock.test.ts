import { describe, expect, it } from 'vitest';

import { needsTheClock } from './outcome';

describe('needsTheClock', () => {
  it.each(['loading', 'selectMethod', 'awaitingPayment', 'confirming', 'unconfirmed'])('ticks on %s', (phase) => {
    expect(needsTheClock(phase, undefined, true)).toBe(true);
  });

  it.each(['held', 'refunded', 'expired', 'cancelled', 'blocked', 'error'])('rests on %s', (phase) => {
    expect(needsTheClock(phase, undefined, true)).toBe(false);
  });

  it('ticks on a paid page for its return countdown, and rests without one', () => {
    expect(needsTheClock('paid', 5, true)).toBe(true);
    expect(needsTheClock('paid', 0, true)).toBe(false);
  });

  it('ticks until the labels of the language are there', () => {
    expect(needsTheClock('expired', undefined, false)).toBe(true);
  });
});
