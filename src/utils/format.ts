/**
 * @file Numbers, amounts, addresses and countdowns as the checkout shows them, in the language of the page.
 */

/**
 * A decimal string from an integer amount of minor units (cents), without floating point.
 *
 * @param minor - Minor units, as a decimal integer string (may be negative).
 * @param digits - Minor digits of the currency (default `2`).
 * @returns The decimal, for example `89.54` for `8954`.
 */
export function minorToDecimal(minor: string, digits = 2): string {
  const negative = minor.startsWith('-');
  const units = (negative ? minor.slice(1) : minor).padStart(digits + 1, '0');
  return `${negative ? '-' : ''}${units.slice(0, -digits)}.${units.slice(-digits)}`;
}

/** The decimal separator of a language. */
const decimalSeparator = (locale: string) =>
  new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';

/**
 * A fiat amount with two decimals and the grouping of the language, without the currency (the checkout shows its
 * code next to it).
 *
 * @param amount - A decimal string or a number.
 * @param locale - BCP 47 language of the page.
 * @returns The formatted amount, for example `1,234.50` in English and `1 234,50` in Russian.
 */
export function formatFiat(amount: string | number, locale: string): string {
  // Exact for decimal strings of any size: invoice amounts have two decimals
  const [whole = '0', fraction = ''] = (typeof amount === 'number' ? amount.toFixed(2) : amount.trim()).split('.');
  const negative = whole.startsWith('-');
  const grouped = new Intl.NumberFormat(locale).format(BigInt(negative ? whole.slice(1) : whole));
  return `${negative ? '-' : ''}${grouped}${decimalSeparator(locale)}${fraction.padEnd(2, '0').slice(0, 2)}`;
}

/**
 * A token amount from base units, exact: every decimal the amount has (at least two), never rounded, with the
 * grouping of the language. What the buyer sends must match the wallet to the last digit.
 *
 * @param baseUnits - Base units, as a decimal integer string.
 * @param decimals - Decimals of the token.
 * @param locale - BCP 47 language of the page.
 * @returns The formatted amount, for example `89.54` for `89540000` with 6 decimals.
 */
export function formatTokenAmount(baseUnits: string, decimals: number, locale: string): string {
  const value = BigInt(baseUnits);
  const negative = value < 0n;
  const units = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const whole = new Intl.NumberFormat(locale).format(units / scale);
  const fraction = (units % scale).toString().padStart(decimals, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${negative ? '-' : ''}${whole}${decimalSeparator(locale)}${fraction}`;
}

/**
 * An address shortened to its start and end, as wallets show it.
 *
 * @param address - The address (`0x…` or base58).
 * @param head - Characters kept at the start; `0x` counts toward it (default `6` for `0x`, `4` otherwise).
 * @param tail - Characters kept at the end (default `4`).
 * @returns For example `0x1111…2222`; a short address unchanged.
 */
export function shortAddress(address: string, head = address.startsWith('0x') ? 6 : 4, tail = 4): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Time left as a countdown: `mm:ss` under an hour, `hh:mm:ss` under a day, `Nd hh:mm:ss` beyond.
 *
 * @param ms - Milliseconds left; a negative value counts as zero.
 * @returns The countdown.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}
