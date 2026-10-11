/**
 * @file The payment of a locked price: how the wallet pays it, what the buyer sends and the merchant receives, the
 * market rate behind it, and what a wallet lacks to pay it.
 */

import type { CheckoutQuote, PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';

/**
 * How the wallet pays a quote: `relay` signs an EIP-3009 authorization that Quasar sends (the merchant pays the gas),
 * `paymaster` sends the quoted calls with the checkout's ERC-7677 paymaster (a smart wallet; the merchant pays the
 * gas), `transfer` sends the transfer and pays the gas.
 */
export type PayPath = 'relay' | 'paymaster' | 'transfer';

/**
 * How the wallet pays a quote. A smart wallet that takes a paymaster sends sponsored calls; any other wallet signs the
 * authorization; the buyer may choose to pay the gas instead.
 *
 * @param quote - The locked quote.
 * @param options - What the buyer and the wallet allow.
 * @param options.withGas - The buyer chose "Pay with gas instead".
 * @param options.canSponsorCalls - The wallet sends `wallet_sendCalls` with the `paymasterService` capability.
 * @returns The path.
 */
export function payPath(quote: CheckoutQuote, options: { withGas: boolean; canSponsorCalls: boolean }): PayPath {
  if (options.withGas || !quote.gasless) return 'transfer';
  if (quote.gasless.paymaster && options.canSponsorCalls) return 'paymaster';
  if (quote.gasless.relay) return 'relay';
  return 'transfer';
}

/** What a quote moves, in base units of its token. */
export interface QuoteAmounts {
  /** What the buyer sends. */
  send: string;
  /** What the merchant receives. */
  receives: string;
  /** The token's transfer fee on top, with its percent; `null` when the token keeps none. */
  fee: { amount: string; percent: string } | null;
}

/**
 * What the buyer sends and the merchant receives: the same amount, unless the token keeps a fee on every transfer.
 *
 * @param quote - The locked quote.
 * @returns The amounts.
 */
export function quoteAmounts(quote: CheckoutQuote): QuoteAmounts {
  const send = BigInt(quote.amountToSend);
  const receives = BigInt(quote.cryptoAmountExpected);
  if (!quote.transferFee || send <= receives) {
    return { send: quote.amountToSend, receives: quote.cryptoAmountExpected, fee: null };
  }
  return {
    send: quote.amountToSend,
    receives: quote.cryptoAmountExpected,
    fee: { amount: String(send - receives), percent: String(quote.transferFee.bps / 100) },
  };
}

const BPS = 10_000n;
const RATE_DIGITS = 8n;

/**
 * The market price of one token in the invoice currency behind a quote. Quasar asks for
 * `total × (1 + markup) × (1 − discount) / price` tokens, so the price is recovered without the method's markup or
 * discount, which the checkout shows apart. For display only: amounts are never derived from it.
 *
 * @param quote - The locked quote.
 * @param totalMinor - The invoice total in minor units (cents) the quote pays.
 * @returns The price, or `null` without a total or a token amount.
 */
export function quoteRate(quote: CheckoutQuote, totalMinor: string | null): number | null {
  const crypto = BigInt(quote.cryptoAmountExpected);
  if (!totalMinor || crypto <= 0n) return null;
  const numerator =
    BigInt(totalMinor) *
    (BPS + BigInt(quote.markupBps)) *
    (BPS - BigInt(quote.discountBps)) *
    10n ** BigInt(quote.decimals) *
    10n ** RATE_DIGITS;
  const scaled = numerator / (100n * BPS * BPS * crypto);
  return Number(scaled) / 10 ** Number(RATE_DIGITS);
}

/** What a wallet lacks for a payment, in base units. */
export interface BalanceShortfall {
  /** What the wallet has. */
  have: string;
  /** What the payment needs. */
  need: string;
  /** The difference. */
  short: string;
}

/**
 * What a wallet lacks to pay a quote.
 *
 * @param balance - The wallet's balance of the quoted token, in base units.
 * @param quote - The locked quote.
 * @param fee - The network fee, when it is paid in the quoted token (the native coin); counted in what is needed.
 * @returns The shortfall, or `null` when the balance is enough.
 */
export function balanceShortfall(balance: bigint, quote: CheckoutQuote, fee = 0n): BalanceShortfall | null {
  const need = BigInt(quote.amountToSend) + fee;
  if (balance >= need) return null;
  return { have: String(balance), need: String(need), short: String(need - balance) };
}

/**
 * The CAIP-2 chain a quote is paid on.
 *
 * @param instructions - What the wallet sends.
 * @returns For example `eip155:8453` or `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`.
 */
export function instructionsChainId(instructions: PaymentInstructions): string {
  return instructions.family === 'eip155' ? `eip155:${instructions.chainId}` : instructions.chainId;
}
