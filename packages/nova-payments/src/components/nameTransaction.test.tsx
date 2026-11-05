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
const { NameTransaction } = await import('./NameTransaction');
const { FooterAction, ScreenError } = await import('./ScreenParts');

const HASH = `0x${'ab'.repeat(32)}`;
const event = { preventDefault: () => {} };
type Handlers = { onClick: () => void; onChange: (e: unknown) => void; onSubmit: (e: unknown) => void };

function setup(family: 'eip155' | 'solana', submit = vi.fn(async () => true)) {
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout: { ...fixture.checkout, quote: { instructions: { family } } } as never,
      store: { getState: () => ({ submit }) } as never,
      wallet: { address: '0xbuyer' } as never,
    },
  );
  const open = () => {
    const tree = render(NameTransaction, {});
    (fixture.ofType(tree, FooterAction)[0].props as Handlers).onClick();
  };
  const type = (value: string) => {
    const input = fixture.elements(render(NameTransaction, {})).find((element) => element.type === 'input')!;
    (input.props as Handlers).onChange({ target: { value } });
  };
  const send = async () => {
    const form = fixture.elements(render(NameTransaction, {})).find((element) => element.type === 'form')!;
    (form.props as Handlers).onSubmit(event);
    await vi.waitFor(() => undefined);
    await Promise.resolve();
  };
  const errors = () =>
    fixture.ofType(render(NameTransaction, {}), ScreenError).map((element) => element.props.children);
  return { submit, open, type, send, errors };
}

describe('naming the transaction the wallet shows', () => {
  afterEach(() => unmount());

  it('hands over the hash the buyer names: Quasar reads it from the chain, naming it proves nothing', async () => {
    const { submit, open, type, send } = setup('eip155');
    open();
    type(` ${HASH} `);
    await send();
    expect(submit).toHaveBeenCalledWith({ txKey: HASH, from: '0xbuyer' });
  });

  it('asks nothing of Quasar for what is no transaction of this network', async () => {
    const { submit, open, type, send, errors } = setup('solana');
    open();
    type(HASH);
    await send();
    expect(submit).not.toHaveBeenCalled();
    expect(errors()).toEqual([defaultLabels.outcome.nameHashInvalid]);
  });

  it('says so when Quasar does not take it, in the language of the checkout', async () => {
    const { open, type, send, errors } = setup(
      'eip155',
      vi.fn(async () => false),
    );
    open();
    type(HASH);
    await send();
    expect(errors()).toEqual([defaultLabels.outcome.nameHashRefused]);
  });

  it('shows nothing without a locked price, as Quasar takes a transaction only then', () => {
    ctx = fixture.checkoutContextValue({}, { checkout: { ...fixture.checkout, quote: null } as never });
    expect(render(NameTransaction, {})).toBeNull();
  });
});
