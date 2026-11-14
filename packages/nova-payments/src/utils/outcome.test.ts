import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import { defaultLabels } from '../i18n/en';
import {
  contactHref,
  failedPaymentTx,
  methodErrorText,
  needsLeaveConfirm,
  paymentFailedText,
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
  it('explains a transaction that reverted, and the method refused for a rest', () => {
    const reverted = { code: 'payment_failed', message: 'raw', reason: 'reverted' };
    expect(methodErrorText(reverted as never, defaultLabels)).toBe(defaultLabels.method.paymentFailed);
    expect(methodErrorText({ code: 'rest_method_mismatch', message: 'raw' } as never, defaultLabels)).toBe(
      defaultLabels.method.restSameMethod,
    );
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

  // Owner test 2026-11-05, finding 1: Phantom dropped the Solana Pay reference. Held on this invoice, the transfer read
  // as "tied to another invoice", which sent the buyer looking for an invoice that does not exist
  it('says that a Solana Pay transfer held for its missing reference is returned, never tied to another invoice', () => {
    const held = methodErrorText(
      { code: 'payment_mismatch', message: 'raw', reason: 'reference_missing', held: true } as never,
      defaultLabels,
      'Cosmos',
    );
    expect(held).toBe(
      'This transfer arrived without the Solana Pay reference of this invoice, and its amount alone does not tie it to the invoice, so it does not pay it. Cosmos returns it to the wallet that sent it, and you can still pay the invoice.',
    );
    expect(held).not.toMatch(/another invoice/);
    // Without a held transfer nothing promises a refund
    const plain = methodErrorText(
      { code: 'payment_mismatch', message: 'raw', reason: 'reference_missing' } as never,
      defaultLabels,
      'Cosmos',
    );
    expect(plain).toBe('This transaction does not pay the invoice. If money left your wallet, contact Cosmos.');
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

  // A plain "something went wrong" with a second payment on offer, though money may have left the wallet
  it('says that money may have left the wallet when a nonce went to a transaction nothing found', () => {
    const error = { code: 'payment_unconfirmed', message: 'raw', reason: 'nonce_spent_unexplained' } as never;
    expect(methodErrorText(error, defaultLabels, 'Cosmos')).toContain('money may have left your wallet');
    expect(needsLeaveConfirm('selectMethod', error)).toBe(false);
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
    // The merchant's own wallet would send to itself
    expect(text('payer_is_recipient')).toBe(
      'This wallet receives the payment for this invoice. Pay from another wallet.',
    );
    expect(text('rate_limited')).toBe(defaultLabels.method.rateLimited);
    // Quasar could not read the price of the method (its feed or RPC is down, or the seller set up no RPC for its
    // network): another method may work
    expect(text('price_unavailable')).toBe(defaultLabels.method.priceUnavailable);
    expect(text('price_no_rpc')).toBe(defaultLabels.method.priceUnavailable);
    expect(text('something_new')).toBe(defaultLabels.error.generic);
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

// "Only the network fee was spent" was said about every payment Quasar ended as failed. It is true of a transaction that
// reverted; a Solana transaction whose blockhash expired never landed and spent nothing, and neither did a relay
// operation that was lost
describe('what the checkout says about a payment that failed for good', () => {
  const failed = (reason?: string) =>
    ({ code: 'payment_failed', message: 'raw', ...(reason ? { reason } : {}) }) as never;

  it('says that the fee was spent only of a transaction that reverted on the network', () => {
    expect(paymentFailedText(failed('reverted'), defaultLabels, 'Base')).toBe(
      'The payment failed on Base. Only the network fee was spent; the invoice is still open.',
    );
    // The method step does not know the network of the payment
    expect(paymentFailedText(failed('reverted'), defaultLabels)).toBe(defaultLabels.method.paymentFailed);
    for (const reason of ['expired', 'cancelled', 'user_operation_lost', 'transaction_failed', undefined]) {
      expect(paymentFailedText(failed(reason), defaultLabels, 'Solana Devnet'), String(reason)).not.toMatch(/fee/i);
    }
  });

  it('says of a transaction that expired before it landed that nothing was sent', () => {
    expect(paymentFailedText(failed('expired'), defaultLabels, 'Solana Devnet')).toBe(
      'The transaction was not confirmed in time and expired, so nothing was sent. The invoice is still open.',
    );
  });

  it('says of a transaction the buyer cancelled that it was cancelled in the wallet', () => {
    expect(paymentFailedText(failed('cancelled'), defaultLabels, 'Base')).toBe(
      'The transaction was cancelled in the wallet. The invoice is still open.',
    );
  });

  it('says only that the invoice is not paid when Quasar names another cause, or none', () => {
    for (const reason of ['user_operation_lost', 'transaction_failed', undefined]) {
      expect(paymentFailedText(failed(reason), defaultLabels, 'Base'), String(reason)).toBe(
        'The payment did not go through. The invoice is still open.',
      );
    }
    // On the method step too: it said that the fee was spent of every one of them
    expect(methodErrorText(failed('expired'), defaultLabels)).toBe(defaultLabels.pay.failedExpired);
    expect(methodErrorText(failed(), defaultLabels)).toBe(defaultLabels.pay.didNotGoThrough);
  });
});

describe('the transaction of a payment that ended without paying the invoice', () => {
  it('is the one the error names, for a failed payment and for one that does not pay the invoice', () => {
    expect(failedPaymentTx({ code: 'payment_failed', message: '', txKey: '0xfeed' } as never)).toBe('0xfeed');
    expect(failedPaymentTx({ code: 'payment_mismatch', message: '', txKey: '5Zsig' } as never)).toBe('5Zsig');
  });

  it('is none for an error that names no transaction, and for any other error', () => {
    expect(failedPaymentTx({ code: 'payment_failed', message: '' } as never)).toBeNull();
    expect(failedPaymentTx({ code: 'payment_failed', message: '', txKey: '' } as never)).toBeNull();
    // Another error may carry a transaction of its own, shown on its own screen
    expect(failedPaymentTx({ code: 'payment_unconfirmed', message: '', txKey: '0xfeed' } as never)).toBeNull();
    expect(failedPaymentTx(null)).toBeNull();
    expect(failedPaymentTx(undefined)).toBeNull();
  });
});
