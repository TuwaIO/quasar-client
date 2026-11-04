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
