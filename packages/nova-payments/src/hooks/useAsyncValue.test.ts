import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useAsyncValue } = await import('./useAsyncValue');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(unmount);

describe('useAsyncValue', () => {
  it('reads the value again when the key changes, and keeps no answer for an old key', async () => {
    const answers: Record<string, (value: number) => void> = {};
    const load = vi.fn((key: string) => new Promise<number>((resolve) => (answers[key] = resolve)));
    const renderHook = (key: string | null) =>
      render(({ k }: { k: string | null }) => useAsyncValue(k, () => load(k!)), { k: key });

    expect(renderHook('a')).toBeUndefined();
    renderHook('b');
    answers.a(1);
    await flush();
    expect(renderHook('b')).toBeUndefined();
    answers.b(2);
    await flush();
    expect(renderHook('b')).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads nothing without a key, and nothing for a failed read', async () => {
    const load = vi.fn(async () => {
      throw new Error('rpc down');
    });
    const renderHook = (key: string | null) =>
      render(({ k }: { k: string | null }) => useAsyncValue(k, load), { k: key });
    expect(renderHook(null)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
    renderHook('a');
    await flush();
    expect(renderHook('a')).toBeNull();
  });
});
