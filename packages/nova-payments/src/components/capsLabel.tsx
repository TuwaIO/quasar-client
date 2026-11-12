import type { ReactNode } from 'react';

import { formatLabelParts } from '../i18n';

/**
 * Fills a label that is shown in capitals (a button of a screen footer): the words of the checkout take the capitals, and
 * what it fills in keeps its own letters. The name of a seller, a wallet or a network is theirs and is never changed, as
 * in Nova; an amount and a number read the same either way.
 *
 * @param label - A label with `{name}` placeholders, for example `Back to {merchant}`.
 * @param values - The value of each placeholder.
 * @returns The parts of the label, each value in a `span` that keeps its letters.
 * @internal
 */
export function capsLabel(label: string, values: Record<string, string | number>): ReactNode {
  const own = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { own: String(value) }]));
  return formatLabelParts(label, own).map((part, index) =>
    typeof part === 'string' ? (
      part
    ) : (
      <span key={index} className="novapay:normal-case">
        {part.own}
      </span>
    ),
  );
}
