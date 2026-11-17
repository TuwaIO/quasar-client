/**
 * @file The pixels of the marks of a status and how they pass from one mark to the next: the pixels of the mark before
 * (the Quasar loader of a wait) fly into the mark of the result.
 */

import { type Cell, cellsOfShapes, flightOrigins, type PixelShape, type Point } from '@tuwaio/nova-core';

export { type Cell, cellsOfShapes, flightOrigins, type PixelShape, type Point };

/** The marks of a result are drawn on a grid of 16 x 16 pixels, as the icons of `@tuwaio/nova-icons`. */
export const MARK_GRID = 16;

/** A disc, 14 pixels across. */
// prettier-ignore
const DISC = [
  '................',
  '.....######.....',
  '...##########...',
  '..############..',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '.##############.',
  '..############..',
  '...##########...',
  '.....######.....',
  '................',
];

/** The check mark cut out of the disc: with it, the solid CheckCircleIcon of `@tuwaio/nova-icons` (a test keeps them the same). */
// prettier-ignore
const CHECK_CUT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '..........##....',
  '.........###....',
  '....##..###.....',
  '....######......',
  '.....####.......',
  '......##........',
  '................',
  '................',
  '................',
  '................',
  '................',
];

/** The cross cut out of the disc, as `DrawnCross` of `@tuwaio/nova-core` draws it on a disc. */
// prettier-ignore
const CROSS_CUT = [
  '................',
  '................',
  '................',
  '................',
  '....##....##....',
  '....###..###....',
  '.....######.....',
  '......####......',
  '......####......',
  '.....######.....',
  '....###..###....',
  '....##....##....',
  '................',
  '................',
  '................',
  '................',
];

const cellsOf = (art: readonly string[]): Cell[] =>
  art.flatMap((row, y) => [...row].flatMap((mark, x) => (mark === '.' ? [] : [{ x, y }])));

const keyOf = ({ x, y }: Cell) => `${x},${y}`;

const without = (cells: Cell[], cut: Cell[]) => {
  const out = new Set(cut.map(keyOf));
  return cells.filter((cell) => !out.has(keyOf(cell)));
};

/** The pixels of the mark of a result: a disc with the check mark, or with the cross, cut out of it. */
export const MARK_CELLS: Record<'check' | 'cross', Cell[]> = {
  check: without(cellsOf(DISC), cellsOf(CHECK_CUT)),
  cross: without(cellsOf(DISC), cellsOf(CROSS_CUT)),
};
