import { cn, MorphText } from '@tuwaio/nova-core';
import { useEffect, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { screenHeading, screenTitle } from './classes';

/** The title a status screen of each store showed last, and when it left. */
const lastTitles = new WeakMap<object, { title: string; leftAt: number }>();

/** A status screen that follows another within this time continues its title. */
const CONTINUES_MS = 500;

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
  const { store } = useCheckoutContext();
  const [shown, setShown] = useState(() => {
    const last = lastTitles.get(store);
    return last && Date.now() - last.leftAt < CONTINUES_MS ? last.title : title;
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- The change of the text is what morphs it
    setShown(title);
    return () => {
      lastTitles.set(store, { title, leftAt: Date.now() });
    };
  }, [store, title]);
  return (
    <h2 {...screenHeading} aria-label={title} className={cn(screenTitle, className)}>
      <MorphText wrap>{shown}</MorphText>
    </h2>
  );
}
