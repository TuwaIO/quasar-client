/**
 * @file The languages of the Storybook, shared by the manager (`.storybook/manager.jsx`, the language tool) and the
 * preview (`.storybook/preview.tsx`, the stories and docs pages). No React and no Storybook imports, so both builds can
 * bundle it.
 *
 * Privacy: the language is read from Session Storage (written only after the visitor switches it) and from
 * `navigator.languages`. No cookie, no URL parameter and no request.
 */

/** A language of the Storybook, as on the other TUWA documentation sites. */
export type StorybookLocale = 'en' | 'uk' | 'zh-CN';

/** Every language of the Storybook, the default first. */
export const STORYBOOK_LOCALES: readonly StorybookLocale[] = ['en', 'uk', 'zh-CN'];

/** The language of the generated pages and the fallback. */
export const DEFAULT_LOCALE: StorybookLocale = 'en';

/**
 * Session Storage key of the language the visitor picked in the toolbar. Written only when the visitor switches the
 * language and kept until the tab closes, like `tuwa-storybook-theme` (Cookie Policy).
 */
export const LOCALE_STORAGE_KEY = 'tuwa-storybook-locale';

/** Channel event the manager emits with the active language. */
export const SET_LOCALE_EVENT = 'tuwa/set-locale';

/** Channel event the preview emits to ask the manager for the active language. */
export const REQUEST_LOCALE_EVENT = 'tuwa/request-locale';

/**
 * Maps a stored value or a language tag to a language of the Storybook.
 *
 * @param value - A stored value or a BCP 47 tag (`uk-UA`, `zh-Hans`, `en-US`).
 * @returns The matching language, or `null` when the value names none. Traditional Chinese (`zh-TW`, `zh-HK`,
 *   `zh-Hant`) is not served and returns `null`.
 */
export function normalizeLocale(value: unknown): StorybookLocale | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase().replace(/_/g, '-');
  if (!tag) return null;
  if (tag === 'uk' || tag === 'ua' || tag.startsWith('uk-')) return 'uk';
  if (tag === 'zh' || tag.startsWith('zh-hans') || (tag.startsWith('zh-') && !/hant|tw|hk|mo/.test(tag))) {
    return 'zh-CN';
  }
  if (tag === 'en' || tag.startsWith('en-')) return 'en';
  return null;
}

/**
 * Picks the language from the languages of the browser, in the order the visitor ranked them: the first Ukrainian or
 * Simplified Chinese tag wins, and the first English tag ends the search. Time zones and regions are not read.
 *
 * @param languages - `navigator.languages`.
 * @returns The language, or {@link DEFAULT_LOCALE} when none matches.
 */
export function detectBrowserLocale(languages: readonly string[]): StorybookLocale {
  for (const tag of languages) {
    const locale = normalizeLocale(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Reads the language saved under {@link LOCALE_STORAGE_KEY}.
 *
 * @returns The saved language, or `null` when nothing is saved or Session Storage is blocked.
 */
export function readStoredLocale(): StorybookLocale | null {
  try {
    return normalizeLocale(window.sessionStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Saves the language the visitor picked under {@link LOCALE_STORAGE_KEY} in Session Storage. Blocked storage is
 * ignored: the choice then lasts until the page reloads.
 *
 * @param locale - The picked language.
 */
export function storeLocale(locale: StorybookLocale): void {
  try {
    window.sessionStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage blocked (strict private mode)
  }
}

/**
 * The language to start with: the one the visitor picked in this tab, otherwise the first supported language of the
 * browser, otherwise English. Nothing is written.
 *
 * @returns The initial language.
 */
export function getInitialLocale(): StorybookLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = readStoredLocale();
  if (stored) return stored;
  try {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    return detectBrowserLocale(languages);
  } catch {
    return DEFAULT_LOCALE;
  }
}
