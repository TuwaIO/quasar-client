import { parseCaip10AccountId } from '@tuwaio/orbit-core';

import { formatTokenAmount, shortAddress } from '../utils/format';
import { familyOf, networkName } from '../utils/methods';
import { instructionsChainId } from '../utils/pay';
import { useCheckoutContext } from './useCheckoutContext';

const SETTLED_STATUSES: ReadonlySet<string> = new Set(['paid', 'held', 'refunded', 'partially_refunded']);

/** A transfer credited to the invoice, as the paid step lists it. */
export interface PaymentTransfer {
  /** The transaction: its hash, or its Solana signature. */
  txKey: string;
  /** What it credited with its token (`40.00 USDC`); `null` when Quasar names no token for it. */
  amount: string | null;
  /** When the network included it, in milliseconds. */
  at: number;
  /** Its page in the explorer of its network, from the chain adapter; `undefined` without one. */
  explorerUrl: string | undefined;
}

/**
 * What the confirm and paid steps show of the payment: its network and amount (from the locked quote), the
 * transaction (Quasar's hash, else the submitted key) with its explorer link from the chain adapter, the sender, and
 * every transfer Quasar credited to the invoice (`transfers`, oldest first; empty with a Quasar that does not list
 * them).
 *
 * @returns The facts; each is `null` (or `undefined` for the link) when unknown.
 */
export function usePaymentFacts() {
  const { state, locale, adapterFor } = useCheckoutContext();
  // A settled invoice was paid at its own price, which another tab or device may have locked: this tab's price is not the
  // payment that happened
  const settled = state.invoiceStatus && SETTLED_STATUSES.has(state.invoiceStatus);
  const quote = (settled ? state.checkout?.quote : null) ?? state.quote;
  const chainId = quote ? instructionsChainId(quote.instructions) : null;
  const txKey = state.txHash ?? state.txKey;
  const sender = quote?.payer ? parseCaip10AccountId(quote.payer)?.address : undefined;
  const transfers: PaymentTransfer[] = (state.checkout?.invoice.payments ?? []).map((payment) => {
    const family = payment.chainId ? familyOf(payment.chainId) : null;
    return {
      txKey: payment.txKey,
      amount:
        payment.symbol && payment.decimals !== null
          ? `${formatTokenAmount(payment.amount, payment.decimals, locale)} ${payment.symbol}`
          : null,
      at: Date.parse(payment.at),
      explorerUrl:
        family && payment.chainId
          ? adapterFor(family)?.explorerUrl?.({ chainId: payment.chainId, txKey: payment.txKey })
          : undefined,
    };
  });
  return {
    network: chainId ? networkName(chainId) : null,
    amount: quote
      ? `${formatTokenAmount(quote.amountToSend, quote.decimals, locale)} ${quote.instructions.symbol}`
      : null,
    // What the whole invoice came to, when this payment was its rest: `amount` is only the last transfer
    paidAmount: quote
      ? `${formatTokenAmount(quote.amountDue === quote.cryptoAmountExpected ? quote.amountToSend : quote.cryptoAmountExpected, quote.decimals, locale)} ${quote.instructions.symbol}`
      : null,
    txKey,
    // The invoice was paid in parts and this is the last one: `transfers` has them all, when Quasar lists them
    lastOfParts: quote ? quote.amountDue !== quote.cryptoAmountExpected : false,
    transfers,
    explorerUrl:
      quote && chainId && txKey ? adapterFor(quote.instructions.family)?.explorerUrl?.({ chainId, txKey }) : undefined,
    from: sender ? shortAddress(sender) : null,
    fromAddress: sender ?? null,
    fromUrl:
      quote && chainId && sender
        ? adapterFor(quote.instructions.family)?.explorerAddressUrl?.({ chainId, address: sender })
        : undefined,
  };
}
