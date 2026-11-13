/**
 * @file The pixels of the marks of a status and how they pass from one mark to the next: the pixels of the mark before
 * (the Quasar loader of a wait) fly into the mark of the result.
 */

/** A pixel of a drawing on its grid. */
export type Cell = { x: number; y: number };

/** A point of the box of a mark, in pixels of the screen from its top left corner. */
export type Point = { x: number; y: number };

/** A shape of a pixel drawing, as its SVG has it: a rectangle of whole pixels, or a path. */
export type PixelShape = { x: number; y: number; width: number; height: number } | { d: string };

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

/** A run of pixels in a row, as the pixel drawings of Nova write it in a path: `M5 1h6v1h-6z`. */
const RUN = /M(\d+) (\d+)h(\d+)v1h-\3z/g;

/**
 * The pixels a drawing is made of, read from its shapes: rectangles of whole pixels and paths made of runs of pixels,
 * which is how the pixel icons and the pixel loader of Nova are drawn. A drawing of lines and curves (the classic look)
 * has none.
 *
 * @param shapes - The rectangles and the paths of the drawing.
 * @returns Its pixels, each once.
 */
export function cellsOfShapes(shapes: PixelShape[]): Cell[] {
  const cells = new Map<string, Cell>();
  const add = (x: number, y: number) => cells.set(`${x},${y}`, { x, y });
  for (const shape of shapes) {
    if ('d' in shape) {
      // Only a path made of nothing but runs is a pixel drawing
      if (shape.d.replace(RUN, '') !== '') continue;
      for (const [, x, y, length] of shape.d.matchAll(RUN)) {
        for (let step = 0; step < Number(length); step++) add(Number(x) + step, Number(y));
      }
      continue;
    }
    const whole = [shape.x, shape.y, shape.width, shape.height].every(Number.isInteger);
    if (!whole) continue;
    for (let dy = 0; dy < shape.height; dy++) for (let dx = 0; dx < shape.width; dx++) add(shape.x + dx, shape.y + dy);
  }
  return [...cells.values()];
}

/**
 * Where each pixel of a new mark flies from: the pixel of the mark before it that lies closest in direction from the
 * center, so the old mark opens out into the new one. The pixels of a smaller mark are shared among those of a larger
 * one.
 *
 * @param targets - The pixels of the new mark, by their centers.
 * @param sources - The pixels of the mark before it, in the same box.
 * @param center - The center of the box.
 * @returns For each target, in the same order, the point it starts from; empty without sources.
 */
export function flightOrigins(targets: Point[], sources: Point[], center: Point): Point[] {
  if (sources.length === 0) return [];
  const turn = Math.PI * 2;
  const angle = ({ x, y }: Point) => Math.atan2(y - center.y, x - center.x);
  // The shorter way round between two directions
  const apart = (a: number, b: number) => {
    const between = Math.abs(a - b) % turn;
    return between > Math.PI ? turn - between : between;
  };
  const round = sources.map((source) => ({ source, at: angle(source) }));
  return targets.map((target) => {
    const at = angle(target);
    return round.reduce((best, next) => (apart(next.at, at) < apart(best.at, at) ? next : best)).source;
  });
}
