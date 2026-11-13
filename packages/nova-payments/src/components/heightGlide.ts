/**
 * @file Makes a box glide to the height of its content on a narrow screen, where the checkout is as tall as its step.
 * Kept apart from the component so that it can be tested without a DOM.
 */

/** Parameters of {@link watchHeightGlide}. */
export type WatchHeightGlideParams = {
  /** The box whose height glides; it clips its content while it does. */
  box: HTMLElement;
  /** Its content, which keeps its own height whatever the box does, and whose height is observed. */
  content: HTMLElement;
  /** Whether the screen is narrow: on a wide one the checkout holds its height and nothing glides. */
  isNarrow: () => boolean;
  /** Whether a change of height glides now: on the status screens. Elsewhere the height just changes. */
  isActive: () => boolean;
  /** Duration of a glide, in milliseconds (default: `300`). */
  duration?: number;
};

/** A change of height below this, in pixels, is followed as it is: the content is moving by itself. */
const STEP_PX = 12;

/**
 * On the phone the checkout is as tall as its step, and a sheet at the bottom of the screen in a dialog: when a status
 * screen gives way to the next, a change of height moved everything at once, the heading the buyer was reading with it.
 * With this the box glides from the height it has on screen to the new one, in both directions, so its top edge and all
 * in it move in one calm motion. While a glide runs, a further change (what a result adds comes in by itself) only moves
 * its end. No glide with `prefers-reduced-motion: reduce` or without the Web Animations API.
 *
 * Side effects: observes `content` with a `ResizeObserver`, and runs animations on `box` (with `overflow: clip`
 * meanwhile) until the returned function is called. Does nothing without `ResizeObserver`.
 *
 * @param params - See {@link WatchHeightGlideParams}.
 * @returns A function that stops observing and cancels a running glide.
 * @internal
 */
export function watchHeightGlide({ box, content, isNarrow, isActive, duration = 300 }: WatchHeightGlideParams) {
  if (typeof ResizeObserver === 'undefined') return () => undefined;

  let shown: number | undefined;
  let glide: Animation | undefined;
  let from = 0;

  const calm = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const settle = () => {
    glide = undefined;
    box.style.removeProperty('overflow');
  };
  const stop = () => {
    const running = glide;
    settle();
    running?.cancel();
  };

  const follow = () => {
    const next = content.offsetHeight;
    const before = shown;
    shown = next;
    if (before === undefined || before === next) return;
    if (glide) {
      // The end moves, the glide goes on: what a result adds is still coming in
      (glide.effect as KeyframeEffect | null)?.setKeyframes?.([{ height: `${from}px` }, { height: `${next}px` }]);
      return;
    }
    const still = !isNarrow() || !isActive() || calm() || typeof box.animate !== 'function';
    if (still || Math.abs(next - before) < STEP_PX) return;
    from = before;
    // `clip`, not `hidden`: a scroll container would take a sticky footer inside out of its place
    box.style.overflow = 'clip';
    const running = box.animate([{ height: `${before}px` }, { height: `${next}px` }], {
      duration,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
    glide = running;
    const done = () => {
      if (glide === running) settle();
    };
    running.onfinish = done;
    running.oncancel = done;
  };

  const observer = new ResizeObserver(follow);
  observer.observe(content);
  follow();

  return () => {
    observer.disconnect();
    stop();
  };
}
