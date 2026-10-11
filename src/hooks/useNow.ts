import { useEffect, useState } from 'react';

/**
 * The current time, updated every `intervalMs` while `active`.
 *
 * Side effect: an interval timer while active.
 *
 * @param intervalMs - How often to update, in milliseconds.
 * @param active - Whether to update (stop on a final state to save renders).
 * @returns `Date.now()` of the latest update.
 */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}
