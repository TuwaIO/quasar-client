/**
 * @file A QR code as one SVG path, so the checkout draws it in its own colors.
 */

import { encode } from 'uqr';

/** Light modules around the code that scanners need (the minimum of the QR standard). */
const QUIET_ZONE = 4;

/**
 * A QR code as an SVG path: one 1×1 square per dark module, inside a quiet zone of four modules. Error correction `M`
 * (15 %) keeps payment links short enough to scan from a screen.
 *
 * @param text - What the code holds (a Solana Pay URL, a payment page).
 * @returns The size of the square view box in modules and the path.
 */
export function qrPath(text: string): { size: number; path: string } {
  const { size, data } = encode(text, { ecc: 'M', border: 0 });
  let path = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    }),
  );
  return { size: size + QUIET_ZONE * 2, path };
}
