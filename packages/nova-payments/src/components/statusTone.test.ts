import { describe, expect, it } from 'vitest';

import type { CheckoutScreen } from '../utils/checkout';
import { statusToneOf } from './statusTone';

describe('statusToneOf', () => {
  it('a payment on its way runs a glint, and its result fills the strip', () => {
    expect(statusToneOf('confirm')).toBe('pending');
    expect(statusToneOf('paid')).toBe('success');
    expect(statusToneOf('blocked')).toBe('error');
  });

  // Under a text asking the buyer to check the wallet, the glint of a payment under way said the opposite
  it('a warning stands still: something needs the buyer', () => {
    expect(statusToneOf('unconfirmed')).toBe('warning');
    expect(statusToneOf('underpaid')).toBe('warning');
  });

  it('what is neither is neutral: the money did not fail, it went another way', () => {
    for (const screen of ['held', 'refunded', 'expired', 'cancelled', 'replaced'] as const) {
      expect(statusToneOf(screen)).toBe('neutral');
    }
  });

  it('a step of the buyer has no strip: nothing goes on until the buyer acts', () => {
    const steps: CheckoutScreen[] = ['loading', 'buyer', 'method', 'confirmWallet', 'pay', 'qr'];
    for (const screen of steps) expect(statusToneOf(screen)).toBeNull();
  });
});
