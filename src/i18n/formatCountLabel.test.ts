import { describe, expect, it } from 'vitest';

import { formatCountLabel } from './formatLabel';
import { loadLabels } from './locales';

describe('formatCountLabel', () => {
  const forms = { one: '{count} item of {seller}', other: '{count} items of {seller}' };

  it('takes the form the plural rule of the language picks, with the count and the other values', () => {
    expect(formatCountLabel(forms, 1, 'en', { seller: 'Acme' })).toBe('1 item of Acme');
    expect(formatCountLabel(forms, 0, 'en', { seller: 'Acme' })).toBe('0 items of Acme');
    expect(formatCountLabel(forms, 2, 'en', { seller: 'Acme' })).toBe('2 items of Acme');
    // Ukrainian and Russian take `one` for 21, 31…; Chinese never does
    expect(formatCountLabel(forms, 21, 'uk', { seller: 'Acme' })).toBe('21 item of Acme');
    expect(formatCountLabel(forms, 1, 'zh-CN', { seller: 'Acme' })).toBe('1 items of Acme');
  });

  it('falls back to the English rule for a language tag Intl does not accept', () => {
    expect(formatCountLabel(forms, 1, '', { seller: 'Acme' })).toBe('1 item of Acme');
    expect(formatCountLabel(forms, 1, 'not a tag!', { seller: 'Acme' })).toBe('1 item of Acme');
  });
});

// Showcase review, 2026-10-29: the compact order on a phone read "1 items"
describe('the number of lines of the compact order in every language', () => {
  it.each([
    ['en', 1, '1 item · incl. VAT 0.20'],
    ['en', 3, '3 items · incl. VAT 0.20'],
    ['uk', 1, '1 позиція · з ПДВ 0.20'],
    ['uk', 21, '21 позиція · з ПДВ 0.20'],
    ['uk', 3, 'Позицій: 3 · з ПДВ 0.20'],
    ['uk', 11, 'Позицій: 11 · з ПДВ 0.20'],
    ['ru', 1, '1 позиция · вкл. НДС 0.20'],
    ['ru', 5, 'Позиций: 5 · вкл. НДС 0.20'],
    ['es', 1, '1 artículo · IVA incl. 0.20'],
    ['es', 2, '2 artículos · IVA incl. 0.20'],
    ['it', 1, '1 articolo · IVA incl. 0.20'],
    ['it', 2, '2 articoli · IVA incl. 0.20'],
    ['zh-CN', 1, '1 件商品 · 含增值税 0.20'],
    ['zh-CN', 2, '2 件商品 · 含增值税 0.20'],
  ] as const)('%s, %d lines: %s', async (code, count, expected) => {
    const { summary } = await loadLabels(code);
    expect(formatCountLabel({ one: summary.compactOne, other: summary.compact }, count, code, { tax: '0.20' })).toBe(
      expected,
    );
  });
});
