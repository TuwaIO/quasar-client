/**
 * @file The texts of the Storybook around the pages: the language and theme tools of the toolbar, the note on pages
 * that stay in English and the docs footer. The wording follows `docsLabels` of `@tuwaio/docs-ui`
 * (packages/docs-ui/src/docsLabels.ts in TuwaIO/docs), which the Storybook cannot import (it needs Next.js); keep the
 * two in step. Storybook's own interface (sidebar, controls, story names) stays in English.
 */

import type { StorybookLocale } from './locale';

/** A language in the language tool of the toolbar. */
export interface LocaleOption {
  /** The language. */
  code: StorybookLocale;
  /** The name of the language in that language. */
  label: string;
  /** The short label on the toolbar button. */
  short: string;
}

/** The languages of the language tool, in the order of `DEFAULT_LOCALES` of `@tuwaio/docs-ui`. */
export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'uk', label: 'Українська', short: 'UK' },
  { code: 'zh-CN', label: '简体中文', short: 'ZH' },
];

/** The slug of a TUWA policy linked from the footer, in the order of `footerPolicies` of `@tuwaio/docs-ui`. */
export type FooterPolicySlug = 'terms' | 'privacy' | 'cookie' | 'security' | 'dpa';

/** The texts of one language. */
export interface StorybookLabels {
  /** Accessible name of the language tool. */
  selectLanguage: string;
  /** Accessible name of the theme tool while the light theme is on. */
  switchToDark: string;
  /** Accessible name of the theme tool while the dark theme is on. */
  switchToLight: string;
  /**
   * The note above a docs page that has no translation: the package pages, the API reference and the component pages,
   * whose texts come from the source code.
   */
  englishOnly: string;
  /** The texts of the docs footer. */
  footer: {
    /** Accessible name of the npm and GitHub links. */
    linksAriaLabel: string;
    /** Description of TUWA. */
    description: string;
    /** License notice. */
    license: string;
    /** Accessible name of the policy links. */
    policiesAriaLabel: string;
    /** The link to all policies. */
    allPolicies: string;
    /** Copyright text after the years. */
    copyright: string;
    /** The titles of the policies. */
    policyTitles: Record<FooterPolicySlug, string>;
  };
}

const en: StorybookLabels = {
  selectLanguage: 'Select language',
  switchToDark: 'Switch to dark theme',
  switchToLight: 'Switch to light theme',
  englishOnly:
    'This page is in English only: package READMEs, the API reference and the component descriptions are generated from the source code and are not translated.',
  footer: {
    linksAriaLabel: 'TUWA on the web',
    description:
      'The modular, headless-first Web3 infrastructure. Build self-custodial applications on open-source, portable building blocks.',
    license: 'Licensed under Apache 2.0. Open source and free to use.',
    policiesAriaLabel: 'Policies',
    allPolicies: 'All policies',
    copyright: 'All rights reserved.',
    policyTitles: {
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
      cookie: 'Cookie Policy',
      security: 'Security Policy',
      dpa: 'Data Processing Addendum',
    },
  },
};

const uk: StorybookLabels = {
  selectLanguage: 'Оберіть мову',
  switchToDark: 'Увімкнути темну тему',
  switchToLight: 'Увімкнути світлу тему',
  englishOnly:
    'Ця сторінка доступна лише англійською: README пакетів, довідник API та описи компонентів генеруються з вихідного коду й не перекладаються.',
  footer: {
    linksAriaLabel: 'TUWA в мережі',
    description:
      'Модульна, headless-first Web3-інфраструктура. Будуйте self-custodial застосунки на базі відкритих компонентів.',
    license: 'Ліцензовано під Apache 2.0. Відкритий код та безкоштовне використання.',
    policiesAriaLabel: 'Політики',
    allPolicies: 'Усі політики',
    copyright: 'Усі права захищено.',
    policyTitles: {
      terms: 'Умови використання',
      privacy: 'Політика конфіденційності',
      cookie: 'Політика файлів cookie',
      security: 'Політика безпеки',
      dpa: 'Доповнення щодо обробки даних',
    },
  },
};

const zhCN: StorybookLabels = {
  selectLanguage: '选择语言',
  switchToDark: '切换到深色主题',
  switchToLight: '切换到浅色主题',
  englishOnly: '本页仅提供英文版：软件包 README、API 参考与组件说明均由源代码生成，不提供翻译。',
  footer: {
    linksAriaLabel: 'TUWA 官方链接',
    description: '模块化、无头优先的 Web3 基础设施。借助开源且高度可移植的底层构建块，打造真正的自托管应用。',
    license: '基于 Apache 2.0 协议开源。完全免费使用。',
    policiesAriaLabel: '法律与安全政策',
    allPolicies: '全部政策',
    copyright: '保留所有权利。',
    policyTitles: {
      terms: '服务条款',
      privacy: '隐私政策',
      cookie: 'Cookie 政策',
      security: '安全政策',
      dpa: '数据处理附录 (DPA)',
    },
  },
};

/** The {@link StorybookLabels} of every language. */
export const storybookLabels: Readonly<Record<StorybookLocale, StorybookLabels>> = { en, uk, 'zh-CN': zhCN };

/**
 * The language of the TUWA policies for a Storybook language: the policies exist in English and Ukrainian only.
 *
 * @param locale - The language of the Storybook.
 * @returns `uk` for Ukrainian, `en` otherwise.
 */
export function policyLanguageOf(locale: StorybookLocale): 'en' | 'uk' {
  return locale === 'uk' ? 'uk' : 'en';
}
