import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchHeightGlide } from './heightGlide';

/** A box and its content as the glide sees them, and the animations it started. */
function stage() {
  const animations: { keyframes: Keyframe[]; cancelled: boolean; finish: () => void }[] = [];
  const style = new Map<string, string>();
  const box = {
    style: {
      set overflow(value: string) {
        style.set('overflow', value);
      },
      removeProperty: (name: string) => style.delete(name),
    },
    animate: (keyframes: Keyframe[]) => {
      const animation = {
        keyframes,
        cancelled: false,
        onfinish: null as null | (() => void),
        oncancel: null as null | (() => void),
        effect: { setKeyframes: (next: Keyframe[]) => (animation.keyframes = next) },
        cancel: () => {
          animation.cancelled = true;
          animation.oncancel?.();
        },
        finish: () => animation.onfinish?.(),
      };
      animations.push(animation);
      return animation;
    },
  };
  const content = { offsetHeight: 600 };
  return { box: box as unknown as HTMLElement, content, style, animations };
}

let resize: () => void = () => undefined;
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) });
});
afterEach(() => vi.unstubAllGlobals());

const watch = (parts: ReturnType<typeof stage>, options: { narrow?: boolean; active?: boolean } = {}) =>
  watchHeightGlide({
    box: parts.box,
    content: parts.content as unknown as HTMLElement,
    isNarrow: () => options.narrow ?? true,
    isActive: () => options.active ?? true,
  });

// On the phone a new status screen changed the height of the checkout at once, and the heading the buyer was reading
// jumped with it
describe('watchHeightGlide', () => {
  it('glides from the height on screen to the new one, up and down, and clips meanwhile', () => {
    const parts = stage();
    watch(parts);
    parts.content.offsetHeight = 685;
    resize();
    expect(parts.animations[0].keyframes).toEqual([{ height: '600px' }, { height: '685px' }]);
    expect(parts.style.get('overflow')).toBe('clip');
    parts.animations[0].finish();
    expect(parts.style.has('overflow')).toBe(false);

    parts.content.offsetHeight = 560;
    resize();
    expect(parts.animations[1].keyframes).toEqual([{ height: '685px' }, { height: '560px' }]);
  });

  it('moves the end of a running glide when the content goes on changing: what a result adds comes in by itself', () => {
    const parts = stage();
    watch(parts);
    parts.content.offsetHeight = 640;
    resize();
    parts.content.offsetHeight = 655;
    resize();
    parts.content.offsetHeight = 712;
    resize();
    expect(parts.animations).toHaveLength(1);
    expect(parts.animations[0].keyframes).toEqual([{ height: '600px' }, { height: '712px' }]);
  });

  it('follows a content that moves by itself, a few pixels a frame, without a glide of its own', () => {
    const parts = stage();
    watch(parts);
    for (const height of [604, 610, 618, 624]) {
      parts.content.offsetHeight = height;
      resize();
    }
    expect(parts.animations).toHaveLength(0);
  });

  it('leaves the height alone on a wide screen, off the status screens and for a reader who asks for less motion', () => {
    for (const options of [{ narrow: false }, { active: false }, { reducedMotion: true }]) {
      const parts = stage();
      reduced = Boolean((options as { reducedMotion?: boolean }).reducedMotion);
      watch(parts, options);
      parts.content.offsetHeight = 700;
      resize();
      expect(parts.animations, JSON.stringify(options)).toHaveLength(0);
      expect(parts.style.has('overflow')).toBe(false);
    }
  });

  it('cancels a running glide and gives the box back when it stops', () => {
    const parts = stage();
    const stop = watch(parts);
    parts.content.offsetHeight = 700;
    resize();
    stop();
    expect(parts.animations[0].cancelled).toBe(true);
    expect(parts.style.has('overflow')).toBe(false);
  });
});
