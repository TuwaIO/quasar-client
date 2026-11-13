import { CheckCircleIcon } from '@tuwaio/nova-icons/24/solid';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { cellsOfShapes, flightOrigins, MARK_CELLS, MARK_GRID } from './statusMarkPixels';

const sorted = (cells: { x: number; y: number }[]) =>
  cells.map(({ x, y }) => `${x},${y}`).sort((a, b) => a.localeCompare(b));

describe('the pixels of the marks of a result', () => {
  it('the check mark is the solid CheckCircleIcon of the Nova icons, pixel for pixel', () => {
    // With `assemble` the icon draws a square for each of its pixels
    const icon = CheckCircleIcon({ motion: 'assemble' }) as ReactElement<{ children: unknown[] }>;
    const squares = icon.props.children.flat(Infinity).filter(Boolean) as ReactElement<{ x: number; y: number }>[];
    expect(sorted(MARK_CELLS.check)).toEqual(sorted(squares.map(({ props }) => ({ x: props.x, y: props.y }))));
  });

  it('the cross is cut out of the same disc, and reads the same from every side', () => {
    const cross = new Set(sorted(MARK_CELLS.cross));
    const disc = new Set([...sorted(MARK_CELLS.check), ...cross]);
    const last = MARK_GRID - 1;
    for (const { x, y } of MARK_CELLS.cross) {
      expect(cross.has(`${last - x},${y}`)).toBe(true);
      expect(cross.has(`${x},${last - y}`)).toBe(true);
    }
    // The four arms of the cross and its middle are out of the disc; its rim is whole
    expect(cross.has('7,7')).toBe(false);
    expect(cross.has('4,4')).toBe(false);
    expect(cross.has('1,7')).toBe(true);
    expect(disc.size).toBeGreaterThan(cross.size);
  });
});

describe('cellsOfShapes', () => {
  it('reads the squares and the runs a pixel drawing is made of', () => {
    expect(
      sorted(
        cellsOfShapes([
          { x: 2, y: 3, width: 1, height: 1 },
          { x: 4, y: 4, width: 2, height: 2 },
          { d: 'M5 1h3v1h-3zM0 0h1v1h-1z' },
        ]),
      ),
    ).toEqual(
      sorted([
        { x: 2, y: 3 },
        { x: 4, y: 4 },
        { x: 5, y: 4 },
        { x: 4, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 1 },
        { x: 6, y: 1 },
        { x: 7, y: 1 },
        { x: 0, y: 0 },
      ]),
    );
  });

  it('reads a pixel once, however many shapes draw it', () => {
    expect(cellsOfShapes([{ x: 1, y: 1, width: 1, height: 1 }, { d: 'M1 1h1v1h-1z' }])).toEqual([{ x: 1, y: 1 }]);
  });

  it('finds none in a drawing of lines and curves: such a mark does not fly by pixels', () => {
    expect(cellsOfShapes([{ d: 'M18.5 18 19.55 5.2h.9L21.5 18z' }, { d: 'M4.5 12.75l6 6 9-13.5' }])).toEqual([]);
  });
});

describe('flightOrigins', () => {
  const center = { x: 32, y: 32 };

  it('gives every pixel of the new mark a pixel of the old one, on its own side of the mark', () => {
    const sources = [
      { x: 60, y: 32 },
      { x: 32, y: 60 },
      { x: 4, y: 32 },
      { x: 32, y: 4 },
    ];
    const targets = [
      { x: 33, y: 2 },
      { x: 62, y: 33 },
      { x: 31, y: 62 },
      { x: 2, y: 31 },
    ];
    expect(flightOrigins(targets, sources, center)).toEqual([sources[3], sources[0], sources[1], sources[2]]);
  });

  it('shares the pixels of a smaller mark among those of a larger one', () => {
    const sources = [{ x: 40, y: 32 }];
    const targets = [
      { x: 10, y: 10 },
      { x: 50, y: 50 },
    ];
    expect(flightOrigins(targets, sources, center)).toEqual([sources[0], sources[0]]);
  });

  it('gives none without an old mark of pixels', () => {
    expect(flightOrigins([{ x: 1, y: 1 }], [], center)).toEqual([]);
  });
});
