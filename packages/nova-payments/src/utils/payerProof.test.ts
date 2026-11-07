import type { CheckoutError } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it, vi } from 'vitest';

import { defaultLabels } from '../i18n/en';
import {
  isConfirmationError,
  isPayerProofError,
  isSmartWallet,
  lockPrice,
  needsPayerProof,
  payerProofErrorText,
} from './payerProof';

const values = { wallet: 'MetaMask', network: 'Base', merchant: 'Cosmos' };
const refusal = (code: string, reason?: string): CheckoutError =>
  ({ code, message: '', ...(reason ? { reason } : {}) }) as CheckoutError;

describe('lockPrice', () => {
  const storeOf = (state: Record<string, unknown>) => {
    const current = { ...state };
    const requestQuote = vi.fn(async () => (current.quoteAnswer ?? null) as never);
    return {
      store: { getState: () => ({ ...current, requestQuote }) } as never,
      requestQuote,
      set: (next: Record<string, unknown>) => Object.assign(current, next),
    };
  };

  it('asks the wallet to confirm the invoice before the price, without a request, while it must', async () => {
    const { store, requestQuote } = storeOf({ payerProof: 'required' });
    const confirm = vi.fn();
    await lockPrice(store, confirm);
    expect(confirm).toHaveBeenCalledWith(true);
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('locks the price at once for a confirmed wallet, a Solana method or an older store', async () => {
    for (const payerProof of ['confirmed', 'not_needed', 'unless_relayed', undefined]) {
      const { store, requestQuote } = storeOf({ payerProof, quoteAnswer: { methodId: 'm' } });
      const confirm = vi.fn();
      await lockPrice(store, confirm);
      expect(requestQuote).toHaveBeenCalledOnce();
      expect(confirm).toHaveBeenCalledWith(false);
    }
  });

  it('turns to the confirmation when Quasar refuses the price for a wallet it wants confirmed first', async () => {
    const state = storeOf({ payerProof: 'not_needed' });
    state.requestQuote.mockImplementation(async () => {
      state.set({ error: refusal('payer_proof_required'), payerProof: 'required' });
      return null as never;
    });
    const confirm = vi.fn();
    await lockPrice(state.store, confirm);
    expect(confirm).toHaveBeenLastCalledWith(true);
  });
});

describe('needsPayerProof', () => {
  it('asks before an EVM payment the wallet sends, never before the relay of a gasless one', () => {
    expect(needsPayerProof('required', 'transfer')).toBe(true);
    expect(needsPayerProof('confirming', 'paymaster')).toBe(true);
    expect(needsPayerProof('unless_relayed', 'transfer')).toBe(true);
    expect(needsPayerProof('unless_relayed', 'paymaster')).toBe(true);
    expect(needsPayerProof('unless_relayed', 'relay')).toBe(false);
    expect(needsPayerProof('confirmed', 'transfer')).toBe(false);
    expect(needsPayerProof('not_needed', 'transfer')).toBe(false);
    expect(needsPayerProof(undefined, 'transfer')).toBe(false);
  });
});

describe('isSmartWallet', () => {
  it('knows the wallets that sign with a passkey', () => {
    expect(isSmartWallet({ connectorType: 'evm:coinbase' } as never)).toBe(true);
    expect(isSmartWallet({ connectorType: 'evm:baseaccount' } as never)).toBe(true);
    expect(isSmartWallet({ connectorType: 'evm:metamask' } as never)).toBe(false);
    expect(isSmartWallet(null)).toBe(false);
  });
});

describe('payerProofErrorText', () => {
  it('keeps the buyer on the step with a retry after a refusal in the wallet', () => {
    expect(payerProofErrorText(null, 'declined', defaultLabels, values)).toBe(
      'You declined the signature in MetaMask. It is free and moves no money: sign it to pay from this wallet, or choose another wallet or method.',
    );
    expect(payerProofErrorText(refusal('payer_proof_declined'), null, defaultLabels, values)).toBe(
      payerProofErrorText(null, 'declined', defaultLabels, values),
    );
    expect(payerProofErrorText(null, 'unsupported', defaultLabels, values)).toBe(
      "MetaMask can't sign this confirmation. Choose another wallet or method.",
    );
    expect(payerProofErrorText(null, 'failed', defaultLabels, values)).toBe(
      'MetaMask did not sign the confirmation. Try again.',
    );
  });

  // "You declined the signature" for a network switch, and "did not sign" when it was the network that failed
  it('talks about the network when the wallet did not get to the signature', () => {
    expect(payerProofErrorText(null, 'switchDeclined', defaultLabels, values)).toContain('switch');
    for (const problem of ['switchFailed', 'wrongNetwork'] as const) {
      expect(payerProofErrorText(null, problem, defaultLabels, values)).toBe(
        defaultLabels.payerProof.wrongNetwork.replace('{wallet}', values.wallet).replace('{network}', values.network),
      );
    }
  });

  it('says that the request waits in the wallet, and that the account is not allowed', () => {
    expect(payerProofErrorText(null, 'alreadyPending', defaultLabels, values)).toContain('waits there');
    expect(payerProofErrorText(null, 'notAuthorized', defaultLabels, values)).toContain('has not allowed');
  });

  it("explains Quasar's refusals of the signature", () => {
    expect(payerProofErrorText(refusal('payer_proof_invalid', 'signature_invalid'), null, defaultLabels, values)).toBe(
      defaultLabels.payerProof.invalid,
    );
    expect(payerProofErrorText(refusal('payer_proof_unavailable', 'rpc_failed'), null, defaultLabels, values)).toBe(
      defaultLabels.payerProof.unavailable,
    );
    expect(payerProofErrorText(refusal('payer_chain_mismatch'), null, defaultLabels, values)).toBe(
      'Switch MetaMask to Base, then confirm again.',
    );
    expect(payerProofErrorText(refusal('too_many_payers'), null, defaultLabels, values)).toBe(
      'Too many wallets have confirmed this invoice. Pay from one of them, or ask Cosmos for a new invoice.',
    );
    expect(payerProofErrorText(refusal('rate_limited'), null, defaultLabels, values)).toBe(
      defaultLabels.method.rateLimited,
    );
    expect(payerProofErrorText(refusal('request_failed'), null, defaultLabels, values)).toBe(
      defaultLabels.pay.noAnswer,
    );
    expect(payerProofErrorText(refusal('origin_required'), null, defaultLabels, values)).toBe(
      defaultLabels.error.generic,
    );
  });

  it('says nothing about the reason the step shows, nor without an error', () => {
    expect(payerProofErrorText(refusal('payer_proof_required'), null, defaultLabels, values)).toBeNull();
    expect(payerProofErrorText(null, null, defaultLabels, values)).toBeNull();
  });
});

// A transfer held from another wallet, or a price refused to the last wallet, opened the step with "Something went wrong"
describe('isConfirmationError', () => {
  it('takes what is about the confirmation, and nothing else', () => {
    for (const code of ['payer_proof_declined', 'payer_chain_mismatch', 'rate_limited', 'request_failed']) {
      expect(isConfirmationError({ code, message: '' } as never)).toBe(true);
    }
    for (const code of ['payment_mismatch', 'price_unavailable', 'native_from_contract']) {
      expect(isConfirmationError({ code, message: '' } as never)).toBe(false);
    }
    expect(isConfirmationError(null)).toBe(false);
  });
});

describe('isPayerProofError', () => {
  it("knows the refusals of the wallet's confirmation, and nothing else", () => {
    for (const code of ['payer_proof_declined', 'payer_proof_invalid', 'payer_proof_unavailable']) {
      expect(isPayerProofError(refusal(code))).toBe(true);
    }
    expect(isPayerProofError(refusal('payer_chain_mismatch'))).toBe(true);
    expect(isPayerProofError(refusal('too_many_payers'))).toBe(true);
    for (const code of ['request_failed', 'price_unavailable', 'payment_mismatch', 'rate_limited']) {
      expect(isPayerProofError(refusal(code))).toBe(false);
    }
    expect(isPayerProofError(null)).toBe(false);
  });
});
