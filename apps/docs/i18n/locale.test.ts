import { describe, expect, it } from 'vitest';

import { readUrlLocale } from './locale';

const windowAt = (search: string, parentSearch = '') =>
  ({ location: { search }, parent: { location: { search: parentSearch } } }) as unknown as Window;

describe('the language in the URL', () => {
  it('reads the language a link names, in the manager and in the iframe of a story', () => {
    expect(readUrlLocale(windowAt('?path=/docs/x&lang=uk'))).toBe('uk');
    expect(readUrlLocale(windowAt('?id=x', '?path=/docs/x&lang=zh-CN'))).toBe('zh-CN');
  });

  it('names no language without the parameter or with an unknown one', () => {
    expect(readUrlLocale(windowAt('?path=/docs/x'))).toBeNull();
    expect(readUrlLocale(windowAt('?lang=de'))).toBeNull();
  });

  it('keeps working when the Storybook is embedded in a page of another origin', () => {
    const embedded = {
      location: { search: '' },
      get parent(): never {
        throw new Error('blocked');
      },
    } as unknown as Window;
    expect(readUrlLocale(embedded)).toBeNull();
  });
});
