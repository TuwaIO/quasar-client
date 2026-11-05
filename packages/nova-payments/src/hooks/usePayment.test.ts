import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from '../utils/methods';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { OPEN_REQUEST_MS, usePayment } = await import('./usePayment');

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const wallet: CheckoutWallet = {
  address: ACCOUNT,
  chainId: 'eip155:1',
  family: 'eip155',
  connectorType: 'evm:metamask',
  walletId: 'metamask',
  name: 'MetaMask',
  connection: null,
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

  // Cancel closes our window only: a second transaction next to the one waiting in the wallet could pay the invoice twice
  it('does not send a second transaction while the first waits in the wallet', async () => {
    const { transfer, submit, adapter, renderHook } = setup();
    const first = renderHook().pay();
    renderHook().dismiss();
    expect(renderHook().status).toBe('idle');
    const second = renderHook().pay();
    expect(renderHook().status).toBe('wallet');
    await vi.waitFor(() => expect(adapter.sendTransfer).toHaveBeenCalledOnce());
    transfer.resolve('0xhash');
    await Promise.all([first, second]);
    expect(adapter.sendTransfer).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledOnce();
    expect(renderHook().status).toBe('idle');
  });

  it('sends again once the wallet refused the first one', async () => {
    const { transfer, adapter, renderHook } = setup();
    const first = renderHook().pay();
    renderHook().dismiss();
    transfer.reject({ code: 4001, message: 'User rejected' });
    await first;
    void renderHook().pay();
    await vi.waitFor(() => expect(adapter.sendTransfer).toHaveBeenCalledTimes(2));
  });

  it('lets another wallet pay while the last one still has its request open', async () => {
    const { adapter, renderHook, props } = setup();
    void renderHook().pay();
    renderHook().dismiss();
    props.wallet = { ...wallet, address: '0x2222222222222222222222222222222222222222' };
    void renderHook().pay();
    await vi.waitFor(() => expect(adapter.sendTransfer).toHaveBeenCalledTimes(2));
  });

  // A wallet that lost its request (a mobile session that ended) never answers
  it('does not trap the buyer behind a request the wallet never answers', async () => {
    vi.useFakeTimers();
    try {
      const { adapter, renderHook } = setup();
      void renderHook().pay();
      renderHook().dismiss();
      await vi.advanceTimersByTimeAsync(OPEN_REQUEST_MS + 1);
      void renderHook().pay();
      await vi.advanceTimersByTimeAsync(0);
      expect(adapter.sendTransfer).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps naming the wallet asked when the buyer disconnects it while the request waits', () => {
    const { renderHook, props } = setup();
    void renderHook().pay();
    props.wallet = null;
    expect(renderHook().askedWallet).toMatchObject({ name: 'MetaMask' });
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
