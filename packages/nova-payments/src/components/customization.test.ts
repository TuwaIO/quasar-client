import type { CheckoutMethod, CheckoutState, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it, vi } from 'vitest';

import type { CheckoutContextValue } from './checkoutContext';
import { checkoutClassName } from './customization';

const checkout = { invoice: { status: 'open' } } as CheckoutView;
const state = { phase: 'selectMethod', checkout } as CheckoutState;
const method = { id: 'usdc-base', symbol: 'USDC', chainId: 'eip155:8453' } as CheckoutMethod;

const context = (customization: CheckoutContextValue['customization']) =>
  ({ customization, screen: 'method', state, checkout }) as Pick<
    CheckoutContextValue,
    'customization' | 'screen' | 'state' | 'checkout'
  >;

describe('checkoutClassName', () => {
  it('passes the screen, the store state and the checkout to the class name function of the part', () => {
    const container = vi.fn(() => 'brand-frame');

    expect(checkoutClassName(context({ classNames: { container } }), 'container')).toBe('brand-frame');
    expect(container).toHaveBeenCalledWith({ screen: 'method', checkoutState: state, checkout });
  });

  it('adds what the part knows, such as the method of an option and whether it is selected', () => {
    const networkOption = vi.fn(({ method: option, selected }: { method: CheckoutMethod; selected: boolean }) =>
      selected ? `chosen-${option.id}` : undefined,
    );
    const ctx = context({ classNames: { networkOption } });

    expect(checkoutClassName(ctx, 'networkOption', { method, selected: true })).toBe('chosen-usdc-base');
    expect(checkoutClassName(ctx, 'networkOption', { method, selected: false })).toBeUndefined();
    expect(networkOption).toHaveBeenCalledWith(
      expect.objectContaining({ screen: 'method', checkoutState: state, checkout, method, selected: true }),
    );
  });

  it('returns nothing for a part without a class name function', () => {
    expect(checkoutClassName(context({}), 'primaryButton')).toBeUndefined();
    expect(
      checkoutClassName(context({ classNames: {} }), 'step', { step: { key: 'pay', state: 'current' }, index: 1 }),
    ).toBeUndefined();
  });
});
