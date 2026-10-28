/**
 * @file What the outcome steps show: how to reach the seller, when to ask before leaving, what a refusal means, the
 * terms of automatic payments, what an underpaid invoice still needs, and what arrived on an invoice.
 */

import type {
  AutoChargeOffer,
  CheckoutError,
  CheckoutMerchant,
  CheckoutMethod,
  CheckoutPhase,
  CheckoutQuote,
} from '@tuwaio/quasar-sdk/checkout';

import type { NovaPaymentsLabels } from '../i18n';

/**
 * Where "Contact <seller>" leads: an email to the seller's support address about the invoice, else the seller's site.
 *
 * @param merchant - The seller's support email and site.
 * @param merchant.supportEmail - The support email, if any.
 * @param merchant.website - The site (http(s) only), if any.
 * @param subject - The subject of the email, for example `Invoice INV-2026-42`.
 * @returns The link, or `null` when the seller gave neither.
 */
export function contactHref(
  merchant: Pick<CheckoutMerchant, 'supportEmail' | 'website'>,
  subject: string,
): string | null {
  if (merchant.supportEmail) return `mailto:${merchant.supportEmail}?subject=${encodeURIComponent(subject)}`;
  return merchant.website ?? null;
}

/** Phases in which nothing has been sent yet: leaving releases the price and loses no payment. */
const NOTHING_SENT: CheckoutPhase[] = ['buyer', 'selectMethod', 'quoting', 'awaitingPayment'];

/**
 * Whether closing the checkout asks first: only while nothing has been sent. Once a transaction is on its way, or the
 * invoice is settled, the checkout closes without a question.
 *
 * @param phase - Where the payment stands.
 * @returns `true` to ask.
 */
export function needsLeaveConfirm(phase: CheckoutPhase): boolean {
  return NOTHING_SENT.includes(phase);
}

/**
 * The text of a refusal on the method step, with what to do.
 *
 * @param error - The store's error.
 * @param labels - The labels of the checkout language.
 * @returns The text.
 */
export function methodErrorText(error: CheckoutError, labels: NovaPaymentsLabels): string {
  switch (error.code) {
    case 'screening_unavailable':
      return labels.pay.screeningUnavailable;
    case 'request_failed':
      return labels.pay.noAnswer;
    // `testnet_required`: a test invoice is paid on a test network only
    case 'amount_out_of_range':
    case 'method_not_found':
    case 'testnet_required':
      return labels.method.methodUnavailable;
    case 'payer_not_expected':
      return labels.method.payerNotExpected;
    case 'rate_limited':
      return labels.method.rateLimited;
    // `price_no_rpc`: the seller set up no RPC for a network the price is read on, so another method may work
    case 'price_unavailable':
    case 'price_no_rpc':
      return labels.method.priceUnavailable;
    case 'consent_required':
      return labels.method.consentRequired;
    default:
      return labels.error.generic;
  }
}

/** The terms of an automatic payments offer, as the checkout shows them. */
export interface AutoPayTerms {
  /** The CAIP-2 chain of the charges. */
  chainId: string;
  /**
   * The wallet the charges are paid to: the merchant's, as the `payee` rule of the request names it (the app's
   * collector, which sends the charges, when the request names no payee).
   */
  to: string;
  /** The most it takes in a period, in base units of the token. */
  limit: string;
  /** Decimals of the token. */
  decimals: number;
  /** Symbol of the token. */
  symbol: string;
  /** The length of a period, in seconds. */
  periodSeconds: number;
  /** When the permission ends, in milliseconds; `null` without an expiry rule. */
  expiresAt: number | null;
}

/**
 * The terms of an ERC-7715 automatic payments offer: the periodic limit in the token of the method, the period, the
 * expiry and the merchant's wallet the charges are paid to.
 *
 * @param offer - The view's `autoCharge`.
 * @param methods - The view's methods (for the token of the offer).
 * @returns The terms, or `null` when the offer is not available or its method is unknown.
 */
export function autoPayTerms(offer: AutoChargeOffer | null, methods: CheckoutMethod[]): AutoPayTerms | null {
  if (offer?.status !== 'available') return null;
  const method = methods.find((item) => item.id === offer.methodId);
  if (!method) return null;
  const { request } = offer;
  const expiry = request.rules.find((rule) => rule.type === 'expiry')?.data as { timestamp?: number } | undefined;
  // The permission pays only the merchant's wallet; `request.to` is the collector that sends each charge
  const payee = request.rules.find((rule) => rule.type === 'payee')?.data as { addresses?: string[] } | undefined;
  return {
    chainId: `eip155:${Number.parseInt(request.chainId, 16)}`,
    to: payee?.addresses?.[0] ?? request.to,
    limit: BigInt(request.permission.data.periodAmount).toString(),
    decimals: method.decimals,
    symbol: method.symbol,
    periodSeconds: request.permission.data.periodDuration,
    expiresAt: expiry?.timestamp ? expiry.timestamp * 1000 : null,
  };
}

/**
 * A period as words of the language: whole days in days, otherwise in hours.
 *
 * @param seconds - The period.
 * @param locale - BCP 47 language of the page.
 * @returns For example `30 days`, `2 hours`, `30 днів`.
 */
export function formatPeriod(seconds: number, locale: string): string {
  const days = seconds % 86_400 === 0;
  return new Intl.NumberFormat(locale, { style: 'unit', unit: days ? 'day' : 'hour', unitDisplay: 'long' }).format(
    days ? seconds / 86_400 : Math.round(seconds / 3600),
  );
}

/**
 * What an underpaid invoice still needs, in base units of the locked token.
 *
 * @param quote - The locked quote the payment was for.
 * @param amountPaid - What arrived, in base units of that token.
 * @returns The rest, or `null` when it is unknown or nothing is left.
 */
export function underpaidRest(
  quote: Pick<CheckoutQuote, 'cryptoAmountExpected'> | null,
  amountPaid: string | null,
): string | null {
  if (!quote || amountPaid === null) return null;
  const rest = BigInt(quote.cryptoAmountExpected) - BigInt(amountPaid);
  return rest > 0n ? rest.toString() : null;
}

/**
 * What arrived on an invoice, when anything did: an expired invoice says so instead of "nothing was charged".
 *
 * @param amountPaid - What arrived, in base units of the locked token (`amountPaid` of the invoice).
 * @returns The amount, or `null` when nothing arrived.
 */
export function receivedAmount(amountPaid: string | null): string | null {
  return amountPaid && /^\d+$/.test(amountPaid) && BigInt(amountPaid) > 0n ? amountPaid : null;
}
