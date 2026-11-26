import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { CheckoutStepper } = await import('./CheckoutStepper');
const { defaultLabels: en } = await import('../i18n/en');
const { esLabels: es } = await import('../i18n/es');

type Steps = Parameters<typeof CheckoutStepper>[0]['steps'];
const steps = [
  { key: 'method', state: 'current' },
  { key: 'pay', state: 'upcoming' },
  { key: 'confirm', state: 'upcoming' },
] as unknown as Steps;

/** Attaches what the steps are measured by: the box with its padding, the list in it, and the names in one line. */
function measured(sizes: { box: number; list: number; names: number }) {
  const tree = render(CheckoutStepper, { steps, labels: en });
  const refs = fixture
    .elements(tree)
    .map((element) => element as ReactElement<{ ref?: { current: unknown } }>)
    .filter(({ props }) => props.ref);
  for (const { type, props } of refs) {
    const size =
      type === 'nav'
        ? { clientWidth: sizes.box }
        : type === 'ol'
          ? { clientWidth: sizes.list }
          : { offsetWidth: sizes.names };
    props.ref!.current = size;
  }
  // Other names are measured again
  render(CheckoutStepper, { steps, labels: es });
  return render(CheckoutStepper, { steps, labels: es });
}
/** The names only a screen reader reads. */
const hidden = (tree: unknown) =>
  fixture
    .elements(tree)
    .filter((element) => {
      const { className, children } = element.props as { className?: string; children?: unknown };
      return (
        String(className ?? '')
          .split(' ')
          .includes('novapay:sr-only') && typeof children === 'string'
      );
    })
    .map((element) => (element.props as { children: string }).children)
    .filter((name) => Object.values(es.steps).includes(name));

describe('the names of the steps', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    unmount();
    vi.unstubAllGlobals();
  });

  // Measured against the box with its padding, the last name of a long language ended in three points on a narrow phone
  it('are of the current step alone where the list has no room for all of them', () => {
    expect(hidden(measured({ box: 320, list: 288, names: 174 }))).toEqual([es.steps.pay, es.steps.confirm]);
  });

  it('are all of them where the list has the room', () => {
    for (const [list, names] of [
      [293, 174],
      [328, 198],
    ]) {
      expect(hidden(measured({ box: list + 32, list, names }))).toEqual([]);
      unmount();
    }
  });
});
