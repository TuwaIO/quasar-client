import type { CheckoutError } from '@tuwaio/quasar-sdk/checkout';

import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { leftTheWalletText, paymentFailedText } from './outcome';
import { isPayerProofError } from './payerProof';
import type { PaymentWalletErrorKind } from './walletErrors';

/**
 * The text of a refusal of the wallet or of Quasar, with the action that follows it.
 *
 * @param labels - The labels of the checkout language.
 * @param values - The wallet, the network and the seller the text names.
 * @param problem - What the wallet did, if it refused; it comes before the store's error.
 * @param error - The store's error, if any.
 * @returns The text, or `null` with nothing to say (a refusal of the confirmation has its text under it).
 * @internal
 */
export function problemText(
  labels: NovaPaymentsLabels,
  values: { wallet: string; network: string; merchant: string },
  problem: PaymentWalletErrorKind | null,
  error: CheckoutError | null | undefined,
): string | null {
  const errorCode = error?.code;
  if (problem === 'declined') return formatLabel(labels.pay.declined, values);
  if (problem === 'unsupported') return formatLabel(labels.pay.unsupported, values);
  if (problem === 'wrongNetwork') return formatLabel(labels.pay.wrongCluster, values);
  if (problem === 'switchFailed') return formatLabel(labels.pay.switchFailed, values);
  if (problem === 'notAuthorized') return formatLabel(labels.pay.notAuthorized, values);
  if (problem === 'alreadyPending') return formatLabel(labels.walletPrompt.stillWaiting, values);
  if (problem === 'sentUnconfirmed') return formatLabel(labels.pay.sentUnconfirmed, values);
  // The payment left the wallet, or may have (a transaction that does not pay the invoice or pays another one, closed
  // after 24 hours without a result, taken by another invoice, confirmed and not recorded yet): never "it failed" or
  // "only the fee"
  const leftTheWallet = problem ? null : leftTheWalletText(error, labels, values.merchant);
  if (leftTheWallet !== null) return leftTheWallet;
  // Only a transaction that reverted on the network spent a fee (`paymentFailedText`). A wallet that did not do what it
  // was asked sent nothing
  if (problem === 'failed') return formatLabel(labels.pay.walletFailed, values);
  if (error && errorCode === 'payment_failed') return paymentFailedText(error, labels, values.network);
  if (errorCode === 'screening_unavailable') return labels.pay.screeningUnavailable;
  if (errorCode === 'request_failed') return labels.pay.noAnswer;
  // A new price was refused: the feed or the network of the method cannot be read now, or the seller set up no RPC
  // for that network
  if (errorCode === 'price_unavailable' || errorCode === 'price_no_rpc') return labels.method.priceUnavailable;
  if (errorCode === 'rate_limited') return labels.method.rateLimited;
  if (errorCode === 'method_not_found' || errorCode === 'amount_out_of_range' || errorCode === 'testnet_required') {
    return labels.method.methodUnavailable;
  }
  // Refusals of the confirmation have their text under it. Anything else must not end as a press that does nothing
  return error && !isPayerProofError(error) ? labels.error.generic : null;
}
