import type { ReactElement } from 'react';
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
const { defaultLabels } = await import('../i18n');
const { methodErrorText } = await import('../utils/outcome');
const { PrimaryButton } = await import('./ScreenParts');
const { MethodScreen } = await import('./MethodScreen');

type Props = Record<string, unknown>;
const TEXT = 'I ask Cosmos to start at once and understand what that means if I withdraw.';

/** The method step of a checkout whose seller asks a consent, ticked or not. */
function methodStep(
  consent: { text: string; required: boolean } | null,
  consentGiven = false,
  classNames: CheckoutContextValue['customization']['classNames'] = {},
) {
  const { actions, store } = fixture.fakeStore();
  const checkout = { ...fixture.checkout, consent } as typeof fixture.checkout;
  ctx = fixture.checkoutContextValue(
    { classNames },
    { checkout, store, state: { ...fixture.checkoutContextValue({}).state, checkout, consentGiven } },
  );
  const tree = render(MethodScreen, {});
  const box = fixture
    .elements(tree)
    .find((element) => element.type === 'input' && element.props.type === 'checkbox') as
    ReactElement<Props> | undefined;
  const button = fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>;
  return { tree, box, button, actions };
}

/** The text of the rendered tree. */
const textOf = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => [element.props.children].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');

afterEach(() => unmount());

// Quasar plan 12 §9.8: the line the seller asks the buyer to tick before paying
describe('the consent of the method step', () => {
  it('asks nothing when the seller set no consent', () => {
    const { box, button } = methodStep(null);
    expect(box).toBeUndefined();
    expect(button.props.disabled).toBe(false);
  });

  it('keeps Continue off until the buyer ticks a required consent, and says why', () => {
    const { box, button, tree } = methodStep({ text: TEXT, required: true });
    expect(box?.props).toMatchObject({ checked: false, required: true });
    // Named by the seller's words, described by the hint
    const named = fixture.elements(tree).find((element) => element.props.id === box?.props['aria-labelledby']);
    const hint = fixture.elements(tree).find((element) => element.props.id === box?.props['aria-describedby']);
    expect(named?.props.children).toBe(TEXT);
    expect(hint?.props.children).toBe(defaultLabels.method.consentRequired);
    expect(textOf(tree)).toContain(TEXT);
    expect(textOf(tree)).toContain(defaultLabels.method.consentRequired);
    expect(button.props.disabled).toBe(true);

    const ticked = methodStep({ text: TEXT, required: true }, true);
    expect(ticked.box?.props.checked).toBe(true);
    expect(ticked.button.props.disabled).toBe(false);
    // The hint stays, so ticking moves nothing
    expect(textOf(ticked.tree)).toContain(defaultLabels.method.consentRequired);
  });

  it('tells the store when the buyer ticks or clears it', () => {
    const { box, actions } = methodStep({ text: TEXT, required: true });
    (box?.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    expect(actions.setConsentGiven).toHaveBeenCalledWith(true);
  });

  it('lets the buyer continue without an optional consent', () => {
    const { box, button, tree } = methodStep({ text: 'Send me the news of Cosmos.', required: false });
    expect(box?.props).toMatchObject({ checked: false, required: false });
    expect(button.props.disabled).toBe(false);
    expect(textOf(tree)).not.toContain(defaultLabels.method.consentRequired);
  });

  it('gives the consent card its classes', () => {
    const { tree } = methodStep({ text: TEXT, required: true }, true, {
      consentOption: ({ checked, required }) => `consent-${checked}-${required}`,
    });
    expect(fixture.hasClass(tree, 'consent-true-true')).toBe(true);
  });

  it('explains a refusal for a missing consent', () => {
    expect(methodErrorText({ code: 'consent_required', message: 'x' }, defaultLabels)).toBe(
      defaultLabels.method.consentRequired,
    );
  });
});
