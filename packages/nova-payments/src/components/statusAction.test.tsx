import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContextValue } from './checkoutContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let ctx: CheckoutContextValue;
vi.mock('../hooks/useCheckoutContext', () => ({
  useCheckoutContext: () => ctx,
  useOptionalCheckoutContext: () => ctx,
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { useStatusAction } = await import('./statusAction');

type Kind = Parameters<typeof useStatusAction>[0];
const useDrawn = ({ kind, label }: { kind: Kind; label: string }) => useStatusAction(kind, label);
const action = useDrawn as (props: { kind: Kind; label: string }) => ReturnType<typeof useStatusAction>;
const on = (store: object, customization: CheckoutContextValue['customization'] = {}) =>
  (ctx = { ...fixture.checkoutContextValue(customization), store: store as never });

afterEach(() => unmount());

// The footer of a result replaced the footer of the confirm step at once: "Close" was gone and another button stood there
describe('the first action of a status screen', () => {
  it('goes on from the action before it: its label morphs from that one, and its fill comes in over a second action', () => {
    const store = {};
    on(store);
    expect(render(action, { kind: 'secondary', label: 'Close' })).toEqual({ label: 'Close', arrives: false });
    unmount();

    on(store);
    expect(render(action, { kind: 'primary', label: 'Back to {merchant}' })).toEqual({ label: 'Close', arrives: true });
    expect(render(action, { kind: 'primary', label: 'Back to {merchant}' })).toEqual({
      label: 'Back to {merchant}',
      arrives: true,
    });
  });

  it('just stands on the first status screen, and after a screen that showed no action', () => {
    on({});
    expect(render(action, { kind: 'primary', label: 'Close' })).toEqual({ label: 'Close', arrives: false });
    unmount();

    const store = {};
    on(store);
    render(action, { kind: null, label: 'Close' });
    unmount();
    on(store);
    expect(render(action, { kind: 'primary', label: 'Pay again' })).toEqual({ label: 'Pay again', arrives: false });
  });

  it('brings no fill in over another main action, nor with the animations of the checkout off', () => {
    const store = {};
    on(store);
    render(action, { kind: 'primary', label: 'Pay again' });
    unmount();
    on(store);
    expect((render(action, { kind: 'primary', label: 'Close' }) as ReturnType<typeof useDrawn>).arrives).toBe(false);
    unmount();

    const calm = {};
    on(calm);
    render(action, { kind: 'secondary', label: 'Close' });
    unmount();
    on(calm, { config: { animation: { disabled: true } } });
    expect((render(action, { kind: 'primary', label: 'Close' }) as ReturnType<typeof useDrawn>).arrives).toBe(false);
  });
});
