import {
  cn,
  DrawnCross,
  flyFrom,
  pixelFlight,
  pixelsOf,
  type Point,
  QuasarLoader,
  useNovaIcons,
} from '@tuwaio/nova-core';
import { TxStatusVisual } from '@tuwaio/nova-transactions';
import { type ComponentType, type SVGProps, useLayoutEffect, useRef } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { checkoutClassName } from './customization';
import {
  ArrowPathRoundedSquareIcon,
  ArrowUturnLeftIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
} from './icons';
import type { OutcomeKind } from './OutcomeScreen';
import { MARK_CELLS, MARK_GRID } from './statusMarkPixels';
import { rememberShown, shownLast } from './statusMemory';

/** What the mark of a status screen stands for: a payment on its way, a paid one, a failed one, or another outcome. */
export type StatusMarkKind = 'waiting' | 'paid' | 'failed' | OutcomeKind;

/** A mark a status screen showed: which one, and the pixels it was made of, in the box of the mark. */
type ShownMark = { kind: StatusMarkKind; pixels: Point[] };

const MARK_PART = 'mark';

/** The disc of a result, with the check mark or the cross cut out of it. */
const DISCS: Partial<Record<StatusMarkKind, { mark: 'check' | 'cross'; tone: string }>> = {
  paid: { mark: 'check', tone: 'novapay:text-[var(--tuwa-success-icon)]' },
  failed: { mark: 'cross', tone: 'novapay:text-[var(--tuwa-error-icon)]' },
  cancelled: { mark: 'cross', tone: 'novapay:text-[var(--tuwa-text-secondary)]' },
};

/** The icon and the tone of the outcomes that have an icon of the set. */
const ICONS: Partial<Record<StatusMarkKind, { Icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string }>> = {
  unconfirmed: { Icon: ExclamationTriangleIcon, tone: 'novapay:text-[var(--tuwa-pending-icon)]' },
  underpaid: { Icon: ExclamationTriangleIcon, tone: 'novapay:text-[var(--tuwa-pending-icon)]' },
  needs_review: { Icon: MagnifyingGlassIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  refunded: { Icon: ArrowUturnLeftIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  expired: { Icon: ClockIcon, tone: 'novapay:text-[var(--tuwa-text-secondary)]' },
  replaced: { Icon: ArrowPathRoundedSquareIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  blocked: { Icon: NoSymbolIcon, tone: 'novapay:text-[var(--tuwa-error-icon)]' },
};

/** The states of `TxStatusVisual` of Nova Transactions, whose class names of `childCustomizations` the mark keeps. */
const VISUAL_STATE = { waiting: 'processing', paid: 'succeed', failed: 'failed' } as const;

/** The mark of a result in pixels: every pixel of the disc is a square of its own, so the whole mark can assemble. */
function PixelDisc({ mark, moves, className }: { mark: 'check' | 'cross'; moves: boolean; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${MARK_GRID} ${MARK_GRID}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      className={cn('novapay:block', className)}
      data-motion={moves ? 'assemble' : undefined}
    >
      {MARK_CELLS[mark].map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} data-px="" style={pixelFlight(x, y)} />
      ))}
    </svg>
  );
}

/**
 * The mark of a status screen, in one box on all of them: the Quasar loader in the pending color while a payment is on
 * its way, then the mark of what became of it (a check mark or a cross on a disc, or the icon of another outcome). In
 * the pixel look the new mark assembles from the pixels of the one before it: they fly from where the loader stood to
 * their places in the result, also when the result is on the next screen (each screen of the checkout is a component of
 * its own). With `prefers-reduced-motion`, or with the animations of the checkout off, the mark just changes. In the
 * classic look the wait and its result are those of Nova Transactions, which draw themselves in lines.
 *
 * `childCustomizations.statusVisual` styles the wait, the paid and the failed mark; `components.StatusIcon` and
 * `classNames.statusIcon` the marks of the other outcomes.
 *
 * @param props - What the mark stands for, and classes of its container.
 * @returns The mark, hidden from screen readers: the heading says the status.
 * @internal
 */
export function StatusMark({ kind, className }: { kind: StatusMarkKind; className?: string }) {
  const context = useCheckoutContext();
  const { store, customization } = context;
  const { look } = useNovaIcons();
  const box = useRef<HTMLSpanElement>(null);
  const shown = useRef<ShownMark | null>(null);
  const moves = !customization.config?.animation?.disabled;

  useLayoutEffect(() => {
    const frame = box.current;
    const svg = frame?.querySelector('svg') ?? null;
    const area = frame?.getBoundingClientRect();
    // The mark before this one: of this screen, or of the status screen that left a moment ago
    const before = shown.current ?? shownLast<ShownMark>(store, MARK_PART) ?? null;
    if (svg && area && moves && before && before.kind !== kind) flyFrom(svg, area, before.pixels);
    const mark = { kind, pixels: svg && area ? pixelsOf(svg, area) : [] };
    shown.current = mark;
    rememberShown(store, MARK_PART, mark, false);
    return () => rememberShown(store, MARK_PART, mark);
  }, [kind, store, moves]);

  const visual = customization.childCustomizations?.statusVisual;
  const state = kind in VISUAL_STATE ? VISUAL_STATE[kind as keyof typeof VISUAL_STATE] : null;
  const iconClasses = state && cn(visual?.iconClassNames?.icon, visual?.iconClassNames?.statusOverrides?.[state]);
  const disc = DISCS[kind];
  const icon = ICONS[kind];
  const StatusIcon = customization.components?.StatusIcon;
  const outcomeClasses = state ? undefined : checkoutClassName(context, 'statusIcon', { kind: kind as OutcomeKind });

  let mark;
  if (!state && StatusIcon) {
    mark = <StatusIcon kind={kind as OutcomeKind} className={outcomeClasses} />;
  } else if (state && look !== 'pixel') {
    // The classic look: the loader and the marks of Nova Transactions, drawn in lines
    return (
      <TxStatusVisual
        isProcessing={kind === 'waiting'}
        isSucceed={kind === 'paid'}
        isFailed={kind === 'failed'}
        {...visual}
        className={cn(className, visual?.className)}
      />
    );
  } else if (kind === 'waiting') {
    mark = (
      <QuasarLoader
        size={64}
        accent="var(--tuwa-pending-icon)"
        className={cn('novapay:text-[var(--tuwa-text-primary)]', iconClasses)}
      />
    );
  } else if (disc && look === 'pixel') {
    mark = (
      <PixelDisc
        mark={disc.mark}
        moves={moves}
        className={cn(
          state ? 'novapay:h-16 novapay:w-16' : 'novapay:h-12 novapay:w-12',
          disc.tone,
          iconClasses,
          outcomeClasses,
        )}
      />
    );
  } else if (disc) {
    mark = <DrawnCross variant="disc" className={cn('novapay:h-12 novapay:w-12', disc.tone, outcomeClasses)} />;
  } else if (icon) {
    mark = (
      <icon.Icon
        aria-hidden
        className={cn('novapay:h-12 novapay:w-12', icon.tone, outcomeClasses)}
        // Only the pixel icons know `motion`: their pixels fly in to their places
        {...(moves && look === 'pixel' ? ({ motion: 'assemble' } as object) : {})}
      />
    );
  }

  return (
    <div className={cn('novapay:flex novapay:justify-center novapay:py-4', className, state && visual?.className)}>
      <span
        ref={box}
        className="novapay:relative novapay:flex novapay:h-16 novapay:w-16 novapay:items-center novapay:justify-center"
      >
        {mark}
      </span>
    </div>
  );
}
