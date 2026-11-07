import { afterEach, describe, expect, it, vi } from 'vitest';

import { settlesWithin } from './settlesWithin';

describe('settlesWithin', () => {
  afterEach(() => vi.useRealTimers());

  it('says yes to what settles in time', async () => {
    await expect(settlesWithin(Promise.resolve('value'), 1_000)).resolves.toBe(true);
  });

  it('says no to what never answers', async () => {
    vi.useFakeTimers();
    const waiting = settlesWithin(new Promise(() => {}), 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(waiting).resolves.toBe(false);
  });

  it('passes a rejection through', async () => {
    await expect(settlesWithin(Promise.reject(new Error('declined')), 1_000)).rejects.toThrow('declined');
  });
});
