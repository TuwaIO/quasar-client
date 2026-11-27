import type { CheckoutError } from '@tuwaio/quasar-sdk/checkout';

import type { OutOfGas } from '../adapters/types';
import { instructionsChainId } from '../utils/pay';
import { useAsyncValue } from './useAsyncValue';
import { useCheckoutContext } from './useCheckoutContext';

/**
 * Whether a payment Quasar ended as reverted ran out of gas, so that the checkout says what gas limit to set in the
 * wallet before paying again: some wallets set a limit of their own, below what a recipient with an EIP-7702
 * delegation takes on receipt, whatever the page asks for. Asked of the chain adapter of the locked price
 * (`outOfGas`), once per transaction.
 *
 * Side effects: the adapter's reads from the network (the transaction, its receipt and a gas estimate), once per
 * transaction.
 *
 * @param error - The store's error: only `payment_failed` with the reason `reverted` is read.
 * @param txKey - The transaction that reverted.
 * @returns What the adapter told, or `null`: another error, no transaction or locked price, an adapter that cannot
 *   tell, a transaction that did not run out of gas, a read under way or one that failed.
 * @internal
 */
export function useOutOfGas(error: CheckoutError | null | undefined, txKey: string | null): OutOfGas | null {
  const { state, checkout, adapterFor } = useCheckoutContext();
  const reverted = error?.code === 'payment_failed' && (error as { reason?: string }).reason === 'reverted';
  const locked = state.quote ?? checkout?.quote ?? null;
  const adapter = locked ? adapterFor(locked.instructions.family) : undefined;
  const found = useAsyncValue(
    reverted && txKey && locked && adapter?.outOfGas ? `${instructionsChainId(locked.instructions)}:${txKey}` : null,
    () => adapter!.outOfGas!({ instructions: locked!.instructions, txKey: txKey! }),
  );
  return found ?? null;
}
