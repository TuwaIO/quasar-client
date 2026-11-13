import { cn, MorphText } from '@tuwaio/nova-core';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { mono } from './classes';
import { StatusChip, type StatusChipTone } from './StatusChip';
import { StatusMark, type StatusMarkKind } from './StatusMark';
import { useContinued } from './statusMemory';
import { StatusTitle } from './StatusTitle';

/** Props of {@link StatusHead}. */
export interface StatusHeadProps {
  /** What the mark stands for. */
  mark: StatusMarkKind;
  /** The color of the chip: the state of the payment. */
  tone: StatusChipTone;
  /** The word of the chip (`labels.status`). */
  chip: string;
  /** The heading. */
  title: string;
  /** The amount of the payment with its token, when the screen names one. */
  amount?: string | null;
  /** A line under the amount: the network, and when or what next. */
  note?: string | null;
}

/**
 * The head of a status screen, the same on all of them: the mark, the chip of the state, the heading, the amount and a
 * line under it, each in one place whatever the state. A payment on its way and what became of it are screens of their
 * own, and with this head they read as one block that changes: the mark assembles from the pixels of the one before,
 * the chip changes its color and word, the heading and the line morph, and the amount stays where it was.
 *
 * @param props - See {@link StatusHeadProps}.
 * @returns The head.
 * @internal
 */
export function StatusHead({ mark, tone, chip, title, amount, note }: StatusHeadProps) {
  const { display } = useCheckoutContext();
  const page = display === 'page';
  const shownAmount = useContinued('amount', amount ?? '');
  const shownNote = useContinued('note', note ?? '');
  return (
    <>
      <StatusMark kind={mark} className={page ? 'novapay-page-visual' : undefined} />
      <div className="novapay:flex novapay:w-full novapay:max-w-sm novapay:flex-col novapay:items-center">
        <StatusChip tone={tone}>{chip}</StatusChip>
        <StatusTitle className="novapay:mt-2">{title}</StatusTitle>
        {amount && (
          <p
            // The amount it is, for a screen reader, while the digits of the one before may still show
            aria-label={amount}
            className={cn(
              mono,
              'novapay:m-0 novapay:mt-2 novapay:text-2xl novapay:font-bold',
              page && 'novapay-page-amount',
            )}
          >
            <MorphText>{shownAmount || amount}</MorphText>
          </p>
        )}
        {note && (
          <p className="novapay:m-0 novapay:mt-1 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            <MorphText wrap>{shownNote || note}</MorphText>
          </p>
        )}
      </div>
    </>
  );
}
