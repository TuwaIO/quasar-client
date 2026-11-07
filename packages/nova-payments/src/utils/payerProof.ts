/**
 * @file The paying wallet's confirmation of the invoice: before an EVM payment the buyer's
 * wallet sends itself, it signs Quasar's message for free, so that Quasar credits its transfers to this invoice only.
 * When the checkout asks for it, what it says about a refusal, and which wallets sign with a passkey.
 */

import type { CheckoutError, CheckoutQuote, CheckoutState } from '@tuwaio/quasar-sdk/checkout';

import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import type { CheckoutWallet } from './methods';
import type { PayPath } from './pay';
import type { PaymentWalletErrorKind } from './walletErrors';

/** Why the wallet did not confirm: its kind of failure, or a network switch the buyer refused. */
export type ConfirmProblem = PaymentWalletErrorKind | 'switchDeclined';

/**
 * Connector types of wallets that are smart accounts signing with a passkey (Coinbase Smart Wallet and Base Account
 * connect as `evm:coinbase`): the checkout says that the wallet may ask for the passkey.
 */
const PASSKEY_WALLETS: ReadonlySet<string> = new Set(['evm:coinbase', 'evm:baseaccount', 'evm:porto']);

/**
 * Whether the wallet is a smart account that signs with a passkey (or a fingerprint), by its connector type.
 *
 * @param wallet - The connected wallet.
 * @returns `true` for Coinbase Smart Wallet, Base Account and Porto.
 */
export function isSmartWallet(wallet: Pick<CheckoutWallet, 'connectorType'> | null | undefined): boolean {
  return Boolean(wallet && PASSKEY_WALLETS.has(wallet.connectorType.toLowerCase()));
}

/**
 * Whether the wallet confirms the invoice before it pays from the pay step: while the checkout store says it must
 * (`required`, `confirming`), and for a method the gasless relay could pay (`unless_relayed`) when the wallet sends the
 * transfer or the paymaster's calls itself; the relay's signed authorization confirms the wallet on its own.
 *
 * @param payerProof - `payerProof` of the checkout store (left out by older stores).
 * @param path - How the wallet pays the quote.
 * @returns `true` to ask for the confirmation first.
 */
export function needsPayerProof(payerProof: string | undefined, path: PayPath): boolean {
  if (payerProof === 'required' || payerProof === 'confirming') return true;
  return payerProof === 'unless_relayed' && path !== 'relay';
}

/** The part of the checkout store {@link lockPrice} reads. */
export interface LockPriceStore {
  /** The store's state and actions. */
  getState: () => Pick<CheckoutState, 'requestQuote' | 'error'> & { readonly payerProof?: string };
}

/**
 * Locks the price for the wallet the buyer continued with, or turns to the step that confirms the wallet first: while
 * the checkout store says the wallet must confirm the invoice (`payerProof` `required`), no price is asked; when Quasar
 * refuses the price with `payer_proof_required` (a wallet it wants confirmed, which the checkout did not announce), the
 * step shows too.
 *
 * Side effects: `POST quote` through the checkout store.
 *
 * @param store - The checkout store.
 * @param showConfirmWallet - Shows (`true`) or leaves (`false`) the step that confirms the wallet.
 * @returns The quote, or `null` when none was locked.
 */
export async function lockPrice(
  store: LockPriceStore,
  showConfirmWallet: (show: boolean) => void,
): Promise<CheckoutQuote | null> {
  const { payerProof } = store.getState();
  if (payerProof === 'required' || payerProof === 'confirming') {
    showConfirmWallet(true);
    return null;
  }
  showConfirmWallet(false);
  const quote = await store.getState().requestQuote();
  if (!quote && store.getState().error?.code === 'payer_proof_required') showConfirmWallet(true);
  return quote;
}

/** Codes of Quasar's and the store's refusals of the wallet's confirmation, besides `payer_proof_*`. */
const PAYER_PROOF_CODES: ReadonlySet<string> = new Set(['payer_chain_mismatch', 'too_many_payers']);

/**
 * Whether the error is a refusal of the wallet's confirmation (`payer_proof_*`, `payer_chain_mismatch`,
 * `too_many_payers`): the pay step shows only these under the confirmation, its other errors have texts of their own.
 *
 * @param error - The checkout store's error, if any.
 * @returns `true` for a refusal of the confirmation.
 */
export function isPayerProofError(error: CheckoutError | null | undefined): boolean {
  // Error codes newer than some `@tuwaio/quasar-sdk` alphas: compare them as strings
  const code: string | undefined = error?.code;
  return code !== undefined && (code.startsWith('payer_proof_') || PAYER_PROOF_CODES.has(code));
}

/** Errors of the confirmation that are not refusals of it: its own requests were refused or got no answer. */
const CONFIRMATION_REQUEST_CODES: ReadonlySet<string> = new Set([
  'rate_limited',
  'request_failed',
  'origin_required',
  'invoice_not_payable',
]);

/**
 * Whether an error belongs on the step that confirms the wallet. The store's error may be about something else: a
 * transfer held from another wallet, or a price refused to the last wallet, opened the step with "Something went wrong"
 * before the wallet was asked anything.
 *
 * @param error - The checkout store's error, if any.
 * @returns `true` for a refusal of the confirmation or a failure of its requests.
 */
export function isConfirmationError(error: CheckoutError | null | undefined): boolean {
  const code: string | undefined = error?.code;
  return isPayerProofError(error) || (code !== undefined && CONFIRMATION_REQUEST_CODES.has(code));
}

/**
 * What the step that confirms the wallet says about a refusal, with what to do: the wallet's (the buyer declined, the
 * wallet cannot sign messages, it failed) or Quasar's (`payer_proof_invalid`, `payer_proof_unavailable`,
 * `payer_chain_mismatch`, `too_many_payers`, `rate_limited`…). The buyer stays on the step and can try again.
 *
 * @param error - The checkout store's error, if any.
 * @param problem - Why the wallet did not sign, when the checkout knows it.
 * @param labels - The labels of the checkout language.
 * @param values - The wallet's name, the method's network and the seller's name.
 * @param values.wallet - The wallet's name.
 * @param values.network - The network of the method.
 * @param values.merchant - The seller's name.
 * @returns The text, or `null` with nothing to say (no error, or `payer_proof_required`, the reason the step shows).
 */
export function payerProofErrorText(
  error: CheckoutError | null | undefined,
  problem: ConfirmProblem | null,
  labels: NovaPaymentsLabels,
  values: { wallet: string; network: string; merchant: string },
): string | null {
  if (problem === 'declined') return formatLabel(labels.payerProof.declined, values);
  if (problem === 'switchDeclined') return formatLabel(labels.payerProof.switchDeclined, values);
  if (problem === 'unsupported') return formatLabel(labels.payerProof.unsupported, values);
  // The network, not the signature: it was never asked for
  if (problem === 'wrongNetwork' || problem === 'switchFailed')
    return formatLabel(labels.payerProof.wrongNetwork, values);
  if (problem === 'notAuthorized') return formatLabel(labels.pay.notAuthorized, values);
  if (problem === 'alreadyPending') return formatLabel(labels.walletPrompt.stillWaiting, values);
  if (problem) return formatLabel(labels.payerProof.failed, values);
  // Error codes newer than some `@tuwaio/quasar-sdk` alphas: compare them as strings
  const code: string | undefined = error?.code;
  switch (code) {
    case undefined:
    case 'payer_proof_required':
      return null;
    case 'payer_proof_declined':
      return formatLabel(labels.payerProof.declined, values);
    case 'payer_proof_invalid':
      return labels.payerProof.invalid;
    case 'payer_proof_unavailable':
      return labels.payerProof.unavailable;
    case 'payer_chain_mismatch':
      return formatLabel(labels.payerProof.wrongNetwork, values);
    case 'too_many_payers':
      return formatLabel(labels.payerProof.tooManyWallets, values);
    case 'rate_limited':
      return labels.method.rateLimited;
    case 'request_failed':
      return labels.pay.noAnswer;
    default:
      return labels.error.generic;
  }
}
