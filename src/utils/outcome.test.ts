import type { AutoChargeOffer, CheckoutMethod, CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import { defaultLabels } from '../i18n/en';
import { autoPayTerms, contactHref, formatPeriod, methodErrorText, needsLeaveConfirm, underpaidRest } from './outcome';

describe('contactHref', () => {
  it("writes to the seller's support email about the invoice, else opens the seller's site", () => {
    expect(
      contactHref({ supportEmail: 'support@acme.example', website: 'https://acme.example' }, 'Invoice INV-2026-42'),
    ).toBe('mailto:support@acme.example?subject=Invoice%20INV-2026-42');
    expect(contactHref({ supportEmail: null, website: 'https://acme.example' }, 'Invoice INV-2026-42')).toBe(
      'https://acme.example',
    );
    expect(contactHref({ supportEmail: null, website: null }, 'x')).toBeNull();
  });
});

describe('needsLeaveConfirm', () => {
  it('asks before leaving while nothing was sent, and not once the payment is on its way or settled', () => {
    for (const phase of ['buyer', 'selectMethod', 'quoting', 'awaitingPayment'] as const) {
      expect(needsLeaveConfirm(phase)).toBe(true);
    }
    for (const phase of ['loading', 'submitting', 'confirming', 'paid', 'underpaid', 'expired', 'error'] as const) {
      expect(needsLeaveConfirm(phase)).toBe(false);
    }
  });
});

describe('methodErrorText', () => {
  it('says what went wrong and what to do, in the language of the checkout', () => {
    const text = (code: string) => methodErrorText({ code, message: 'raw' }, defaultLabels);
    expect(text('screening_unavailable')).toBe(defaultLabels.pay.screeningUnavailable);
    expect(text('request_failed')).toBe(defaultLabels.pay.noAnswer);
    expect(text('amount_out_of_range')).toBe(defaultLabels.method.methodUnavailable);
    expect(text('method_not_found')).toBe(defaultLabels.method.methodUnavailable);
    expect(text('payer_not_expected')).toBe(defaultLabels.method.payerNotExpected);
    expect(text('rate_limited')).toBe(defaultLabels.method.rateLimited);
    // Quasar could not read the price of the method (its feed or RPC is down): another method may work
    expect(text('price_unavailable')).toBe(defaultLabels.method.priceUnavailable);
    expect(text('something_new')).toBe(defaultLabels.error.generic);
  });
});

const method = (extra: Partial<CheckoutMethod> = {}): CheckoutMethod => ({
  id: 'ap_usdc_base',
  name: 'USDC on Base',
  symbol: 'USDC',
  chainId: 'eip155:84532',
  assetId: null,
  decimals: 6,
  gasless: 'off',
  featured: false,
  markupBps: 0,
  discountBps: 0,
  ...extra,
});

describe('autoPayTerms', () => {
  it('reads the limit, period, expiry and accounts of an ERC-7715 offer', () => {
    const offer: AutoChargeOffer = {
      status: 'available',
      methodId: 'ap_usdc_base',
      request: {
        chainId: '0x14a34',
        to: '0x3333333333333333333333333333333333333333',
        permission: {
          type: 'erc20-token-periodic',
          isAdjustmentAllowed: false,
          data: {
            tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            periodAmount: '0x2ebae40',
            periodDuration: 2_592_000,
            startTime: 1_791_000_000,
            justification: 'Pro plan',
          },
        },
        rules: [{ type: 'expiry', data: { timestamp: 1_822_536_000 } }],
      },
    };
    expect(autoPayTerms(offer, [method()])).toEqual({
      chainId: 'eip155:84532',
      to: '0x3333333333333333333333333333333333333333',
      limit: '49000000',
      decimals: 6,
      symbol: 'USDC',
      periodSeconds: 2_592_000,
      expiresAt: 1_822_536_000_000,
    });
    expect(autoPayTerms({ status: 'unavailable', reason: 'no_collector' }, [method()])).toBeNull();
    expect(autoPayTerms(offer, [])).toBeNull();
  });
});

describe('formatPeriod', () => {
  it('names a period in days, or in hours when it is not whole days', () => {
    expect(formatPeriod(2_592_000, 'en')).toBe('30 days');
    expect(formatPeriod(86_400, 'en')).toBe('1 day');
    expect(formatPeriod(7_200, 'en')).toBe('2 hours');
    expect(formatPeriod(2_592_000, 'uk')).toBe('30 днів');
  });
});

describe('underpaidRest', () => {
  it('is what the buyer still owes of the locked amount', () => {
    const quote = { cryptoAmountExpected: '89540000' } as CheckoutQuote;
    expect(underpaidRest(quote, '80000000')).toBe('9540000');
    expect(underpaidRest(quote, '89540000')).toBeNull();
    expect(underpaidRest(null, '1')).toBeNull();
    expect(underpaidRest(quote, null)).toBeNull();
  });
});
