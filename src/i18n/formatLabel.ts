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
