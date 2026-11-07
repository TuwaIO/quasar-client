import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from '../utils/methods';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { isPaymentAccepted, OPEN_REQUEST_MS, usePayment } = await import('./usePayment');
const { PaymentWalletError } = await import('../utils/walletErrors');

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  // The guard lives with the checkout store: PayScreen unmounts on every screen change, and a request in the wallet stays
  it('does not send a second transaction after the pay step was left and opened again', async () => {
    const { transfer, adapter, renderHook } = setup();
    const first = renderHook().pay();
    renderHook().dismiss();
    unmount();
    const second = renderHook().pay();
    await vi.waitFor(() => expect(adapter.sendTransfer).toHaveBeenCalledOnce());
    transfer.resolve('0xhash');
    await Promise.all([first, second]);
    expect(adapter.sendTransfer).toHaveBeenCalledOnce();
  });

  // Who pays the gas does not change what the buyer may approve twice: both requests move money
  it('asks for no gasless signature while a transaction waits in the wallet', async () => {
    const { transfer, adapter, renderHook, props } = setup();
    adapter.signTransferAuthorization = vi.fn(async () => '0xsigned');
    const relayQuote = { ...quote, gasless: { relay: { typedData: {} } } } as unknown as CheckoutQuote;
    const first = renderHook().pay();
    renderHook().dismiss();
    props.path = 'relay';
    props.quote = relayQuote;
    const second = renderHook().pay();
    await tick();
    expect(adapter.signTransferAuthorization).not.toHaveBeenCalled();
    transfer.resolve('0xhash');
    await Promise.all([first, second]);
  });

  it('sends no transaction while a gasless signature waits in the wallet', async () => {
    const { adapter, renderHook, props } = setup();
    const signature = deferred<string>();
    adapter.signTransferAuthorization = vi.fn(() => signature.promise);
    props.path = 'relay';
    props.quote = { ...quote, gasless: { relay: { typedData: {} } } } as unknown as CheckoutQuote;
    const first = renderHook().pay();
    renderHook().dismiss();
    props.path = 'transfer';
    const second = renderHook().pay();
    await tick();
    expect(adapter.sendTransfer).not.toHaveBeenCalled();
    signature.resolve('0xsigned');
    await Promise.all([first, second]);
  });

  it('asks for a gasless signature again: a repeat of the same signature moves nothing twice', async () => {
    const { adapter, renderHook, props } = setup();
    const signature = deferred<string>();
    adapter.signTransferAuthorization = vi.fn(() => signature.promise);
    props.path = 'relay';
    props.quote = { ...quote, gasless: { relay: { typedData: {} } } } as unknown as CheckoutQuote;
    const first = renderHook().pay();
    renderHook().dismiss();
    const second = renderHook().pay();
    await vi.waitFor(() => expect(adapter.signTransferAuthorization).toHaveBeenCalledTimes(2));
    signature.resolve('0xsigned');
    await Promise.all([first, second]);
  });

  // "Do not pay again" must hold after Back and a new price: the sponsored batch can still land
  it('keeps saying the payment may have gone out after the pay step was left, and asks the wallet nothing', async () => {
    const { adapter, renderHook, props } = setup();
    const unconfirmed = Object.assign(new PaymentWalletError('sentUnconfirmed', 'not confirmed yet'));
    adapter.sendSponsoredCalls = vi.fn(async () => {
      throw unconfirmed;
    });
    props.path = 'paymaster';
    props.paymasterUrl = 'https://quasar/paymaster';
    props.quote = { ...quote, gasless: { paymaster: { calls: [] } } } as unknown as CheckoutQuote;
    await renderHook().pay();
    expect(renderHook().problem).toBe('sentUnconfirmed');
    unmount();
    expect(renderHook().problem).toBe('sentUnconfirmed');
    await renderHook().pay();
    expect(adapter.sendSponsoredCalls).toHaveBeenCalledOnce();
    expect(renderHook().problem).toBe('sentUnconfirmed');
  });

  // The page must not name a price the wallet does not show: the buyer is told to check it there
  it('names what the wallet was asked to send after a new price on the page', async () => {
    const { transfer, renderHook, props } = setup();
    const first = renderHook().pay();
    renderHook().dismiss();
    const newer = {
      ...quote,
      instructions: { ...quote.instructions, amount: '2' },
    } as unknown as CheckoutQuote;
    props.quote = newer;
    const second = renderHook().pay();
    expect(renderHook().askedInstructions?.amount).toBe('1');
    transfer.resolve('0xhash');
    await Promise.all([first, second]);
  });

  it('counts a sponsored batch the wallet took as on its way, with no hash yet', async () => {
    const { adapter, renderHook, props } = setup();
    let finish!: () => void;
    adapter.sendSponsoredCalls = vi.fn(async ({ onSent }) => {
      onSent?.();
      await new Promise<void>((resolve) => (finish = resolve));
      return '0xhash';
    });
    props.path = 'paymaster';
    props.paymasterUrl = 'https://quasar/paymaster';
    props.quote = { ...quote, gasless: { paymaster: { calls: [] } } } as unknown as CheckoutQuote;
    expect(isPaymentAccepted(props.store)).toBe(false);
    const paying = renderHook().pay();
    await vi.waitFor(() => expect(isPaymentAccepted(props.store)).toBe(true));
    finish();
    await paying;
    expect(isPaymentAccepted(props.store)).toBe(false);
  });

  // A batch has no hash for the hand-over storage of the store: a reload must not reopen Pay next to it
  describe('a sponsored batch the wallet took, after a reload', () => {
    const memory = () => {
      const items = new Map<string, string>();
      return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
      };
    };
    const paymasterQuote = {
      ...quote,
      methodId: 'ap_1',
      gasless: { paymaster: { calls: [] } },
    } as unknown as CheckoutQuote;
    afterEach(() => vi.unstubAllGlobals());

    const paidBeforeTheReload = async () => {
      vi.stubGlobal('sessionStorage', memory());
      const { adapter, renderHook, props } = setup();
      adapter.sendSponsoredCalls = vi.fn(async ({ onAccepted, onSent }) => {
        onAccepted?.('batch-1');
        onSent?.();
        throw new PaymentWalletError('sentUnconfirmed', 'not confirmed yet');
      });
      Object.assign(props, {
        path: 'paymaster',
        paymasterUrl: 'https://quasar/paymaster',
        quote: paymasterQuote,
        invoiceId: 'inv_1',
      });
      await renderHook().pay();
      unmount();
    };

    it('keeps Pay shut, asks the wallet nothing and hands over the hash when it comes', async () => {
      await paidBeforeTheReload();
      const reloaded = setup();
      const sendSponsoredCalls = vi.fn(async () => '0xsecond');
      let lands!: (txKey: string) => void;
      const followSponsoredCalls = vi.fn(({ onLate }: { onLate: (txKey: string) => void }) => {
        lands = onLate;
      });
      Object.assign(reloaded.adapter, { sendSponsoredCalls, followSponsoredCalls });
      Object.assign(reloaded.props, {
        path: 'paymaster',
        paymasterUrl: 'https://quasar/paymaster',
        quote: paymasterQuote,
        invoiceId: 'inv_1',
      });
      expect(reloaded.renderHook().problem).toBe('sentUnconfirmed');
      await tick();
      expect(followSponsoredCalls).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'batch-1' }));
      await reloaded.renderHook().pay();
      expect(sendSponsoredCalls).not.toHaveBeenCalled();
      lands('0xlate');
      expect(reloaded.submit).toHaveBeenCalledWith(expect.objectContaining({ txKey: '0xlate', methodId: 'ap_1' }));
      expect(sessionStorage.getItem('nova-payments:sponsoredBatches')).toBeNull();
    });

    it('says nothing of it for another invoice', async () => {
      await paidBeforeTheReload();
      const reloaded = setup();
      Object.assign(reloaded.props, { invoiceId: 'inv_2' });
      expect(reloaded.renderHook().problem).toBeNull();
    });

    it('lets it go once the wait is over', async () => {
      await paidBeforeTheReload();
      const later = Date.now() + 36 * 60_000;
      const now = vi.spyOn(Date, 'now').mockReturnValue(later);
      try {
        const reloaded = setup();
        Object.assign(reloaded.props, { invoiceId: 'inv_1' });
        expect(reloaded.renderHook().problem).toBeNull();
      } finally {
        now.mockRestore();
      }
    });
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
