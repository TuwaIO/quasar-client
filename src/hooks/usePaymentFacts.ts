import { parseCaip10AccountId } from '@tuwaio/orbit-core';

import { formatTokenAmount, shortAddress } from '../utils/format';
import { networkName } from '../utils/methods';
import { instructionsChainId } from '../utils/pay';
import { useCheckoutContext } from './useCheckoutContext';

/**
 * What the confirm and paid steps show of the payment: its network and amount (from the locked quote), the
 * transaction (Quasar's hash, else the submitted key) with its explorer link from the chain adapter, and the sender.
 *
 * @returns The facts; each is `null` (or `undefined` for the link) when unknown.
 */
export function usePaymentFacts() {
  const { state, locale, adapterFor } = useCheckoutContext();
  const quote = state.quote;
  const chainId = quote ? instructionsChainId(quote.instructions) : null;
  const txKey = state.txHash ?? state.txKey;
  const sender = quote?.payer ? parseCaip10AccountId(quote.payer)?.address : undefined;
  return {
    network: chainId ? networkName(chainId) : null,
    amount: quote
      ? `${formatTokenAmount(quote.amountToSend, quote.decimals, locale)} ${quote.instructions.symbol}`
      : null,
    txKey,
    explorerUrl:
      quote && chainId && txKey ? adapterFor(quote.instructions.family)?.explorerUrl?.({ chainId, txKey }) : undefined,
    from: sender ? shortAddress(sender) : null,
  };
}
