/**
 * @file What the outcome steps show: how to reach the seller, when to ask before leaving, what a refusal means, the
 * terms of automatic payments, what an underpaid invoice still needs, and what arrived on an invoice.
 */

import { parseCaip10AccountId } from '@tuwaio/orbit-core';
import type { RefundPreview } from '@tuwaio/quasar-sdk';
import type {
  AutoChargeOffer,
  CheckoutError,
  CheckoutMerchant,
  CheckoutMethod,
  CheckoutPhase,
  CheckoutQuote,
} from '@tuwaio/quasar-sdk/checkout';

import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { isMovedMoneyFailure, isPaidElsewhere, type UnconfirmedFollowUp, unconfirmedFollowUp } from './checkout';

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

/**
 * The notes of the follow-ups after which a payment left the wallet, or may have, that the steps before a payment say
 * instead of their own texts.
 */
const LEFT_THE_WALLET: Partial<
  Record<
    UnconfirmedFollowUp,
    'unconfirmedClosed' | 'unconfirmedTakenElsewhere' | 'unconfirmedSettlementRetrying' | 'unconfirmedSettlementFailed'
  >
> = {
  closed: 'unconfirmedClosed',
  takenElsewhere: 'unconfirmedTakenElsewhere',
  settlementRetrying: 'unconfirmedSettlementRetrying',
  settlementFailed: 'unconfirmedSettlementFailed',
};

/**
 * Rejection reasons of a transfer Quasar ties to no invoice: it came from a wallet that did not confirm the invoice.
 * With `held` Quasar recorded it as a held transfer, which the seller returns, and the invoice stays payable; without
 * it the text promises no refund.
 */
const FROM_ANOTHER_WALLET: ReadonlySet<string> = new Set(['payer_mismatch', 'payer_unconfirmed']);

/**
 * What the checkout says about a payment that left the wallet, or may have, from the store's error: a transaction that
 * does not pay the invoice (`pay.mismatch`; `pay.mismatchTakenElsewhere` when Quasar credited it to another invoice;
 * `pay.mismatchHeldElsewhere` when another invoice holds it for a refund only, `held`;
 * `pay.mismatchOtherWallet` for a transfer from a wallet that did not confirm the invoice, `pay.mismatchOtherWalletHeld`
 * when Quasar recorded it as a held transfer the seller returns, `held`), a payment Quasar closed after 24 hours without a result on chain
 * (`outcome.unconfirmedClosed`), a transaction another invoice handed over first (`outcome.unconfirmedTakenElsewhere`)
 * and a payment the network confirmed that Quasar has not recorded yet (`outcome.unconfirmedSettlementRetrying` while
 * Quasar settles it again daily, for 30 days, else `outcome.unconfirmedSettlementFailed`). Never "it failed", "only the
 * network fee was spent" or "nothing was charged" for them.
 *
 * @param error - The store's error, if any.
 * @param labels - The labels of the checkout language.
 * @param merchant - The seller's name.
 * @returns The text, or `null` for any other error, or none.
 */
export function leftTheWalletText(
  error: CheckoutError | null | undefined,
  labels: NovaPaymentsLabels,
  merchant = '',
): string | null {
  if (isMovedMoneyFailure(error)) {
    const reason = (error as { reason?: string }).reason ?? '';
    // `held`: Quasar recorded the transfer as a held transfer, here or at another invoice; it pays neither
    const held = (error as { held?: boolean }).held === true;
    const text = FROM_ANOTHER_WALLET.has(reason)
      ? held
        ? labels.pay.mismatchOtherWalletHeld
        : labels.pay.mismatchOtherWallet
      : held
        ? labels.pay.mismatchHeldElsewhere
        : isPaidElsewhere(error)
          ? labels.pay.mismatchTakenElsewhere
          : labels.pay.mismatch;
    return formatLabel(text, { merchant });
  }
  const followUp = unconfirmedFollowUp(error);
  const note = followUp ? LEFT_THE_WALLET[followUp] : undefined;
  return note ? formatLabel(labels.outcome[note], { merchant }) : null;
}

/** Phases in which nothing has been sent yet: leaving releases the price and loses no payment. */
const NOTHING_SENT: CheckoutPhase[] = ['buyer', 'selectMethod', 'quoting', 'awaitingPayment'];

/**
 * Whether closing the checkout asks first: only while nothing has been sent. Once a transaction is on its way, or the
 * invoice is settled, the checkout closes without a question; also after a payment that left the wallet, or may have
 * ({@link leftTheWalletText}: a transaction that does not pay the invoice, a payment Quasar closed without a result on
 * chain within 24 hours, a transaction another invoice handed over first, a confirmed payment Quasar has not recorded
 * yet), so the question's "Nothing is sent yet" would not be true. Nor is it on the rest of an underpaid invoice, whose
 * price stays as it is.
 *
 * @param phase - Where the payment stands.
 * @param error - The store's last error, if any.
 * @param status - The state of the invoice, when known.
 * @returns `true` to ask.
 */
export function needsLeaveConfirm(phase: CheckoutPhase, error?: CheckoutError | null, status?: string | null): boolean {
  if (status === 'underpaid') return false;
  const followUp = unconfirmedFollowUp(error);
  return NOTHING_SENT.includes(phase) && !isMovedMoneyFailure(error) && !(followUp && LEFT_THE_WALLET[followUp]);
}

/**
 * The text of a refusal on the method step, with what to do.
 *
 * @param error - The store's error.
 * @param labels - The labels of the checkout language.
 * @param merchant - The seller's name, for a payment that left the wallet, or may have ({@link leftTheWalletText}).
 * @returns The text.
 */
export function methodErrorText(error: CheckoutError, labels: NovaPaymentsLabels, merchant = ''): string {
  // It may have moved money: never "something went wrong", say what happens to it and whom to contact
  const leftTheWallet = leftTheWalletText(error, labels, merchant);
  if (leftTheWallet !== null) return leftTheWallet;
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
    // Quasar wants the wallet confirmed before the price: the step that confirms it says so
    case 'payer_proof_required':
      return labels.payerProof.text;
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
 * What the buyer is told about the rate of the rest of an underpaid invoice, in an asset that moves against the invoice
 * currency (`rateHeldUntil` of the quote): until when a payment settles by itself, or that the seller now decides.
 *
 * @param quote - The locked quote.
 * @param now - The time now, in milliseconds.
 * @param labels - The labels of the checkout language.
 * @param merchant - The seller's name.
 * @param locale - The language of the checkout.
 * @param ended - What is said past that time; the payment step's `pay.restRateEnded` speaks of the payment being made.
 * @returns The text, or `null` when the rate holds until the due date.
 */
export function restRateText(
  quote: Pick<CheckoutQuote, 'rateHeldUntil'> | null,
  now: number,
  labels: NovaPaymentsLabels,
  merchant: string,
  locale: string,
  ended: string = labels.pay.restRateEnded,
): string | null {
  const heldUntil = quote?.rateHeldUntil ? Date.parse(quote.rateHeldUntil) : null;
  if (heldUntil === null) return null;
  if (heldUntil <= now) return formatLabel(ended, { merchant });
  const time = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(heldUntil);
  return formatLabel(labels.pay.restRateUntil, { time, merchant });
}

/**
 * The address of a wallet Quasar names: it keeps the wallet that paid first as an address or as a CAIP-10 account.
 *
 * @param wallet - The wallet, in either form.
 * @returns The address.
 */
export function addressOfWallet(wallet: string): string {
  return parseCaip10AccountId(wallet)?.address ?? wallet;
}

/**
 * Whether two wallets Quasar names are one: an EVM address in any letter case, any other exactly.
 *
 * @param a - A wallet, as an address or an account.
 * @param b - Another one.
 * @returns `true` for the same wallet.
 */
export function isSameWallet(a: string, b: string): boolean {
  const left = addressOfWallet(a);
  const right = addressOfWallet(b);
  return left.startsWith('0x') ? left.toLowerCase() === right.toLowerCase() : left === right;
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

/**
 * Whether a refund sends a noticeably different number of tokens than its amount took at the rate of the payment: half a
 * percent or more, so a stablecoin at par never asks.
 *
 * @param preview - What the refund would send.
 * @returns Whether the merchant should look first.
 */
export function refundRateMoved(preview: Pick<RefundPreview, 'cryptoAmount' | 'atPaymentRate'>): boolean {
  if (!preview.atPaymentRate) return false;
  const now = BigInt(preview.cryptoAmount);
  const then = BigInt(preview.atPaymentRate);
  if (then === 0n) return false;
  return (now > then ? now - then : then - now) * 200n >= then;
}
