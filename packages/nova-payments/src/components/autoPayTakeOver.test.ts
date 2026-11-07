import type { AutoChargeOffer } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import { grantableOffer } from '../utils/outcome';

const request = { chainId: '0x2105', to: '0x1', permission: {}, rules: [] } as never;

describe('what the connected wallet may ask for', () => {
  it('is the offer', () => {
    const offer = { status: 'available', methodId: 'usdc', request } as AutoChargeOffer;
    expect(grantableOffer(offer)).toBe(offer);
  });

  // A permission whose wallet cannot pay, or that expired, must not keep the subscription from the buyer
  it('is taking over a permission that holds nothing', () => {
    const replacement = { methodId: 'usdc', request };
    const offer = { status: 'active', permission: null, revocation: null, replacement } as AutoChargeOffer;
    expect(grantableOffer(offer)).toBe(replacement);
  });

  it('is nothing when a permission pays, or nothing can be given', () => {
    expect(grantableOffer({ status: 'active', permission: null, revocation: null })).toBeNull();
    expect(grantableOffer({ status: 'unavailable', reason: 'x' })).toBeNull();
    expect(grantableOffer(null)).toBeNull();
  });
});
