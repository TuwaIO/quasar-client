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
const autoReturn = vi.hoisted(() => ({ seconds: [] as number[] }));
vi.mock('../hooks/useOutcomeEffects', async () => ({
  ...(await vi.importActual<object>('../hooks/useOutcomeEffects')),
  useAutoReturn: ({ seconds }: { seconds: number }) => {
    autoReturn.seconds.push(seconds);
    return { left: seconds > 0 ? seconds : null, stay: vi.fn() };
  },
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { DetailRow, PrimaryButton, SecondaryButton } = await import('./ScreenParts');
const { PaidScreen } = await import('./PaidScreen');
const { StatusHead } = await import('./StatusHead');

type Props = Record<string, unknown>;
const SUCCESS = 'https://shop.example/billing';

/** The paid outcome of an invoice with a way back to the seller, shown as `display`. */
function paid(
  display: CheckoutContextValue['display'],
  autoReturnSeconds: number,
  options: { openedPaid?: boolean } = {},
) {
  autoReturn.seconds = [];
  const checkout = {
    ...fixture.checkout,
    invoice: { ...fixture.checkout.invoice, status: 'paid', successUrl: SUCCESS },
  } as typeof fixture.checkout;
  const close = vi.fn();
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      display,
      close,
      autoReturnSeconds,
      openedPaid: options.openedPaid ?? false,
      state: { ...fixture.checkoutContextValue({}).state, checkout, phase: 'paid' } as never,
    },
  );
  const tree = render(PaidScreen, {});
  const links = fixture.elements(tree).filter((element) => element.type === 'a' && element.props.href === SUCCESS);
  return { tree, close, links };
}

afterEach(() => unmount());

// After paying for quota in the dashboard, the checkout counted down and loaded the billing page again
// (its successUrl), closing everything at once. A checkout opened as a modal belongs to the page under it
// Found on the stand: a receipt opened from its link hours after the payment said it came just now
describe('the time of a paid invoice', () => {
  const textOf = (tree: unknown) =>
    fixture
      .elements(tree as never)
      .flatMap((element) => (typeof element.props.children === 'string' ? [element.props.children] : []))
      .join(' ');
  const inTree = (tree: unknown) =>
    JSON.stringify(tree, (_key, value) => (typeof value === 'function' ? undefined : value));

  it('is when it was paid, not when the page was opened', () => {
    const paidAt = '2020-03-14T09:26:00.000Z';
    autoReturn.seconds = [];
    const checkout = {
      ...fixture.checkout,
      invoice: { ...fixture.checkout.invoice, status: 'paid', paidAt },
    } as typeof fixture.checkout;
    ctx = fixture.checkoutContextValue(
      {},
      {
        checkout,
        openedPaid: true,
        state: { ...fixture.checkoutContextValue({}).state, checkout, phase: 'paid' } as never,
      },
    );
    const tree = render(PaidScreen, {});
    const date = new Intl.DateTimeFormat(ctx.locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      Date.parse(paidAt),
    );
    expect(inTree(tree) + textOf(tree)).toContain(date);
  });
});

describe('the amount of a paid invoice', () => {
  const rest = {
    methodId: 'usdc-base',
    payer: null,
    cryptoAmountExpected: '89540000',
    amountDue: '9540000',
    amountToSend: '9540000',
    decimals: 6,
    instructions: { family: 'eip155', chainId: 8453, symbol: 'USDC' },
  };

  it('is the whole invoice after a rest, not only the last transfer', () => {
    paid('page', 0);
    ctx = { ...ctx, state: { ...ctx.state, quote: rest } as never };
    const head = fixture.ofType(render(PaidScreen, {}), StatusHead)[0].props as { amount: string };
    expect(head.amount).toBe('89.54 USDC');
  });
});

// The paid step named one transaction, the last one: an invoice paid in parts has more, and only its receipt listed them
describe('the transfers of a paid invoice', () => {
  const FIRST = `0x${'a'.repeat(64)}`;
  const SECOND = `0x${'b'.repeat(64)}`;
  const transfer = (txKey: string, amount: string, at: string) => ({
    txKey,
    chainId: 'eip155:8453',
    amount,
    symbol: 'USDC',
    decimals: 6,
    from: '0x1111111111111111111111111111111111111111',
    at,
  });
  const parts = [
    transfer(FIRST, '80000000', '2026-10-08T12:01:00.000Z'),
    transfer(SECOND, '9540000', '2026-10-08T12:05:00.000Z'),
  ];
  const rest = {
    methodId: 'usdc-base',
    payer: null,
    cryptoAmountExpected: '89540000',
    amountDue: '9540000',
    amountToSend: '9540000',
    decimals: 6,
    instructions: { family: 'eip155', chainId: 8453, symbol: 'USDC' },
  };

  /** The rows of the paid step that name a transaction: the name of each row, what it shows and its hash. */
  const transactionRows = (payments: unknown, state: object = {}) => {
    paid('page', 0);
    const checkout = { ...ctx.checkout, invoice: { ...ctx.checkout?.invoice, payments } } as typeof fixture.checkout;
    ctx = { ...ctx, checkout, state: { ...ctx.state, checkout, ...state } as never };
    return (fixture.ofType(render(PaidScreen, {}), DetailRow) as ReactElement<Props>[]).flatMap((row) => {
      const hashes = fixture
        .elements(row.props.children)
        .flatMap((element) => (typeof element.props.hash === 'string' ? [element.props.hash] : []));
      const name = fixture.text(row.props.name);
      return hashes.length > 0 && !name.startsWith('From')
        ? [{ name, shows: fixture.text(row.props.children), hash: hashes[0] }]
        : [];
    });
  };

  it('are all listed when it was paid in parts: each with its number, its time and its amount', () => {
    const rows = transactionRows(parts, { quote: rest, txHash: SECOND });
    const time = (at: string) =>
      new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
        Date.parse(at),
      );
    expect(rows).toEqual([
      { name: `Transfer 1 of 2${time(parts[0].at)}`, shows: '80.00 USDC', hash: FIRST },
      { name: `Transfer 2 of 2${time(parts[1].at)}`, shows: '9.54 USDC', hash: SECOND },
    ]);
  });

  it('is the one row it was, for an invoice paid by one transfer', () => {
    expect(transactionRows([parts[0]], { txHash: FIRST })).toEqual([{ name: 'Transaction', shows: '', hash: FIRST }]);
  });

  it('names the transfer on a receipt opened from its link, where the page handed nothing over', () => {
    expect(transactionRows([parts[0]])).toEqual([{ name: 'Transaction', shows: '', hash: FIRST }]);
  });

  it('is the last transfer, as before, with a Quasar that does not list them', () => {
    expect(transactionRows(undefined, { quote: rest, txHash: SECOND })).toEqual([
      { name: 'Last transfer', shows: '', hash: SECOND },
    ]);
  });
});

describe('the way back after paying', () => {
  it('in a modal: Close, no countdown and no link that loads the page again', () => {
    const { tree, close, links } = paid('modal', 0);
    expect(links).toHaveLength(0);
    expect(autoReturn.seconds.every((seconds) => seconds === 0)).toBe(true);
    const buttons = [
      ...fixture.ofType(tree, PrimaryButton),
      ...fixture.ofType(tree, SecondaryButton),
    ] as ReactElement<Props>[];
    const closeButton = buttons.find((button) => button.props.onClick === close);
    expect(closeButton).toBeDefined();
    expect(closeButton?.type).toBe(PrimaryButton);
  });

  it('on the payment page: back to the seller with the countdown, as before', () => {
    const { links } = paid('page', 5);
    expect(links).toHaveLength(1);
    expect(autoReturn.seconds).toContain(5);
  });

  it('opened on an invoice already paid: its receipt stays, the link in the email leads nowhere else', () => {
    const { links } = paid('page', 5, { openedPaid: true });
    expect(links).toHaveLength(1);
    expect(autoReturn.seconds.every((seconds) => seconds === 0)).toBe(true);
  });

  it('in a modal whose app asks for the return: back to the seller with the countdown', () => {
    const { links } = paid('modal', 5);
    expect(links).toHaveLength(1);
    expect(autoReturn.seconds).toContain(5);
  });
});
