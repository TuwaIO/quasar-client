import type { AutoChargeOffer, CheckoutMethod, CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import { defaultLabels } from '../i18n/en';
import {
  autoPayTerms,
  contactHref,
  formatPeriod,
  methodErrorText,
  needsLeaveConfirm,
  receivedAmount,
  underpaidRest,
} from './outcome';

/** What the checkout says about a transaction another invoice handed over first (M3). */
const TAKEN_ELSEWHERE =
  'This transaction was handed over for another invoice first. Quasar credits it to the invoice the wallet that sent it confirmed, and this page shows the result while it follows the payment. Do not pay again; if your payment does not show here, contact Cosmos with the transaction hash.';
/** What the checkout says about a confirmed payment Quasar has not recorded, without promising retries (M1). */
const SETTLEMENT_FAILED =
  'The network confirmed your payment, but Quasar has not recorded it. Do not pay again; contact Cosmos with the transaction hash.';

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

  // F9: the question says "Nothing is sent yet", which is not true after a transaction that may have moved money
  it('does not ask after a transaction that does not pay the invoice', () => {
    expect(needsLeaveConfirm('awaitingPayment', { code: 'payment_mismatch', message: '' } as never)).toBe(false);
    expect(
      needsLeaveConfirm('selectMethod', { code: 'payment_failed', message: '', reason: 'too_early' } as never),
    ).toBe(false);
    expect(
      needsLeaveConfirm('awaitingPayment', { code: 'payment_failed', message: '', reason: 'reverted' } as never),
    ).toBe(true);
  });

  // Quasar closed the payment after 24 hours without a result on chain; it may still have left the wallet
  it('does not ask after a payment Quasar closed without a result', () => {
    expect(
      needsLeaveConfirm('awaitingPayment', {
        code: 'payment_failed',
        message: '',
        reason: 'unresolved_after_24h',
      } as never),
    ).toBe(false);
  });
});

// A payment another invoice took or Quasar has not recorded yet left the wallet
describe('needsLeaveConfirm on the rest of an underpaid invoice', () => {
  it('closes without a question: part of the money was sent, and nothing about the price is released', () => {
    expect(needsLeaveConfirm('awaitingPayment', null, 'underpaid')).toBe(false);
    expect(needsLeaveConfirm('quoting', null, 'underpaid')).toBe(false);
    expect(needsLeaveConfirm('awaitingPayment', null, 'open')).toBe(true);
  });
});

describe('needsLeaveConfirm after a payment that left the wallet', () => {
  it('does not ask after a transaction another invoice took or a confirmed payment not recorded yet', () => {
    for (const error of [
      { code: 'payment_unconfirmed', message: '', reason: 'tx_already_used', status: 409 },
      { code: 'payment_unconfirmed', message: '', reason: 'settlement_failed' },
      { code: 'payment_mismatch', message: '', reason: 'settlement_failed' },
    ]) {
      expect(needsLeaveConfirm('awaitingPayment', error as never)).toBe(false);
    }
  });
});

describe('methodErrorText', () => {
  // Each said "Something went wrong": a transaction that reverted, seen after the price lock or on a rest, and the method
  // refused for a rest
  it.each([
    ['payment_failed', 'paymentFailed'],
    ['rest_method_mismatch', 'restSameMethod'],
  ] as const)('explains %s', (code, label) => {
    expect(methodErrorText({ code, message: 'raw' } as never, defaultLabels)).toBe(defaultLabels.method[label]);
  });

  it('explains the refusals of a confirmation that arrive after the buyer left its step', () => {
    expect(methodErrorText({ code: 'payer_proof_declined', message: 'raw' } as never, defaultLabels)).toBe(
      defaultLabels.payerProof.text,
    );
    expect(methodErrorText({ code: 'payer_proof_invalid', message: 'raw' } as never, defaultLabels)).toBe(
      defaultLabels.payerProof.invalid,
    );
  });

  // Names nobody signed for filled the places, and this wallet cannot sign: only a new link helps
  it('asks for a new link when too many wallets tried the invoice', () => {
    const text = methodErrorText({ code: 'too_many_payers', message: 'raw' } as never, defaultLabels, 'Shop');
    expect(text).toBe(defaultLabels.method.tooManyPayers.replace('{merchant}', 'Shop'));
  });

  // The quote is refused before money moves: the buyer must hear whom to ask, not "try again"
  it('sends the buyer to the merchant when the invoice took all the transactions it follows', () => {
    const text = methodErrorText({ code: 'too_many_payments', message: 'raw' } as never, defaultLabels, 'Shop');
    expect(text).toBe(defaultLabels.method.tooManyPayments.replace('{merchant}', 'Shop'));
    expect(text).not.toContain('raw');
  });

  it('tells a transfer past the parts of an invoice, and one sent under an earlier price, for what they are', () => {
    expect(
      methodErrorText(
        { code: 'payment_mismatch', message: 'raw', reason: 'too_many_parts', held: true } as never,
        defaultLabels,
        'Cosmos',
      ),
    ).toMatch(/as many parts as it can/);
    expect(
      methodErrorText(
        { code: 'payment_mismatch', message: 'raw', reason: 'quote_changed', held: true } as never,
        defaultLabels,
        'Cosmos',
      ),
    ).toMatch(/earlier price of this invoice/);
  });

  it('asks a smart wallet for a token instead of a native coin', () => {
    expect(methodErrorText({ code: 'native_from_contract', message: 'raw' } as never, defaultLabels, 'Cosmos')).toBe(
      defaultLabels.method.nativeFromSmartWallet,
    );
  });

  // F9: back at the methods after a transaction that does not pay the invoice, the buyer learns what to do if money left
  it('says that a transaction does not pay the invoice, never that it did not go through', () => {
    const text = methodErrorText({ code: 'payment_mismatch', message: 'raw' } as never, defaultLabels, 'Cosmos');
    expect(text).toBe('This transaction does not pay the invoice. If money left your wallet, contact Cosmos.');
    // An older store reports it as payment_failed with the reason
    expect(
      methodErrorText(
        { code: 'payment_failed', message: 'raw', reason: 'too_early' } as never,
        defaultLabels,
        'Cosmos',
      ),
    ).toBe('This transaction does not pay the invoice. If money left your wallet, contact Cosmos.');
  });

  it('sends the buyer to the merchant with the transaction hash after a payment Quasar closed without a result', () => {
    expect(
      methodErrorText(
        { code: 'payment_failed', message: 'raw', reason: 'unresolved_after_24h' } as never,
        defaultLabels,
        'Cosmos',
      ),
    ).toBe(
      'Quasar did not find this payment on the network within 24 hours and no longer checks it. If it left your wallet, contact Cosmos with the transaction hash.',
    );
  });

  // Quasar credited the transaction to another invoice, the one of the wallet that sent it
  it('says that the transaction pays another invoice, with the hash for the merchant', () => {
    for (const code of ['payment_mismatch', 'payment_failed']) {
      expect(
        methodErrorText({ code, message: 'raw', reason: 'tx_already_used' } as never, defaultLabels, 'Cosmos'),
      ).toBe(
        'This transaction pays another invoice. If it was your payment for this one, contact Cosmos with the transaction hash.',
      );
    }
  });

  // A transfer from a wallet that did not confirm the invoice is a held transfer: the invoice stays payable
  it('says that the seller returns a held transfer, and that the confirmed wallet can still pay the invoice', () => {
    const held = methodErrorText(
      { code: 'payment_mismatch', message: 'raw', reason: 'payer_unconfirmed', held: true } as never,
      defaultLabels,
      'Cosmos',
    );
    expect(held).toBe(
      'This transfer came from a wallet that did not confirm this invoice, so it does not pay it. Cosmos returns it to the wallet that sent it, and you can still pay this invoice from the wallet that confirmed it.',
    );
    // Without a held transfer nothing promises a refund
    const plain = methodErrorText(
      { code: 'payment_mismatch', message: 'raw', reason: 'payer_mismatch' } as never,
      defaultLabels,
      'Cosmos',
    );
    expect(plain).not.toMatch(/returns it/);
  });

  // A transfer held on another invoice for a refund only pays no invoice
  it('says that a transfer held on another invoice is tied to it, never that it pays it', () => {
    const text = methodErrorText(
      { code: 'payment_mismatch', message: 'raw', reason: 'tx_already_used', held: true } as never,
      defaultLabels,
      'Cosmos',
    );
    expect(text).toBe(
      'This transaction is tied to another invoice, which holds it for a refund to the wallet that sent it. It does not count for this invoice. If it was your payment for this one, contact Cosmos with the transaction hash.',
    );
    expect(text).not.toMatch(/\bpays\b/);
  });

  it('says what happens to a payment another invoice took, or one Quasar has not recorded yet', () => {
    expect(
      methodErrorText(
        { code: 'payment_unconfirmed', message: 'raw', reason: 'tx_already_used', status: 409 } as never,
        defaultLabels,
        'Cosmos',
      ),
    ).toBe(TAKEN_ELSEWHERE);
    expect(
      methodErrorText(
        { code: 'payment_mismatch', message: 'raw', reason: 'settlement_failed' } as never,
        defaultLabels,
        'Cosmos',
      ),
    ).toBe(SETTLEMENT_FAILED);
  });

  it('says what went wrong and what to do, in the language of the checkout', () => {
    const text = (code: string) => methodErrorText({ code, message: 'raw' }, defaultLabels);
    expect(text('screening_unavailable')).toBe(defaultLabels.pay.screeningUnavailable);
    expect(text('request_failed')).toBe(defaultLabels.pay.noAnswer);
    expect(text('amount_out_of_range')).toBe(defaultLabels.method.methodUnavailable);
    expect(text('method_not_found')).toBe(defaultLabels.method.methodUnavailable);
    // A test invoice is paid on a test network only
    expect(text('testnet_required')).toBe(defaultLabels.method.methodUnavailable);
    expect(text('payer_not_expected')).toBe(defaultLabels.method.payerNotExpected);
    expect(text('rate_limited')).toBe(defaultLabels.method.rateLimited);
    // Quasar could not read the price of the method (its feed or RPC is down, or the seller set up no RPC for its
    // network): another method may work
    expect(text('price_unavailable')).toBe(defaultLabels.method.priceUnavailable);
    expect(text('price_no_rpc')).toBe(defaultLabels.method.priceUnavailable);
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

    // The charges go to the merchant's wallet the payee rule names, not to the collector that sends them
    const payee = '0x4444444444444444444444444444444444444444';
    const withPayee: AutoChargeOffer = {
      ...offer,
      request: {
        ...offer.request,
        rules: [...offer.request.rules, { type: 'payee', data: { addresses: [payee] } }],
      },
    };
    expect(autoPayTerms(withPayee, [method()])?.to).toBe(payee);
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

describe('receivedAmount', () => {
  it('is what arrived on the invoice, when anything did', () => {
    expect(receivedAmount('80000000')).toBe('80000000');
    expect(receivedAmount('0')).toBeNull();
    expect(receivedAmount(null)).toBeNull();
    expect(receivedAmount('')).toBeNull();
  });
});

describe('a transfer from a wallet that did not confirm the invoice', () => {
  const OTHER_WALLET =
    'This transfer came from a wallet that did not confirm this invoice, so it does not pay it. If money left your wallet, contact Cosmos.';

  it('never promises a refund: without a hold, nothing says the seller returns it', () => {
    for (const reason of ['payer_mismatch', 'payer_unconfirmed']) {
      const error = { code: 'payment_mismatch', message: '', reason } as never;
      expect(methodErrorText(error, defaultLabels, 'Cosmos')).toBe(OTHER_WALLET);
    }
  });

  it('asks for the confirmation when Quasar wants the wallet confirmed first', () => {
    expect(methodErrorText({ code: 'payer_proof_required', message: '' }, defaultLabels)).toBe(
      defaultLabels.payerProof.text,
    );
  });

  it('promises the settlement retries only while Quasar makes them, for 30 days', () => {
    const retrying = methodErrorText(
      { code: 'payment_unconfirmed', message: '', reason: 'settlement_failed', rechecked: true } as never,
      defaultLabels,
      'Cosmos',
    );
    expect(retrying).toBe(
      'The network confirmed your payment, but Quasar has not recorded it yet. Quasar tries again daily, for 30 days after it learned of the payment. Do not pay again; contact Cosmos with the transaction hash.',
    );
    const stopped = methodErrorText(
      { code: 'payment_unconfirmed', message: '', reason: 'settlement_failed' } as never,
      defaultLabels,
      'Cosmos',
    );
    expect(stopped).toBe(
      'The network confirmed your payment, but Quasar has not recorded it. Do not pay again; contact Cosmos with the transaction hash.',
    );
    expect(stopped).not.toMatch(/again daily/);
  });
});
