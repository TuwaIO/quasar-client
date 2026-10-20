import { describe, expect, it } from 'vitest';

import { defaultLabels } from './en';
import { CHECKOUT_LOCALES, hasLabels, labelsForLocale, loadLabels, mergeLabels } from './locales';
import type { NovaPaymentsLabels } from './types';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const texts = (labels: NovaPaymentsLabels) =>
  Object.entries(labels).flatMap(([group, entries]) =>
    Object.entries(entries as Record<string, string>).map(([key, text]) => [`${group}.${key}`, text] as const),
  );

describe('checkout languages', () => {
  it('lists the six languages of Quasar documents under their own names', () => {
    expect(CHECKOUT_LOCALES.map((locale) => locale.code)).toEqual(['en', 'zh-CN', 'es', 'ru', 'uk', 'it']);
    expect(CHECKOUT_LOCALES.find((locale) => locale.code === 'uk')?.name).toBe('Українська');
  });

  it('gives English for English and for a language the package does not have, without loading anything', async () => {
    for (const locale of ['en', 'xx', 'toString', '', null, undefined]) {
      expect(hasLabels(locale)).toBe(true);
      expect(labelsForLocale(locale)).toBe(defaultLabels);
    }
    expect(await loadLabels('xx')).toBe(defaultLabels);
  });

  it('loads every other language on demand, once, and keeps it', async () => {
    expect(hasLabels('uk')).toBe(false);
    expect(labelsForLocale('uk')).toBe(defaultLabels);
    const uk = await loadLabels('uk');
    expect(uk).not.toBe(defaultLabels);
    expect(uk.common.close).toBe('Закрити');
    expect(hasLabels('uk')).toBe(true);
    expect(labelsForLocale('uk')).toBe(uk);
    expect(await loadLabels('uk')).toBe(uk);
  });

  it.each(CHECKOUT_LOCALES.filter((locale) => locale.code !== 'en').map((locale) => locale.code))(
    'translates every text of %s, with the placeholders of the English one',
    async (code) => {
      const labels = await loadLabels(code);
      const english = new Map(texts(defaultLabels));
      const own = new Map(texts(labels));
      expect([...own.keys()]).toEqual([...english.keys()]);
      for (const [key, text] of own) {
        expect(text.trim(), key).not.toBe('');
        expect(placeholders(text), key).toEqual(placeholders(english.get(key)!));
      }
      // Some texts stay the same in another language (`Email`, `{amount} · {invoice}`), most do not
      const same = [...own].filter(([key, text]) => text === english.get(key)).length;
      expect(same / own.size).toBeLessThan(0.1);
    },
  );

  it('overrides some labels of a group and keeps the rest', () => {
    const merged = mergeLabels(defaultLabels, { common: { close: 'Done' }, steps: { pay: 'Payment' } });
    expect(merged.common).toEqual({ ...defaultLabels.common, close: 'Done' });
    expect(merged.steps.pay).toBe('Payment');
    expect(merged.summary).toBe(defaultLabels.summary);
    expect(mergeLabels(defaultLabels, undefined)).toBe(defaultLabels);
  });
});
