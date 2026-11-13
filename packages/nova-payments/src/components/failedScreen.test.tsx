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

const { HashLink } = await import('@tuwaio/nova-transactions');
const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { FailedScreen } = await import('./FailedScreen');
const { ContactLink } = await import('./OutcomeScreen');
const { DetailRow, PrimaryButton } = await import('./ScreenParts');
const { StatusHead } = await import('./StatusHead');
const { StatusSteps } = await import('./StatusSteps');

type Props = Record<string, unknown>;
const SENT = `0x${'a'.repeat(64)}`;
const REPLACED_BY = `0x${'b'.repeat(64)}`;
const PAYER = '0x1111111111111111111111111111111111111111';

/** USDC on Base locked for a wallet: the payment the page showed on its way. */
const quote = {
  methodId: 'usdc-base',
  payer: `eip155:8453:${PAYER}`,
  cryptoAmountExpected: '89540000',
  amountDue: '89540000',
  amountToSend: '89540000',
  decimals: 6,
  instructions: { family: 'eip155', chainId: 8453, symbol: 'USDC' },
};

/** The failed step after a payment ended with `error`. */
function failed(error: object | null, state: object = {}) {
  const payAfterFailure = vi.fn();
  ctx = fixture.checkoutContextValue(
    {},
    {
      screen: 'failed',
      payAfterFailure,
      adapterFor: () =>
        ({
          family: 'eip155',
          explorerUrl: ({ txKey }: { txKey: string }) => `https://scan.example/tx/${txKey}`,
        }) as never,
      state: {
        ...fixture.checkoutContextValue({}).state,
        phase: 'awaitingPayment',
        quote,
        txKey: SENT,
        txHash: null,
        error,
        ...state,
      } as never,
    },
  );
  return { tree: render(FailedScreen, {}), payAfterFailure };
}
const reverted = { code: 'payment_failed', reason: 'reverted', message: 'failed' };

afterEach(() => unmount());

// A payment that failed for good threw the buyer back to the pay step, with a line of red text where the status had
// been a second before
describe('the failed step', () => {
  it('keeps the head of the confirm step and turns it to a failure: the mark, the chip, the heading, the amount', () => {
    const { tree } = failed(reverted);
    expect(fixture.ofType(tree, StatusHead)[0].props).toEqual({
      mark: 'failed',
      tone: 'error',
      chip: 'Failed',
      title: 'Payment failed',
      amount: '89.54 USDC',
      note: 'on Base · the invoice is still open',
    });
    expect(fixture.ofType(tree, StatusSteps)[0].props).toEqual({ state: 'failed' });
  });

  it('names the network, the transaction with its explorer link and the sender', () => {
    const { tree } = failed(reverted);
    const rows = fixture.ofType(tree, DetailRow) as ReactElement<Props>[];
    expect(rows.map((row) => row.props.name)).toEqual(['Network', 'Transaction', 'From']);
    const links = fixture.ofType(tree, HashLink).map((link) => link.props as Props);
    expect(links[0]).toMatchObject({ hash: SENT, explorerUrl: `https://scan.example/tx/${SENT}` });
    expect(links[1]).toMatchObject({ hash: PAYER });
  });

  it('names the transaction Quasar says failed, when the wallet sent it under another hash', () => {
    const { tree } = failed({ ...reverted, txKey: REPLACED_BY });
    expect(fixture.ofType(tree, HashLink)[0].props).toMatchObject({
      hash: REPLACED_BY,
      explorerUrl: `https://scan.example/tx/${REPLACED_BY}`,
    });
  });

  it('says why in the words of the reason: a fee was spent only when the network reverted it', () => {
    const said = (error: object) => {
      const { tree } = failed(error);
      const text = fixture.elements(tree).find((element) => element.props.role === 'status');
      unmount();
      return fixture.text(text);
    };
    expect(said(reverted)).toBe(
      'The payment failed on Base. Only the network fee was spent; the invoice is still open.',
    );
    expect(said({ code: 'payment_failed', reason: 'expired', message: '' })).toBe(ctx.labels.pay.failedExpired);
    expect(said({ code: 'payment_failed', reason: 'cancelled', message: '' })).toBe(ctx.labels.pay.failedCancelled);
    expect(said({ code: 'payment_failed', message: '' })).toBe(ctx.labels.pay.didNotGoThrough);
  });

  it('offers to pay again, which leaves the step, and to contact the seller', () => {
    const { tree, payAfterFailure } = failed(reverted);
    const [again] = fixture.ofType(tree, PrimaryButton) as ReactElement<{ onClick: () => void; children: string }>[];
    expect(again.props.children).toBe('Pay again');
    again.props.onClick();
    expect(payAfterFailure).toHaveBeenCalledOnce();
    expect(fixture.ofType(tree, ContactLink)).toHaveLength(1);
  });

  it('shows nothing without the failure of a payment', () => {
    expect(failed(null).tree).toBeNull();
  });
});
