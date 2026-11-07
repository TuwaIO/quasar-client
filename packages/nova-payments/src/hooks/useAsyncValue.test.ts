import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useAsyncValue, useRereadValue } = await import('./useAsyncValue');

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

// The buyer read "Not enough", topped up the wallet and came back: the button stayed dead until a reload
describe('useRereadValue', () => {
  afterEach(() => vi.unstubAllGlobals());

  const page = () => {
    const events = new EventTarget();
    vi.stubGlobal('window', events);
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
    return events;
  };

  it('reads again when the buyer comes back, and keeps the last answer meanwhile', async () => {
    const events = page();
    let answer = 1n;
    const load = vi.fn(async () => answer);
    const renderHook = () => render(({ k }: { k: string }) => useRereadValue(k, load), { k: 'a' });
    renderHook();
    await flush();
    expect(renderHook()).toBe(1n);
    answer = 5n;
    events.dispatchEvent(new Event('focus'));
    // While it reads, the last answer stands: a shortfall does not open the button before the new balance is known
    expect(renderHook()).toBe(1n);
    await flush();
    renderHook();
    await flush();
    expect(renderHook()).toBe(5n);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads again when asked to, for the same key', async () => {
    page();
    const load = vi.fn(async () => 1n);
    const renderHook = (price: string) =>
      render(({ k, p }: { k: string; p: string }) => useRereadValue(k, load, p), { k: 'a', p: price });
    renderHook('one');
    await flush();
    renderHook('two');
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reads nothing without a key', () => {
    page();
    const load = vi.fn(async () => 1n);
    expect(render(({ k }: { k: string | null }) => useRereadValue(k, load), { k: null })).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });
});
