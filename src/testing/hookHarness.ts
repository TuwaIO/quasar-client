/**
 * @file A minimal renderer of one component for tests: the package has no DOM testing library. Mock `react` with
 * `hooks` (keeping the other exports), then call `render` several times and `unmount`. Hooks keep their state between
 * renders in call order, effects compare their dependencies, and `useEffectEvent` returns a stable function that calls
 * the callback of the latest render. This module must not import `react`.
 */

type Slot = { deps?: readonly unknown[]; value?: unknown; cleanup?: unknown; latest?: (...args: unknown[]) => unknown };

const slots: Slot[] = [];
let index = 0;
const pendingEffects: Array<() => void> = [];

const depsChanged = (prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined) =>
  !prev || !next || prev.length !== next.length || prev.some((dep, i) => !Object.is(dep, next[i]));

const nextSlot = (): Slot => {
  slots[index] ??= {};
  return slots[index++];
};

/** Hook implementations for the `react` mock. */
export const hooks = {
  useState(initial: unknown) {
    const slot = nextSlot();
    if (!('value' in slot)) slot.value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [slot.value, (next: unknown) => (slot.value = next)];
  },
  useRef(initial: unknown) {
    const slot = nextSlot();
    if (!('value' in slot)) slot.value = { current: initial };
    return slot.value;
  },
  useMemo(factory: () => unknown, deps: readonly unknown[]) {
    const slot = nextSlot();
    if (depsChanged(slot.deps, deps)) {
      slot.value = factory();
      slot.deps = deps;
    }
    return slot.value;
  },
  useCallback(callback: unknown, deps: readonly unknown[]) {
    return hooks.useMemo(() => callback, deps);
  },
  useEffect(effect: () => unknown, deps?: readonly unknown[]) {
    const slot = nextSlot();
    if (depsChanged(slot.deps, deps)) {
      slot.deps = deps;
      pendingEffects.push(() => {
        if (typeof slot.cleanup === 'function') slot.cleanup();
        slot.cleanup = effect();
      });
    }
  },
  useEffectEvent(callback: (...args: unknown[]) => unknown) {
    const slot = nextSlot();
    slot.latest = callback;
    if (!('value' in slot)) slot.value = (...args: unknown[]) => slot.latest!(...args);
    return slot.value;
  },
  useId() {
    const slot = nextSlot();
    if (!('value' in slot)) slot.value = `id-${index}`;
    return slot.value;
  },
};

/**
 * Renders the component (a function component, or the `render` function of a `forwardRef` component) and runs the
 * effects whose dependencies changed.
 *
 * @param component - The component.
 * @param props - Its props.
 * @returns The rendered element tree.
 */
export function render<P>(component: (props: P, ref?: null) => unknown, props: P): unknown {
  index = 0;
  const output = component(props, null);
  while (pendingEffects.length) pendingEffects.shift()!();
  return output;
}

/** Runs the effect cleanups and forgets the state. */
export function unmount(): void {
  for (const slot of slots) if (typeof slot.cleanup === 'function') slot.cleanup();
  slots.length = 0;
  pendingEffects.length = 0;
}
