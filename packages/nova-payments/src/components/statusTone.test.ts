import { describe, expect, it } from 'vitest';

import type { CheckoutScreen } from '../utils/checkout';
import { statusToneOf } from './statusTone';

describe('statusToneOf', () => {
  it('a payment on its way runs a glint, and its result fills the strip', () => {
    expect(statusToneOf('confirm')).toBe('pending');
    expect(statusToneOf('paid')).toBe('success');
    expect(statusToneOf('blocked')).toBe('error');
  });

  it('what is neither is neutral: the money did not fail, it went another way', () => {
    for (const screen of ['held', 'refunded', 'expired', 'cancelled', 'replaced'] as const) {
      expect(statusToneOf(screen)).toBe('neutral');
    }
  });

  it('a step of the buyer has no strip: nothing goes on until the buyer acts', () => {
    const steps: CheckoutScreen[] = [
      'loading',
      'buyer',
      'method',
      'confirmWallet',
      'pay',
      'qr',
      'autoPay',
      'autoPayOff',
    ];
    for (const screen of steps) expect(statusToneOf(screen)).toBeNull();
  });
});
