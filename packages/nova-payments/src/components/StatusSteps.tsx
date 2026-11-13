import { cn } from '@tuwaio/nova-core';
import { TxProgressIndicator } from '@tuwaio/nova-transactions';
import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { shownLast, useContinued } from './statusMemory';

/** How far the payment is: on its way, paid, or failed. */
export type StatusStepsState = 'processing' | 'succeed' | 'failed';

const STEPS_PART = 'steps';

/**
 * The steps of a payment (Sent, Confirming, Paid) from Nova Transactions, on every status screen that shows them. Each
 * screen is a component of its own, so its steps would draw themselves from the start: these go on from the steps of the
 * status screen before, standing as that screen left them, and only what changes moves: the line runs on to "Paid" and
 * the marks are set one after another.
 *
 * @param props - The state of the payment.
 * @returns The steps.
 * @internal
 */
export function StatusSteps({ state }: { state: StatusStepsState }) {
  const { store, customization } = useCheckoutContext();
  const child = customization.childCustomizations;
  // Before `useContinued` takes the steps over: whether a status screen showed them a moment ago
  const [continues] = useState(() => shownLast(store, STEPS_PART) !== undefined);
  const shown = useContinued<StatusStepsState>(STEPS_PART, state);
  const steps = (
    <TxProgressIndicator
      isProcessing={shown === 'processing'}
      isSucceed={shown === 'succeed'}
      // The step before the last reads "Confirmed" once the payment is in
      isConfirmed={shown === 'succeed'}
      isFailed={shown === 'failed'}
      {...child?.progressIndicator}
      className={cn('novapay:max-w-sm', child?.progressIndicator?.className)}
    />
  );
  // Steps that go on are on the screen already: they are shown as they stood, not drawn again
  return continues ? <AnimatePresence initial={false}>{steps}</AnimatePresence> : steps;
}
