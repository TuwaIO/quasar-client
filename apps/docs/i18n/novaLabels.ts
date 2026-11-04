/**
 * @file The labels of the Nova components in each language of the Storybook: the stories pass them to
 * `NovaConnectProvider` and `NovaTransactionsLabelsProvider`, as an app would.
 */

import {
  chineseLabels as connectChinese,
  defaultLabels as connectEnglish,
  type NovaConnectLabels,
  ukrainianLabels as connectUkrainian,
} from '@tuwaio/nova-connect/i18n';
import {
  chineseLabels as transactionsChinese,
  defaultLabels as transactionsEnglish,
  type NovaTransactionsLabels,
  ukrainianLabels as transactionsUkrainian,
} from '@tuwaio/nova-transactions/i18n';

import type { StorybookLocale } from './locale';

/** The labels of `@tuwaio/nova-connect` by language. */
export const novaConnectLabels: Readonly<Record<StorybookLocale, NovaConnectLabels>> = {
  en: connectEnglish,
  uk: connectUkrainian,
  'zh-CN': connectChinese,
};

/** The labels of `@tuwaio/nova-transactions` by language. */
export const novaTransactionsLabels: Readonly<Record<StorybookLocale, NovaTransactionsLabels>> = {
  en: transactionsEnglish,
  uk: transactionsUkrainian,
  'zh-CN': transactionsChinese,
};
