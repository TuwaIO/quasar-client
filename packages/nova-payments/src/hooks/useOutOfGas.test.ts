import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContextValue } from '../components/checkoutContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let ctx: CheckoutContextValue;
vi.mock('./useCheckoutContext', () => ({
  useCheckoutContext: () => ctx,
  useOptionalCheckoutContext: () => ctx,
}));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { useOutOfGas } = await import('./useOutOfGas');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const TX = `0x${'a'.repeat(64)}`;
/** ETH on Sepolia to a merchant with an EIP-7702 delegation. */
const instructions = {
  family: 'eip155',
  chainId: 11155111,
  to: '0xAd9A211D227d2D9c1B5573f73CDa0284b758Ac0C',
  token: 'native',
  amount: '600000000000000',
  decimals: 18,
  symbol: 'ETH',
};
const reverted = { code: 'payment_failed', message: '', reason: 'reverted', txKey: TX };

/** Reads the hook in a checkout whose EVM adapter has `outOfGas`, with the price `quote` locked. */
function hook(outOfGas: ((params: unknown) => Promise<unknown>) | undefined, quote: object | null = { instructions }) {
  ctx = fixture.checkoutContextValue(
    {},
    {
      adapterFor: () => ({ family: 'eip155', outOfGas }) as never,
      state: { ...fixture.checkoutContextValue({}).state, quote } as never,
    },
  );
  return (error: object | null, txKey: string | null = TX) =>
    render(({ e, k }: { e: object | null; k: string | null }) => useOutOfGas(e as never, k), { e: error, k: txKey });
}

afterEach(() => unmount());

// A wallet set a gas limit of its own below what the transfer takes; the page said only that the payment failed
describe('useOutOfGas', () => {
  it('asks the adapter of the locked price once per transaction, and gives its answer', async () => {
    const outOfGas = vi.fn(async () => ({ needed: 30_492n }));
    const read = hook(outOfGas);
    expect(read(reverted)).toBeNull();
    await flush();
    expect(read(reverted)).toEqual({ needed: 30_492n });
    expect(read(reverted)).toEqual({ needed: 30_492n });
    expect(outOfGas).toHaveBeenCalledOnce();
    expect(outOfGas).toHaveBeenCalledWith({ instructions, txKey: TX });
  });

  it('asks nothing of a payment that failed in another way, without its transaction or without a locked price', async () => {
    const outOfGas = vi.fn(async () => ({ needed: 30_492n }));
    const cases: Array<[object | null, string | null, object | null]> = [
      [{ ...reverted, reason: 'expired' }, TX, { instructions }],
      [{ ...reverted, reason: 'cancelled' }, TX, { instructions }],
      [{ ...reverted, code: 'payment_mismatch', reason: 'no_matching_transfer' }, TX, { instructions }],
      [reverted, null, { instructions }],
      [null, TX, { instructions }],
      [reverted, TX, null],
    ];
    for (const [error, txKey, quote] of cases) {
      const read = hook(outOfGas, quote);
      read(error, txKey);
      await flush();
      expect(read(error, txKey)).toBeNull();
      unmount();
    }
    expect(outOfGas).not.toHaveBeenCalled();
  });

  it('gives nothing with an adapter that cannot tell, or when the read failed', async () => {
    expect(hook(undefined)(reverted)).toBeNull();
    unmount();
    const read = hook(
      vi.fn(async () => {
        throw new Error('rpc down');
      }),
    );
    read(reverted);
    await flush();
    expect(read(reverted)).toBeNull();
  });
});
