import { cn, DrawnCross, pixelFlight, QuasarLoader, useNovaIcons } from '@tuwaio/nova-core';
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
import { cellsOfShapes, flightOrigins, MARK_CELLS, MARK_GRID, type PixelShape, type Point } from './statusMarkPixels';
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
  held: { Icon: MagnifyingGlassIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  refunded: { Icon: ArrowUturnLeftIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  expired: { Icon: ClockIcon, tone: 'novapay:text-[var(--tuwa-text-secondary)]' },
  replaced: { Icon: ArrowPathRoundedSquareIcon, tone: 'novapay:text-[var(--tuwa-info-icon)]' },
  blocked: { Icon: NoSymbolIcon, tone: 'novapay:text-[var(--tuwa-error-icon)]' },
};

/** The states of `TxStatusVisual` of Nova Transactions, whose class names of `childCustomizations` the mark keeps. */
const VISUAL_STATE = { waiting: 'processing', paid: 'succeed', failed: 'failed' } as const;

/** The centers of the pixels an SVG drawing is made of, in pixels of the screen from the corner of `box`. */
function pixelsOf(svg: SVGSVGElement, box: DOMRect): Point[] {
  const grid = svg.viewBox.baseVal;
  const frame = svg.getBoundingClientRect();
  if (!grid || grid.width === 0 || frame.width === 0) return [];
  const number = (element: Element, name: string) => Number(element.getAttribute(name) ?? 0);
  // Not the shapes a drawing only clips with
  const drawn = (element: Element) => !element.closest('defs, clipPath, mask');
  const shapes: PixelShape[] = [
    ...[...svg.querySelectorAll('rect')].filter(drawn).map((rect) => ({
      x: number(rect, 'x'),
      y: number(rect, 'y'),
      width: number(rect, 'width'),
      height: number(rect, 'height'),
    })),
    ...[...svg.querySelectorAll('path')].filter(drawn).map((path) => ({ d: path.getAttribute('d') ?? '' })),
  ];
  const scale = frame.width / grid.width;
  return cellsOfShapes(shapes).map(({ x, y }) => ({
    x: frame.left - box.left + (x + 0.5) * scale,
    y: frame.top - box.top + (y + 0.5) * scale,
  }));
}

/**
 * Makes the pixels of a mark that assembles (`data-px`, the motion of `@tuwaio/nova-icons`) start from the pixels of
 * the mark before it instead of from spots of their own nearby.
 */
function flyFrom(svg: SVGSVGElement, box: DOMRect, sources: Point[]): void {
  const squares = [...svg.querySelectorAll<SVGElement>('[data-px]')];
  const grid = svg.viewBox.baseVal;
  const frame = svg.getBoundingClientRect();
  if (squares.length === 0 || !grid || grid.width === 0 || frame.width === 0) return;
  const scale = frame.width / grid.width;
  const centers = squares.map((square) => ({
    x: frame.left - box.left + (Number(square.getAttribute('x') ?? 0) + 0.5) * scale,
    y: frame.top - box.top + (Number(square.getAttribute('y') ?? 0) + 0.5) * scale,
  }));
  const origins = flightOrigins(centers, sources, { x: box.width / 2, y: box.height / 2 });
  // A mark before that was not made of pixels: the new one assembles from its own spots nearby
  if (origins.length === 0) return;
  const units = (pixels: number) => `${Math.round((pixels / scale) * 100) / 100}px`;
  squares.forEach((square, index) => {
    // In units of the drawing, as `pixelFlight` gives them
    square.style.setProperty('--nova-px-x', units(origins[index].x - centers[index].x));
    square.style.setProperty('--nova-px-y', units(origins[index].y - centers[index].y));
  });
}

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
