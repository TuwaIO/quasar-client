import { useEffect, useEffectEvent, useState } from 'react';

/**
 * Reads a value once per key: again when the key changes, never for a `null` key. An answer for an old key is
 * dropped. Used for the balances and fee estimates the pay step reads from the network.
 *
 * @param key - What the value depends on, as a string; `null` to read nothing.
 * @param load - Reads the value for the current key.
 * @returns The value; `undefined` while it is read (or without a key); `null` when the read failed.
 */
export function useAsyncValue<T>(key: string | null, load: () => Promise<T> | T): T | null | undefined {
  const [result, setResult] = useState<{ key: string; value: T | null } | null>(null);
  const read = useEffectEvent(load);

  useEffect(() => {
    if (key === null) return;
    let current = true;
    let pending: Promise<T>;
    try {
      pending = Promise.resolve(read());
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (value) => current && setResult({ key, value }),
      () => current && setResult({ key, value: null }),
    );
    return () => {
      current = false;
    };
  }, [key]);

  return result && result.key === key ? result.value : undefined;
}

/**
 * Reads a value like {@link useAsyncValue}, and again when the buyer comes back to the page (focus, visibility) or
 * `refresh` changes, keeping the last answer meanwhile: a balance the buyer tops up in the wallet opens the pay button
 * without a reload, and a read under way does not open it before the answer.
 *
 * Side effects: `focus` and `visibilitychange` listeners while there is a key.
 *
 * @param key - What the value depends on, as a string; `null` to read nothing.
 * @param load - Reads the value for the current key.
 * @param refresh - Reads again when it changes, for the same key.
 * @returns The value; `undefined` until the first answer for this key (or without a key); `null` when the read failed.
 */
export function useRereadValue<T>(
  key: string | null,
  load: () => Promise<T> | T,
  refresh?: unknown,
): T | null | undefined {
  const [back, setBack] = useState(0);
  const [result, setResult] = useState<{ key: string; value: T | null } | null>(null);
  const read = useEffectEvent(load);

  useEffect(() => {
    if (key === null || typeof window === 'undefined') return;
    const onBack = () => {
      if (document.visibilityState !== 'hidden') setBack((count) => count + 1);
    };
    const page = window;
    const view = document;
    page.addEventListener('focus', onBack);
    view.addEventListener('visibilitychange', onBack);
    return () => {
      page.removeEventListener('focus', onBack);
      view.removeEventListener('visibilitychange', onBack);
    };
  }, [key]);

  useEffect(() => {
    if (key === null) return;
    let current = true;
    let pending: Promise<T>;
    try {
      pending = Promise.resolve(read());
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (value) => current && setResult({ key, value }),
      () => current && setResult({ key, value: null }),
    );
    return () => {
      current = false;
    };
  }, [key, back, refresh]);

  return result && result.key === key ? result.value : undefined;
}
