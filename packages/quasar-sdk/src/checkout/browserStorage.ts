import type { CheckoutHandOverStorage } from './store';

/**
 * The browser's `sessionStorage`, when there is one and the page may use it.
 *
 * @internal
 */
export function browserSessionStorage(): CheckoutHandOverStorage | null {
  try {
    return (globalThis as { sessionStorage?: CheckoutHandOverStorage }).sessionStorage ?? null;
  } catch {
    // Blocked storage throws on access
    return null;
  }
}
