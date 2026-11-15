/**
 * @file The payee of the quote the checkout shows: where the store's check of it stands, and the check of its payout
 * record's signature by the chain adapters. The checkout shows a quote's address and asks the wallet to pay only once
 * the store verified this very quote (`payee` of `createCheckoutStore` from `@tuwaio/quasar-sdk/checkout`).
 */

import type { CheckoutQuote, PayeeCheck, PayeeRefusal, PayeeVerifier } from '@tuwaio/quasar-sdk/checkout';

import type { PaymentsAdapter } from '../adapters/types';
import { familyOf } from './methods';

/**
 * Where the check of the shown quote's payee stands: `checking` until the store checked this very quote (also while
 * it still holds the check of an earlier quote), then `verified` or `refused`.
 */
export type PayeeStatus = { status: 'checking' } | { status: 'verified' } | { status: 'refused'; reason: PayeeRefusal };

/**
 * Where the check of the quote's payee stands, from the checkout store's state.
 *
 * @param state - `quote` and `payeeCheck` of the checkout store.
 * @returns The status for this very quote: a check of another quote counts as `checking`.
 */
export function payeeStatus(state: { quote?: CheckoutQuote | null; payeeCheck?: PayeeCheck | null }): PayeeStatus {
  const check = state.payeeCheck;
  if (!state.quote || !check || check.quote !== state.quote || check.status === 'checking') {
    return { status: 'checking' };
  }
  return check.status === 'verified' ? { status: 'verified' } : { status: 'refused', reason: check.reason };
}

/**
 * Whether the store verified the payee of this very quote: the only state in which the checkout sends a payment.
 *
 * @param state - `quote` and `payeeCheck` of the checkout store.
 * @param quote - The quote about to be paid.
 * @returns `true` once the store's check of this quote found its payee verified.
 */
export function payeeVerified(state: { payeeCheck?: PayeeCheck | null }, quote: CheckoutQuote): boolean {
  return state.payeeCheck?.quote === quote && state.payeeCheck.status === 'verified';
}

/**
 * Checks the signature of a quote's payout record with the adapter of its chain family (`verifyPayoutRecord`): the
 * {@link PayeeVerifier} of a checkout over its adapters.
 *
 * Side effects: on EVM, a smart wallet's signature is put to its contract through the app's RPC.
 *
 * @param adapters - The checkout's payment adapters.
 * @param params - The record, its signature and the network (CAIP-2) of the quote.
 * @returns Whether the signature holds, or `null` when no adapter of the family checks signatures.
 */
export function verifyPayeeWith(
  adapters: readonly PaymentsAdapter[] | undefined,
  params: Parameters<PayeeVerifier>[0],
): Promise<boolean | null> {
  const family = familyOf(params.chainId);
  const verify = family ? adapters?.find((adapter) => adapter.family === family)?.verifyPayoutRecord : undefined;
  return verify ? verify(params) : Promise.resolve(null);
}
