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

  it('follows the rules of the brand', () => {
    expect(css).not.toMatch(/gradient/);
  });

  it('comes after the utilities, so that it wins over them', () => {
    expect(css.indexOf('.novapay-page ')).toBeGreaterThan(css.indexOf("@import 'tailwindcss/utilities.css'"));
  });
});
