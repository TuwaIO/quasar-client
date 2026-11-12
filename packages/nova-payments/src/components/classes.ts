import type { PaymentCheckoutDisplay } from './PaymentCheckout';

/** Classes shared by the checkout parts. @internal */
export const focusRing =
  'novapay:focus-visible:outline-2 novapay:focus-visible:outline-offset-2 novapay:focus-visible:outline-[var(--tuwa-text-accent)]';

/** A small square button with a border (close, language). @internal */
export const iconButton = `novapay:inline-flex novapay:h-7 novapay:min-w-7 novapay:items-center novapay:justify-center novapay:gap-1 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-strong)] novapay:bg-[var(--tuwa-standart-button-bg)] novapay:px-1.5 novapay:text-[var(--tuwa-text-primary)] novapay:cursor-pointer novapay:transition-colors novapay:hover:bg-[var(--tuwa-standart-button-hover)] ${focusRing}`;

/** The mono font of amounts, codes and step names. @internal */
export const mono = 'novapay:font-mono novapay:tabular-nums';

/**
 * The letters of a label of paper and ink: small monospace capitals with spacing, as the labels and buttons of Nova
 * (`sectionLabelClasses` of `@tuwaio/nova-core`). The size and the color are the part's own. @internal
 */
export const caps = 'novapay:font-mono novapay:font-bold novapay:uppercase novapay:tracking-[0.12em]';

/** The label of a group of options or of a fact (Token, Invoice, Total): small capitals in the secondary ink. @internal */
export const label = `${caps} novapay:text-[11px] novapay:leading-4 novapay:text-[var(--tuwa-text-secondary)]`;

/**
 * A chip (Test, Popular, No gas fee): square, a frame of 1 px, small capitals, as the status chips of Nova (`chipClasses` of
 * `@tuwaio/nova-core`). Its colors come from {@link chipTone}. @internal
 */
export const chip = `${caps} novapay:inline-flex novapay:shrink-0 novapay:items-center novapay:gap-1 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:px-1.5 novapay:py-0.5 novapay:text-[10px] novapay:leading-3`;

/**
 * The colors of a {@link chip}: `neutral` in ink on the surface, `accent` in the accent, which reads on the surface in both
 * themes and not on a tint, and a tint with its text for a gain (`success`) and for something to mind (`pending`). @internal
 */
export const chipTone = {
  neutral: 'novapay:border-[var(--tuwa-border-strong)] novapay:text-[var(--tuwa-text-primary)]',
  accent: 'novapay:border-[var(--tuwa-text-accent)] novapay:text-[var(--tuwa-text-accent)]',
  success:
    'novapay:border-[color-mix(in_srgb,var(--tuwa-success-icon)_35%,transparent)] novapay:bg-[var(--tuwa-success-bg)] novapay:text-[var(--tuwa-success-text)]',
  pending:
    'novapay:border-[color-mix(in_srgb,var(--tuwa-pending-icon)_35%,transparent)] novapay:bg-[var(--tuwa-pending-bg)] novapay:text-[var(--tuwa-pending-text)]',
} as const;

/**
 * The heading of a screen or a question: bold mono, its lines balanced when it wraps. `novapay-title` gives a wrapped
 * heading room between its lines (`styles/app.css`): the `font-mono` rule of `@tuwaio/nova-core` sets a line height of
 * 1. @internal
 */
export const screenTitle = `novapay-title ${mono} novapay:m-0 novapay:text-base novapay:font-bold novapay:text-balance novapay:outline-none`;

/**
 * Props of the heading of a screen: it takes the focus when the screen changes (`tabIndex` -1, out of the Tab order),
 * so screen readers read the new step (WCAG 2.4.3). @internal
 */
export const screenHeading = { tabIndex: -1, 'data-novapay-heading': '' } as const;

/**
 * What the two actions of a screen footer share: one size, square, a label in capitals. A label that does not fit on one
 * line (a long language, the name of a seller, a phone) takes a second one and the button grows with it: nothing is cut.
 * @internal
 */
const action = `${caps} novapay:box-border novapay:inline-flex novapay:min-h-11 novapay:w-full novapay:min-w-0 novapay:cursor-pointer novapay:items-center novapay:justify-center novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:px-3 novapay:py-2 novapay:text-center novapay:text-xs novapay:leading-4 novapay:no-underline novapay:transition-colors novapay:disabled:cursor-not-allowed novapay:disabled:opacity-70 ${focusRing}`;

/**
 * The main action of a screen: a full-width solid button (or link) in the accent, as the main button of Nova
 * (`primaryButtonClasses` of `@tuwaio/nova-core`). `tuwa-solid` marks it as filled for the icons of Nova inside it. @internal
 */
export const primaryAction = `tuwa-solid ${action} novapay:border-[var(--tuwa-button-primary-bg)] novapay:bg-[var(--tuwa-button-primary-bg)] novapay:text-[var(--tuwa-text-on-accent)] novapay:hover:border-[var(--tuwa-button-primary-bg-hover)] novapay:hover:bg-[var(--tuwa-button-primary-bg-hover)]`;

/** A small action inside a line of text (`Turn off` beside what it turns off). @internal */
export const textButton = `novapay:cursor-pointer novapay:border-0 novapay:bg-transparent novapay:p-0 novapay:text-[length:inherit] novapay:font-semibold novapay:text-[var(--tuwa-text-accent)] novapay:underline ${focusRing}`;

/**
 * A second action under the main one (back, close, contact): the same size, no fill and a frame, as the standard button of
 * Nova (`standardButtonClasses` of `@tuwaio/nova-core`). @internal
 */
export const secondaryAction = `${action} novapay:border-[var(--tuwa-border-strong)] novapay:bg-[var(--tuwa-standart-button-bg)] novapay:text-[var(--tuwa-text-primary)] novapay:hover:bg-[var(--tuwa-standart-button-hover)]`;

/**
 * A small action beside what it changes (Change beside the wallet): the frame and the capitals of the second action of a
 * footer, at the size of a row. 24 px tall at least (WCAG 2.5.8). @internal
 */
export const smallAction = `${caps} novapay:inline-flex novapay:min-h-7 novapay:shrink-0 novapay:cursor-pointer novapay:items-center novapay:justify-center novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-strong)] novapay:bg-[var(--tuwa-standart-button-bg)] novapay:px-2.5 novapay:py-1 novapay:text-[10px] novapay:leading-3 novapay:text-[var(--tuwa-text-primary)] novapay:transition-colors novapay:hover:bg-[var(--tuwa-standart-button-hover)] novapay:disabled:cursor-not-allowed novapay:disabled:opacity-70 ${focusRing}`;

/** A small main action inside a note (Keep this price): the solid accent of the main button, at the size of a row. @internal */
export const smallPrimaryAction = `tuwa-solid ${caps} novapay:inline-flex novapay:min-h-8 novapay:cursor-pointer novapay:items-center novapay:justify-center novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-button-primary-bg)] novapay:bg-[var(--tuwa-button-primary-bg)] novapay:px-3 novapay:py-1.5 novapay:text-center novapay:text-[11px] novapay:leading-4 novapay:text-[var(--tuwa-text-on-accent)] novapay:transition-colors novapay:hover:border-[var(--tuwa-button-primary-bg-hover)] novapay:hover:bg-[var(--tuwa-button-primary-bg-hover)] novapay:disabled:cursor-not-allowed novapay:disabled:opacity-70 ${focusRing}`;

/**
 * A note in a tint that asks for attention (the wallet is on another network): the tint, its text and a thin frame of its
 * color, as the chips. @internal
 */
export const pendingNote =
  'novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[color-mix(in_srgb,var(--tuwa-pending-icon)_35%,transparent)] novapay:bg-[var(--tuwa-pending-bg)] novapay:text-[var(--tuwa-pending-text)]';

/**
 * The width classes of the checkout: in a dialog the frame is 760 px wide from 640 px, but never wider than the window
 * with the padding and border of the dialog (on a 700 px window it would otherwise run off both sides); in a page the
 * block (`section`) is 760 px wide, 880 px on its own page, but never wider than its place, and the frame fills the block,
 * so page padding never makes it overflow. A fixed width capped by `max-width: 100%`, not `width: 100%`: in a parent that
 * takes the width of its content (a centered flex box) a full width would follow the content and change from step to step.
 * The two panes show from 640 px of window and hold down to a frame of about 590 px.
 *
 * @param display - Where the checkout is shown.
 * @returns The classes of the frame and of the block around it in a page.
 * @internal
 */
export function checkoutWidthClasses(display: PaymentCheckoutDisplay): { frame: string; section: string } {
  if (display === 'modal') return { frame: 'novapay:sm:w-[min(760px,calc(100vw_-_2rem_-_2px))]', section: '' };
  return {
    frame: '',
    section: `novapay:box-border ${display === 'page' ? 'novapay:w-[880px]' : 'novapay:w-[760px]'} novapay:max-w-full`,
  };
}

/**
 * The classes of the frame and its panes. The surfaces carry the faint lines of a Nova surface (`tuwa-scanlines` of
 * `@tuwaio/nova-core`), and so does every block inside that fills itself with the color of its surface (the footer, a
 * card, the wallet window): a fill without them would show as a hole in the lines. The modal and the inline checkout hold their height and scroll inside; the page
 * has a floor (`--novapay-page-floor` of `styles/app.css`) and grows downward with its step, so nothing scrolls inside it.
 *
 * @internal
 */
export const checkoutLayout = {
  default: {
    frame:
      'tuwa-scanlines novapay:relative novapay:box-border novapay:flex novapay:w-full novapay:flex-col novapay:overflow-hidden novapay:bg-[var(--tuwa-bg-primary)] novapay:text-[var(--tuwa-text-primary)] novapay:sm:h-[680px] novapay:sm:flex-row',
    aside:
      'tuwa-scanlines novapay:hidden novapay:w-[286px] novapay:shrink-0 novapay:border-r novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:p-5 novapay:sm:block',
    main: 'novapay:flex novapay:min-h-0 novapay:min-w-0 novapay:flex-1 novapay:flex-col',
    area: 'novapay:@container novapay:flex novapay:min-h-0 novapay:flex-1 novapay:flex-col novapay:overflow-y-auto',
  },
  page: {
    frame:
      'tuwa-scanlines novapay:relative novapay:box-border novapay:flex novapay:w-full novapay:flex-1 novapay:flex-col novapay:bg-[var(--tuwa-bg-primary)] novapay:text-[var(--tuwa-text-primary)] novapay:sm:min-h-[calc(var(--novapay-page-floor)_-_2px)] novapay:sm:flex-row',
    aside:
      'novapay-page-aside tuwa-scanlines novapay:hidden novapay:w-[clamp(260px,36.4%,320px)] novapay:shrink-0 novapay:flex-col novapay:border-r novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:p-5 novapay:sm:flex',
    main: 'novapay:flex novapay:min-w-0 novapay:flex-1 novapay:flex-col',
    area: 'novapay:@container novapay:flex novapay:flex-1 novapay:flex-col',
  },
};

/**
 * The size of the total on the page: the amount is the largest fact of the order, and a long one steps down instead of
 * breaking the order panel.
 *
 * @param amount - The formatted amount.
 * @returns The class of its size.
 * @internal
 */
export function heroAmountClass(amount: string): string {
  if (amount.length <= 7) return 'novapay:text-[36px]';
  if (amount.length <= 10) return 'novapay:text-[30px]';
  return amount.length <= 13 ? 'novapay:text-[24px]' : 'novapay:text-[20px]';
}
