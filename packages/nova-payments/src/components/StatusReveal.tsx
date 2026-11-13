import { cn } from '@tuwaio/nova-core';
import { type ReactNode, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { shownLast } from './statusMemory';

/**
 * What a status screen adds under the head it took over from the screen before it: the receipt of a paid invoice, the
 * reason of a failed payment. It comes in over a moment (`novapay-status-reveal` of `styles/app.css`), after the head
 * has begun to change, so the result is read first. On a status screen that is the first one (a receipt opened from its
 * link), with `prefers-reduced-motion` or with the animations of the checkout off, it is just there.
 *
 * @param props - The content, and classes of its container.
 * @returns The content in its container.
 * @internal
 */
export function StatusReveal({ children, className }: { children: ReactNode; className?: string }) {
  const { store, customization } = useCheckoutContext();
  // Taken as the screen starts: whether a status screen of this checkout is on the page, or left a moment ago
  const [continues] = useState(() => shownLast(store, 'title') !== undefined);
  const moves = continues && !customization.config?.animation?.disabled;
  return <div className={cn('novapay:w-full', moves && 'novapay-status-reveal', className)}>{children}</div>;
}
