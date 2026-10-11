/** Classes shared by the checkout parts. @internal */
export const focusRing =
  'novapay:focus-visible:outline-2 novapay:focus-visible:outline-offset-2 novapay:focus-visible:outline-[var(--tuwa-text-accent)]';

/** A small square button with a border (close, language). @internal */
export const iconButton = `novapay:inline-flex novapay:h-7 novapay:min-w-7 novapay:items-center novapay:justify-center novapay:gap-1 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-1.5 novapay:text-[var(--tuwa-text-primary)] novapay:cursor-pointer novapay:transition-colors novapay:hover:bg-[var(--tuwa-bg-muted)] ${focusRing}`;

/** The mono font of amounts, codes and step names. @internal */
export const mono = 'novapay:font-mono novapay:tabular-nums';
