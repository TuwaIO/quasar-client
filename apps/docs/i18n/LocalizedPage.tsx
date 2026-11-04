import { type ComponentType, type ReactNode, useContext, useLayoutEffect } from 'react';

import { DEFAULT_LOCALE, type StorybookLocale } from './locale';
import { PageTranslationContext } from './pageTranslation';
import { useStorybookLocale } from './useStorybookLocale';

/** Props of {@link LocalizedPage}. */
export interface LocalizedPageProps {
  /** The translated pages by language: MDX files in `apps/docs/i18n/<language>/`, outside the stories glob. */
  translations: Partial<Record<Exclude<StorybookLocale, 'en'>, ComponentType>>;
  /** The English page. */
  children: ReactNode;
}

/**
 * Shows a hand-written docs page in the language selected in the toolbar: the translation of that language when there
 * is one, the English page (its children) otherwise. The switch happens in the browser, without a reload or a change of
 * the URL. The translations are MDX files outside the stories glob, so they get no sidebar entry of their own.
 *
 * @example
 * ```mdx
 * import IntroductionUk from '../i18n/uk/Introduction.mdx';
 * import IntroductionZhCN from '../i18n/zh-CN/Introduction.mdx';
 * import { LocalizedPage } from '../i18n/LocalizedPage';
 *
 * <LocalizedPage translations={{ uk: IntroductionUk, 'zh-CN': IntroductionZhCN }}>
 *
 * # Introduction
 *
 * </LocalizedPage>
 * ```
 *
 * @param props - See {@link LocalizedPageProps}.
 * @returns The page in the selected language, inside an element with its `lang`.
 */
export function LocalizedPage({ translations, children }: LocalizedPageProps) {
  const locale = useStorybookLocale();
  const markTranslated = useContext(PageTranslationContext);
  const Translation = locale === 'en' ? undefined : translations[locale];
  const inSelectedLanguage = locale === 'en' || Boolean(Translation);

  // Before paint, so the "English only" note of the docs container never flashes on a translated page
  useLayoutEffect(() => {
    markTranslated(inSelectedLanguage);
    return () => markTranslated(false);
  }, [inSelectedLanguage, markTranslated]);

  return <div lang={Translation ? locale : DEFAULT_LOCALE}>{Translation ? <Translation /> : children}</div>;
}
