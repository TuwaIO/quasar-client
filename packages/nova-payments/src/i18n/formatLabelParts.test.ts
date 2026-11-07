import { describe, expect, it } from 'vitest';

import { formatLabelParts } from './formatLabelParts';

describe('formatLabelParts', () => {
  it('puts values that are not text, such as links, into a label', () => {
    const terms = { link: 'Terms' };
    expect(formatLabelParts('You agree to the {terms} of {seller}.', { terms, seller: 'Acme' })).toEqual([
      'You agree to the ',
      terms,
      ' of ',
      'Acme',
      '.',
    ]);
    expect(formatLabelParts('{a}{b}', { a: 1, b: 2 })).toEqual([1, 2]);
    expect(formatLabelParts('Keep {unknown}', {})).toEqual(['Keep {unknown}']);
  });
});
