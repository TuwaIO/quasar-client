import { useMemo } from 'react';

import { labelsForLocale, mergeLabels, type NovaPaymentsLabels } from '../i18n';
import { useNovaPayments } from './useNovaPayments';

/**
 * The labels of a language: the built-in ones (English for a language without its own), then `labels` of
 * `NovaPaymentsProvider`, then its `customization.labels.transform`.
 *
 * @param locale - The language of the checkout.
 * @returns The labels.
 */
export function usePaymentsLabels(locale: string): NovaPaymentsLabels {
  const { labels, customization } = useNovaPayments();
  const transform = customization?.labels?.transform;
  return useMemo(() => {
    const merged = mergeLabels(labelsForLocale(locale), labels);
    return transform ? transform(merged, { locale }) : merged;
  }, [locale, labels, transform]);
}
