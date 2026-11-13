import { useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { shownLast, useContinued } from './statusMemory';

const KIND_PART = 'actionKind';
const LABEL_PART = 'actionLabel';

/** The class of a main action whose fill comes in over the second action it follows (`styles/app.css`). */
export const ACTION_ARRIVES = 'novapay-action-arrives';

/**
 * The first action in the footer of a status screen, which goes on from the first action of the status screen before
 * it: "Close" under a payment on its way is the same button as "Back to the seller" or "Pay again" under its result.
 * Its label starts as the label before and morphs into its own (give it to a `CapsLabel`, which a `PrimaryButton` does
 * with a plain text), and a main action that follows a second one gets its fill as a wipe in steps (`arrives`: add
 * {@link ACTION_ARRIVES} to it). Before, the footer of the new screen replaced the old one at once.
 *
 * @param kind - `primary` or `secondary`, as the action is drawn; `null` for a screen that shows none.
 * @param label - Its label, or the template of it (`Back to {merchant}`).
 * @returns The label to draw now, and whether the fill of the action comes in.
 * @internal
 */
export function useStatusAction(
  kind: 'primary' | 'secondary' | null,
  label: string,
): { label: string; arrives: boolean } {
  const { store, customization } = useCheckoutContext();
  // Taken as the screen starts, before this action takes the place of the one before it
  const [arrives] = useState(
    () =>
      kind === 'primary' &&
      shownLast<string>(store, KIND_PART) === 'secondary' &&
      !customization.config?.animation?.disabled,
  );
  useContinued(KIND_PART, kind ?? 'none');
  const shown = useContinued(LABEL_PART, kind ? label : '');
  return { label: shown || label, arrives };
}
