import { defaultLabels } from './en';
import type { NovaPaymentsLabels } from './types';

/**
 * The languages of the checkout, the six of Quasar documents (plan 12 §6.10), with their names in themselves: the
 * language menu shows `name` with its own `lang`, so a reader finds their language whatever the page shows.
 */
export const CHECKOUT_LOCALES = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'zh-CN', name: '简体中文', short: 'ZH' },
  { code: 'es', name: 'Español', short: 'ES' },
  { code: 'ru', name: 'Русский', short: 'RU' },
  { code: 'uk', name: 'Українська', short: 'UK' },
  { code: 'it', name: 'Italiano', short: 'IT' },
] as const;

/** A language of the checkout: a BCP 47 tag of {@link CHECKOUT_LOCALES}. */
export type CheckoutLocale = (typeof CHECKOUT_LOCALES)[number]['code'];

/** The labels built into the package, by language; a language without its own falls back to English. */
const BUILT_IN: Partial<Record<CheckoutLocale, NovaPaymentsLabels>> = { en: defaultLabels };

/**
 * The built-in labels of a language.
 *
 * @param locale - A language of the checkout; anything else gets English.
 * @returns The labels.
 */
export function labelsForLocale(locale: string | null | undefined): NovaPaymentsLabels {
  return (locale && BUILT_IN[locale as CheckoutLocale]) || defaultLabels;
}

/** Labels with some texts of some groups left out, as `labels` of `NovaPaymentsProvider` takes them. */
export type NovaPaymentsLabelOverrides = { [Group in keyof NovaPaymentsLabels]?: Partial<NovaPaymentsLabels[Group]> };

/**
 * Applies overrides to labels group by group: a group without overrides stays the same object.
 *
 * @param labels - The labels of a language.
 * @param overrides - Texts to replace.
 * @returns The labels with the overrides.
 */
export function mergeLabels(
  labels: NovaPaymentsLabels,
  overrides: NovaPaymentsLabelOverrides | undefined,
): NovaPaymentsLabels {
  if (!overrides) return labels;
  const merged = { ...labels };
  for (const group of Object.keys(overrides) as (keyof NovaPaymentsLabels)[]) {
    if (overrides[group]) Object.assign(merged, { [group]: { ...labels[group], ...overrides[group] } });
  }
  return merged;
}
