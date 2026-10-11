import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from '../utils/methods';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { usePayment } = await import('./usePayment');

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const wallet: CheckoutWallet = {
  address: ACCOUNT,
  chainId: 'eip155:1',
  family: 'eip155',
  connectorType: 'evm:metamask',
  walletId: 'metamask',
  name: 'MetaMask',
};
const quote = {
  instructions: { family: 'eip155', chainId: 8453, to: '0x2', token: '0x3', amount: '1', decimals: 6, symbol: 'USDC' },
  gasless: null,
} as unknown as CheckoutQuote;

/** A promise to settle from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

const setup = () => {
  const transfer = deferred<string>();
  const submit = vi.fn(async () => true);
  const adapter: PaymentsAdapter = {
    family: 'eip155',
    getBalance: vi.fn(async () => 0n),
    sendTransfer: vi.fn(() => transfer.promise),
    switchChain: vi.fn(async () => undefined),
  };
  const store = { getState: () => ({ submit, relay: vi.fn(async () => true) }) };
  const props: Parameters<typeof usePayment>[0] = {
    adapter,
    store,
    quote,
    wallet,
    path: 'transfer',
    paymasterUrl: null,
  };
  const renderHook = () => render(usePayment, props) as ReturnType<typeof usePayment>;
  return { transfer, submit, adapter, renderHook, props };
};

afterEach(unmount);

describe('usePayment', () => {
  it('waits for the wallet, then hands the payment to Quasar', async () => {
    const { transfer, submit, renderHook } = setup();
    const paying = renderHook().pay();
    expect(renderHook().status).toBe('wallet');
    transfer.resolve('0xhash');
    await paying;
    expect(submit).toHaveBeenCalledWith({ txKey: '0xhash', connectorType: 'evm:metamask' });
    expect(renderHook()).toMatchObject({ status: 'idle', problem: null });
  });

  it('tells the checkout which transaction the wallet sent', async () => {
    const { transfer, renderHook, props } = setup();
    const onSent = vi.fn();
    props.onSent = onSent;
    const paying = renderHook().pay();
    transfer.resolve('0xhash');
    await paying;
    expect(onSent).toHaveBeenCalledWith({
      txKey: '0xhash',
      instructions: quote.instructions,
      account: ACCOUNT,
      connectorType: 'evm:metamask',
    });
  });

  it('says why the wallet did not pay', async () => {
    const { transfer, renderHook } = setup();
    const paying = renderHook().pay();
    transfer.reject({ code: 4001, message: 'User rejected' });
    await paying;
    expect(renderHook()).toMatchObject({ status: 'idle', problem: 'declined' });
  });

  it('closes the wallet window on cancel, but still hands over a transaction the wallet sends later', async () => {
    const { transfer, submit, renderHook } = setup();
    const paying = renderHook().pay();
    renderHook().dismiss();
    expect(renderHook().status).toBe('idle');
    transfer.resolve('0xlate');
    await paying;
    expect(submit).toHaveBeenCalledWith({ txKey: '0xlate', connectorType: 'evm:metamask' });
    expect(renderHook().status).toBe('idle');
  });

  it("forgets the wallet's refusal after a cancel", async () => {
    const { transfer, renderHook } = setup();
    const paying = renderHook().pay();
    renderHook().dismiss();
    transfer.reject(new Error('User rejected the request'));
    await paying;
    expect(renderHook().problem).toBeNull();
  });

  it("switches the wallet to the quote's chain", async () => {
    const { adapter, renderHook } = setup();
    const switching = renderHook().switchNetwork();
    expect(renderHook().status).toBe('switching');
    await switching;
    expect(adapter.switchChain).toHaveBeenCalledWith('eip155:8453');
    expect(renderHook().status).toBe('idle');
  });
});
