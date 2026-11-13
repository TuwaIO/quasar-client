import { cn, MorphText } from '@tuwaio/nova-core';

import { screenHeading, screenTitle } from './classes';
import { useContinued } from './statusMemory';

/**
 * The heading of a status screen. Each screen of the checkout is a component of its own, so a title would start over with
 * every screen: this one starts from the title the screen before it showed, and morphs into its own, so that "Confirming" goes
 * on into "Paid" as the status of a transaction does in Nova Transactions. A title after a pause (the buyer went back to pay
 * again) starts as it is. `aria-label` keeps the real name for a screen reader, which gets the focus on this heading while the
 * old title may still show.
 *
 * @param props - The title, and classes added to the heading.
 * @returns The heading.
 * @internal
 */
export function StatusTitle({ children: title, className }: { children: string; className?: string }) {
  const shown = useContinued('title', title);
  return (
    <h2 {...screenHeading} aria-label={title} className={cn(screenTitle, className)}>
      <MorphText wrap>{shown}</MorphText>
    </h2>
  );
}
