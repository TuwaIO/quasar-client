import { defaultLabels } from './en';
import type { NovaPaymentsLabels } from './types';

/**
 * The languages of the checkout, the six of Quasar documents, with their names in themselves: the
 * language menu shows `name` with its own `lang`, so a reader finds their language whatever the page shows.
 */
export const CHECKOUT_LOCALES = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'uk', name: 'Українська', short: 'UK' },
  { code: 'zh-CN', name: '简体中文', short: 'ZH' },
  { code: 'es', name: 'Español', short: 'ES' },
  { code: 'it', name: 'Italiano', short: 'IT' },
  { code: 'de', name: 'Deutsch', short: 'DE' },
] as const;

/** A language of the checkout: a BCP 47 tag of {@link CHECKOUT_LOCALES}. */
export type CheckoutLocale = (typeof CHECKOUT_LOCALES)[number]['code'];

/**
 * The language of the checkout that a language tag names: the tag itself when it is one of {@link CHECKOUT_LOCALES},
 * else the language of the same family (`uk-UA` is `uk`, `de-AT` is `de`; any Chinese is `zh-CN`, the only Chinese the
 * checkout has). Letter case does not matter.
 *
 * @param tag - A BCP 47 language tag, as `<html lang>` or `navigator.language` hold it.
 * @returns The language of the checkout, or `null` when the checkout does not have the language or there is no tag.
 */
export function checkoutLocaleOf(tag: string | null | undefined): CheckoutLocale | null {
  const wanted = tag?.trim().toLowerCase();
  if (!wanted) return null;
  const family = wanted.split(/[-_]/)[0];
  const match =
    CHECKOUT_LOCALES.find((item) => item.code.toLowerCase() === wanted) ??
    CHECKOUT_LOCALES.find((item) => item.code.toLowerCase().split('-')[0] === family);
  return match?.code ?? null;
}

// Every language but English is a file of its own: a page downloads only the languages it shows
const LOADERS: Record<Exclude<CheckoutLocale, 'en'>, () => Promise<NovaPaymentsLabels>> = {
  'zh-CN': () => import('./zhCN').then((module) => module.zhCNLabels),
  es: () => import('./es').then((module) => module.esLabels),
  de: () => import('./de').then((module) => module.deLabels),
  uk: () => import('./uk').then((module) => module.ukLabels),
  it: () => import('./it').then((module) => module.itLabels),
};

// The labels loaded so far, by language
const loaded = new Map<string, NovaPaymentsLabels>([['en', defaultLabels]]);

const loadable = (locale: string | null | undefined): locale is keyof typeof LOADERS =>
  Boolean(locale) && Object.hasOwn(LOADERS, locale!);

/**
 * Whether the labels of a language are at hand: always for English and for a language the package does not have
 * (both get English), for the other languages of {@link CHECKOUT_LOCALES} once {@link loadLabels} has loaded them.
 *
 * @param locale - A language.
 * @returns `true` when {@link labelsForLocale} gives the labels of the language.
 */
export function hasLabels(locale: string | null | undefined): boolean {
  return !loadable(locale) || loaded.has(locale);
}

/**
 * The built-in labels of a language, as far as they are loaded.
 *
 * @param locale - A language of the checkout; anything else gets English.
 * @returns The labels: English for a language the package does not have, or whose labels are not loaded yet (see
 * {@link loadLabels}).
 */
export function labelsForLocale(locale: string | null | undefined): NovaPaymentsLabels {
  return (locale && loaded.get(locale)) || defaultLabels;
}

/**
 * Loads the built-in labels of a language. Each language but English is a separate file that the page downloads the
 * first time it is asked for; the labels stay in memory for the page.
 *
 * @param locale - A language of the checkout; anything else gets English without loading anything.
 * @returns The labels. A file that fails to load (the network dropped) leaves the language in English until the page
 * reloads.
 */
export async function loadLabels(locale: string | null | undefined): Promise<NovaPaymentsLabels> {
  if (hasLabels(locale)) return labelsForLocale(locale);
  const code = locale as keyof typeof LOADERS;
  let labels = defaultLabels;
  try {
    labels = await LOADERS[code]();
  } catch {
    // Keeps English for the language: the checkout shows it instead of waiting for a file that does not come
  }
  loaded.set(code, labels);
  return labels;
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
