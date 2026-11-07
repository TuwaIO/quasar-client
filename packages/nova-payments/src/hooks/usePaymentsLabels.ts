import { useEffect, useMemo, useState } from 'react';

import { hasLabels, labelsForLocale, loadLabels, mergeLabels, type NovaPaymentsLabels } from '../i18n';
import { useNovaPayments } from './useNovaPayments';

/**
 * The labels of a language: the built-in ones (English for a language without its own), then `labels` of
 * `NovaPaymentsProvider`, then its `customization.labels.transform`. The built-in labels of a language other than
 * English load on first use (see `loadLabels`); until they arrive the hook keeps the labels it showed before (English
 * the first time) and renders again once they are loaded.
 *
 * @param locale - The language of the checkout.
 * @returns The labels.
 */
export function usePaymentsLabels(locale: string): NovaPaymentsLabels {
  const { labels, customization } = useNovaPayments();
  const transform = customization?.labels?.transform;
  // The built-in labels shown: those of the language once loaded, until then the last ones shown
  const [shown, setShown] = useState(() => labelsForLocale(locale));
  const ready = hasLabels(locale);
  if (ready && shown !== labelsForLocale(locale)) setShown(labelsForLocale(locale));
  const base = ready ? labelsForLocale(locale) : shown;

  useEffect(() => {
    if (hasLabels(locale)) return;
    let current = true;
    void loadLabels(locale).then((loadedLabels) => current && setShown(loadedLabels));
    return () => {
      current = false;
    };
  }, [locale]);

  return useMemo(() => {
    const merged = mergeLabels(base, labels);
    return transform ? transform(merged, { locale }) : merged;
  }, [base, locale, labels, transform]);
}
