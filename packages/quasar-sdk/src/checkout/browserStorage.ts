import type { CheckoutHandOverStorage } from './store';

/**
 * The browser's `localStorage`, when there is one and the page may use it.
 *
 * @internal
 */
export function browserLocalStorage(): CheckoutHandOverStorage | null {
  try {
    return (globalThis as { localStorage?: CheckoutHandOverStorage }).localStorage ?? null;
  } catch {
    // Blocked storage throws on access
    return null;
  }
}
