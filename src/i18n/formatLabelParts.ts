/**
 * Splits a label at its `{name}` placeholders and puts the values in their place, for values that are not text, such
 * as links. Unknown placeholders stay as they are.
 *
 * @typeParam T - Type of the values.
 * @param label - A label with placeholders, for example `You agree to the {terms}.`.
 * @param values - The value of each placeholder.
 * @returns The text parts and the values, in order (empty texts left out).
 */
export function formatLabelParts<T>(label: string, values: Record<string, T>): (string | T)[] {
  const parts: (string | T)[] = [];
  let text = '';
  let last = 0;
  for (const match of label.matchAll(/\{(\w+)\}/g)) {
    text += label.slice(last, match.index);
    last = (match.index ?? 0) + match[0].length;
    if (match[1] in values) {
      if (text) parts.push(text);
      parts.push(values[match[1]]);
      text = '';
    } else text += match[0];
  }
  text += label.slice(last);
  if (text) parts.push(text);
  return parts;
}
