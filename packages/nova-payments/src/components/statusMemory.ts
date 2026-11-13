import { useEffect, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';

/**
 * What the status screens of each store show or showed last, part by part. `leftAt` is `null` while the screen that
 * shows it is still there, and the time it left afterwards.
 */
const shownByStore = new WeakMap<object, Map<string, { value: unknown; leftAt: number | null }>>();

/** A status screen that follows another within this time goes on from what that one showed. */
export const CONTINUES_MS = 500;

/**
 * What the status screen before this one shows in a part of it (its title, its chip, its mark, its steps): each screen
 * of the checkout is a component of its own, and a part that starts from here goes on into its own state instead of
 * starting over. The screen before counts while it is still there (React renders the next screen before the one it
 * replaces leaves: a memory written only as a screen left came too late, and nothing went on from anything) and for a
 * moment after it left.
 *
 * @param store - The checkout store the screens belong to.
 * @param part - The name of the part.
 * @returns What it shows, or `undefined` after a pause or on the first status screen.
 * @internal
 */
export function shownLast<T>(store: object, part: string): T | undefined {
  const last = shownByStore.get(store)?.get(part);
  if (!last) return undefined;
  return last.leftAt === null || Date.now() - last.leftAt < CONTINUES_MS ? (last.value as T) : undefined;
}

/**
 * Keeps what a part of a status screen shows, for the screen after it ({@link shownLast}).
 *
 * @param store - The checkout store the screens belong to.
 * @param part - The name of the part.
 * @param value - What it shows.
 * @param left - Whether the screen that showed it has left (`true` by default); `false` while it is on the screen.
 * @internal
 */
export function rememberShown(store: object, part: string, value: unknown, left = true): void {
  const parts = shownByStore.get(store) ?? new Map<string, { value: unknown; leftAt: number | null }>();
  parts.set(part, { value, leftAt: left ? Date.now() : null });
  shownByStore.set(store, parts);
}

/**
 * A value of a status screen that goes on from the screen before it: the first render gives what that screen showed in
 * the same part, the next one the value itself, so that whatever draws it moves from one to the other ("Confirming"
 * into "Paid"). A value after a pause (the buyer went back to pay again) starts as it is.
 *
 * @param part - The name of the part.
 * @param value - What this screen shows.
 * @returns What to draw now.
 * @internal
 */
export function useContinued<T extends string>(part: string, value: T): T {
  const { store } = useCheckoutContext();
  const [shown, setShown] = useState<T>(() => shownLast<T>(store, part) ?? value);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The change of the value is what moves the part
    setShown(value);
    rememberShown(store, part, value, false);
    return () => rememberShown(store, part, value);
  }, [store, part, value]);
  return shown;
}
