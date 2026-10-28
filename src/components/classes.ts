/** Classes shared by the checkout parts. @internal */
export const focusRing =
  'novapay:focus-visible:outline-2 novapay:focus-visible:outline-offset-2 novapay:focus-visible:outline-[var(--tuwa-text-accent)]';

/** A small square button with a border (close, language). @internal */
export const iconButton = `novapay:inline-flex novapay:h-7 novapay:min-w-7 novapay:items-center novapay:justify-center novapay:gap-1 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-1.5 novapay:text-[var(--tuwa-text-primary)] novapay:cursor-pointer novapay:transition-colors novapay:hover:bg-[var(--tuwa-bg-muted)] ${focusRing}`;

/** The mono font of amounts, codes and step names. @internal */
export const mono = 'novapay:font-mono novapay:tabular-nums';

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

/** The main action of a screen: a full-width solid button (or link) in the accent. @internal */
export const primaryAction = `${mono} novapay:inline-flex novapay:h-11 novapay:w-full novapay:cursor-pointer novapay:items-center novapay:justify-center novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border-0 novapay:bg-[var(--tuwa-button-primary-bg)] novapay:text-sm novapay:font-bold novapay:text-[var(--tuwa-text-on-accent)] novapay:no-underline novapay:transition-colors novapay:hover:bg-[var(--tuwa-button-primary-bg-hover)] novapay:disabled:cursor-not-allowed novapay:disabled:opacity-70 ${focusRing}`;

/** A second action under the main one (back, close, contact): the same size, with a border. @internal */
export const secondaryAction = `${mono} novapay:inline-flex novapay:h-11 novapay:w-full novapay:cursor-pointer novapay:items-center novapay:justify-center novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:text-sm novapay:font-bold novapay:text-[var(--tuwa-text-primary)] novapay:no-underline novapay:transition-colors novapay:hover:bg-[var(--tuwa-bg-muted)] novapay:disabled:cursor-not-allowed novapay:disabled:opacity-70 ${focusRing}`;
