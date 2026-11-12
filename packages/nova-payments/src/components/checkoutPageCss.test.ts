import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../styles/app.css', import.meta.url)), 'utf8');

describe('the styles of the page display', () => {
  it('clips the block without making it a scroll container, so the footer sticks to the window', () => {
    expect(css).toContain('overflow: clip');
    expect(css).not.toContain('overflow: hidden');
  });

  it('centers from the floor, not from the height of the block, so that no step moves the top', () => {
    expect(css).toMatch(/padding-block-start: max\([^;]*--novapay-page-floor/);
  });

  it('does not move with a collapsing toolbar or a keyboard', () => {
    expect(css).toContain('100svh');
    expect(css).not.toContain('dvh');
  });

  it('follows the rules of the brand: no gradient as a fill and no shadow', () => {
    // The one place a gradient function is written: the segment of the wait for a wallet and the mask that keeps it on
    // the border of the frame
    const chase = css.slice(css.indexOf('.novapay-chase::after {'), css.indexOf('animation: novapay-chase'));
    expect(chase).toContain('conic-gradient(');
    expect(css.replace(chase, '')).not.toMatch(/gradient/);
    expect(css).not.toMatch(/box-shadow/);
  });

  it('draws the wait for a wallet as one solid segment on the border of its frame, still for a reader who asks for it', () => {
    // Hard stops: a segment with fading ends reads as a glow, which paper and ink has none of
    expect(css).toMatch(
      /conic-gradient\(from var\(--novapay-chase-angle\), var\(--tuwa-pending-icon\) 0 14%, transparent 14% 100%\)/,
    );
    expect(css).toMatch(/mask:[^;]*content-box exclude/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.novapay-chase::after \{\s*animation: none;/);
  });

  it('comes after the utilities, so that it wins over them', () => {
    expect(css.indexOf('.novapay-page ')).toBeGreaterThan(css.indexOf("@import 'tailwindcss/utilities.css'"));
  });
});
