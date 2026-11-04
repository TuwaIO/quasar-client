import type { CheckoutStore } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutScreen } from '../utils/checkout';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useQrShown } = await import('./useQrShown');

const first = {} as CheckoutStore;
const second = {} as CheckoutStore;
const shownOn = (store: CheckoutStore, screen: CheckoutScreen) => render(useQrShown, { store, screen });

afterEach(() => unmount());

// A QR code the page showed may have been paid from a phone, which this page does not see, so an
// invoice that expires afterwards never says that nothing was charged
describe('useQrShown', () => {
  it('is false until a QR code shows, then stays true for the invoice', () => {
    expect(shownOn(first, 'method')).toBe(false);
    expect(shownOn(first, 'qr')).toBe(true);
    expect(shownOn(first, 'method')).toBe(true);
    expect(shownOn(first, 'expired')).toBe(true);
  });

  it('starts again for another invoice', () => {
    shownOn(first, 'qr');
    expect(shownOn(second, 'method')).toBe(false);
  });
});
