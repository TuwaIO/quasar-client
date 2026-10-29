/**
 * Replaces the `{name}` placeholders of a label with values; unknown placeholders are kept.
 *
 * @param label - A label with placeholders, for example `Step {current} of {total}`.
 * @param values - The value of each placeholder.
 * @returns The label with the values.
 */
export function formatLabel(label: string, values: Record<string, string | number>): string {
  return label.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in values ? String(values[name]) : placeholder,
  );
}

/**
 * Fills a label that counts something, in the form the plural rule of the language picks for the count
 * (`Intl.PluralRules`): `one` for `1 item` (in Ukrainian and Russian also for 21, 31…), `other` for the rest. A
 * language tag that `Intl` does not accept takes the English rule.
 *
 * @param forms - The label for the `one` category and the label for every other count; both may use `{count}`.
 * @param forms.one - The label when the rule picks `one`.
 * @param forms.other - The label for any other count.
 * @param count - The number counted, filled in as `{count}`.
 * @param locale - The language of the label, a BCP 47 tag such as `uk` or `zh-CN`.
 * @param values - The other placeholders of the label.
 * @returns The label in the right form, with the values.
 */
export function formatCountLabel(
  forms: { one: string; other: string },
  count: number,
  locale: string,
  values: Record<string, string | number> = {},
): string {
  return formatLabel(pluralCategory(count, locale) === 'one' ? forms.one : forms.other, { ...values, count });
}

/** The plural category of the count in the language, by the English rule when `Intl` rejects the tag. */
function pluralCategory(count: number, locale: string): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(locale || 'en').select(count);
  } catch {
    return new Intl.PluralRules('en').select(count);
  }
}
