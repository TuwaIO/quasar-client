import { encode } from 'uqr';
import { describe, expect, it } from 'vitest';

import { qrPath } from './qr';

describe('qrPath', () => {
  it('draws every dark module of the code as one square of the path, inside a quiet zone of four modules', () => {
    const text = 'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?amount=89.54';
    const matrix = encode(text, { ecc: 'M', border: 0 });
    const dark = matrix.data.flat().filter(Boolean).length;
    const { size, path } = qrPath(text);
    expect(size).toBe(matrix.size + 8);
    expect(path.match(/M/g)).toHaveLength(dark);
    // The first module sits at the quiet zone, not at the edge
    expect(path.startsWith('M4 4h1v1h-1z')).toBe(true);
  });
});
