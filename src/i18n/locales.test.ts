import { describe, expect, it } from 'vitest';

import { defaultLabels } from './en';
import { CHECKOUT_LOCALES, labelsForLocale, mergeLabels } from './locales';

describe('checkout languages', () => {
  it('lists the six languages of Quasar documents under their own names', () => {
    expect(CHECKOUT_LOCALES.map((locale) => locale.code)).toEqual(['en', 'zh-CN', 'es', 'ru', 'uk', 'it']);
    expect(CHECKOUT_LOCALES.find((locale) => locale.code === 'uk')?.name).toBe('Українська');
  });

  it('falls back to English for a language without labels, and for an unknown one', () => {
    expect(labelsForLocale('en')).toBe(defaultLabels);
    expect(labelsForLocale('xx')).toBe(defaultLabels);
    expect(labelsForLocale(null)).toBe(defaultLabels);
  });

  it('overrides some labels of a group and keeps the rest', () => {
    const merged = mergeLabels(defaultLabels, { common: { close: 'Done' }, steps: { pay: 'Payment' } });
    expect(merged.common).toEqual({ ...defaultLabels.common, close: 'Done' });
    expect(merged.steps.pay).toBe('Payment');
    expect(merged.summary).toBe(defaultLabels.summary);
    expect(mergeLabels(defaultLabels, undefined)).toBe(defaultLabels);
  });
});
