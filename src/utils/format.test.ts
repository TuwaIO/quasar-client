import { describe, expect, it } from 'vitest';

import { formatCountdown, formatFiat, formatTokenAmount, minorToDecimal, shortAddress } from './format';

describe('amounts', () => {
  it('turns minor units into a decimal without floating point', () => {
    expect(minorToDecimal('8954')).toBe('89.54');
    expect(minorToDecimal('5')).toBe('0.05');
    expect(minorToDecimal('-1000')).toBe('-10.00');
    expect(minorToDecimal('123456789012345678901')).toBe('1234567890123456789.01');
  });

  it('shows a fiat amount with two decimals in the language of the page', () => {
    expect(formatFiat('89.54', 'en')).toBe('89.54');
    expect(formatFiat('1234.5', 'en')).toBe('1,234.50');
    expect(formatFiat('1234.5', 'ru')).toBe('1\u00a0234,50');
    expect(formatFiat('1234.5', 'it')).toBe('1234,50');
    expect(formatFiat(49, 'es')).toBe('49,00');
    expect(formatFiat('90071992547409.93', 'en')).toBe('90,071,992,547,409.93');
  });

  it('shows a token amount exactly, as many decimals as it has and at least two', () => {
    expect(formatTokenAmount('89540000', 6, 'en')).toBe('89.54');
    expect(formatTokenAmount('89000000', 6, 'en')).toBe('89.00');
    expect(formatTokenAmount('1000000001', 9, 'en')).toBe('1.000000001');
    expect(formatTokenAmount('123456789000000000000000', 18, 'en')).toBe('123,456.789');
    expect(formatTokenAmount('123456789000000000000000', 18, 'uk')).toBe('123\u00a0456,789');
    expect(formatTokenAmount('5', 6, 'en')).toBe('0.000005');
  });
});

describe('addresses', () => {
  it('keeps the start and the end of an address', () => {
    expect(shortAddress('0x1111111111111111111111111111111111112222')).toBe('0x1111…2222');
    expect(shortAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toBe('7xKX…gAsU');
    expect(shortAddress('short')).toBe('short');
  });
});

describe('countdown', () => {
  it('counts hours, minutes and seconds, and days when there are some', () => {
    expect(formatCountdown(85_267_000)).toBe('23:41:07');
    expect(formatCountdown(59_000)).toBe('00:59');
    expect(formatCountdown(872_000)).toBe('14:32');
    expect(formatCountdown(2 * 86_400_000 + 3_723_000)).toBe('2d 01:02:03');
    expect(formatCountdown(-5)).toBe('00:00');
  });
});
