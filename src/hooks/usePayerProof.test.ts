import type { PayerProofMessage, PayerProofSigner } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from '../utils/methods';
import { PaymentWalletError } from '../utils/walletErrors';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { usePayerProof } = await import('./usePayerProof');

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const BASE = 'eip155:8453';
const wallet: CheckoutWallet = {
  address: ACCOUNT,
  chainId: BASE,
  family: 'eip155',
  connectorType: 'evm:metamask',
  walletId: 'metamask',
  name: 'MetaMask',
  connection: null,
};
const REQUEST: PayerProofMessage = {
  object: 'payer_proof_message',
  payer: `${BASE}:${ACCOUNT}`,
  proven: false,
  message: 'shop.example wants you to sign in with your Ethereum account:…',
  domain: 'shop.example',
  chainId: BASE,
  nonce: 'abc',
  issuedAt: '2026-10-29T00:00:00.000Z',
  expiresAt: null,
};

/** A promise to settle from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

const setup = (options: { walletChainId?: string; signMessage?: PaymentsAdapter['signMessage'] | null } = {}) => {
  const signature = deferred<string>();
  const signMessage = vi.fn(() => signature.promise);
  const adapter: PaymentsAdapter = {
    family: 'eip155',
    getBalance: vi.fn(async () => 0n),
    sendTransfer: vi.fn(async () => '0x'),
    switchChain: vi.fn(async () => undefined),
    ...(options.signMessage === null ? {} : { signMessage: options.signMessage ?? signMessage }),
  };
  const state = { error: null as { code: string } | null };
  // The SDK asks for the message, has it signed and records the signature: a refused signature is payer_proof_declined
  const confirmPayer = vi.fn(async (sign: PayerProofSigner) => {
    try {
      await sign(REQUEST.message, REQUEST);
      return true;
    } catch {
      state.error = { code: 'payer_proof_declined' };
      return false;
    }
  });
  const requestQuote = vi.fn(async () => null);
  const store = { getState: () => ({ ...state, confirmPayer, requestQuote }) } as never;
  const props: Parameters<typeof usePayerProof>[0] = {
    adapter,
    store,
    wallet: { ...wallet, chainId: options.walletChainId ?? BASE },
    chainId: BASE,
  };
  const renderHook = () => render(usePayerProof, props) as ReturnType<typeof usePayerProof>;
  return { adapter, signMessage, signature, confirmPayer, requestQuote, renderHook };
};

afterEach(unmount);

describe('usePayerProof', () => {
  it('has the wallet sign the message Quasar issued, then locks the price', async () => {
    const { signMessage, signature, confirmPayer, requestQuote, renderHook } = setup();
    const confirming = renderHook().confirm({ quote: true });
    await vi.waitFor(() => expect(signMessage).toHaveBeenCalled());
    expect(renderHook()).toMatchObject({ step: 'signing', request: REQUEST });
    expect(signMessage).toHaveBeenCalledWith({ message: REQUEST.message, account: ACCOUNT, chainId: BASE });
    signature.resolve('0xsigned');
    await expect(confirming).resolves.toBe(true);
    expect(confirmPayer).toHaveBeenCalledOnce();
    expect(requestQuote).toHaveBeenCalledOnce();
    expect(renderHook()).toMatchObject({ step: 'idle', problem: null });
  });

  it('keeps a locked price: a payment of it waits only for the confirmation', async () => {
    const { signature, requestQuote, renderHook } = setup();
    signature.resolve('0xsigned');
    await expect(renderHook().confirm()).resolves.toBe(true);
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('switches the wallet to the network of the method first, where a smart wallet must sign', async () => {
    const { adapter, signMessage, signature, renderHook } = setup({ walletChainId: 'eip155:1' });
    signature.resolve('0xsigned');
    await renderHook().confirm({ quote: true });
    expect(adapter.switchChain).toHaveBeenCalledWith(BASE);
    expect(vi.mocked(adapter.switchChain!).mock.invocationCallOrder[0]).toBeLessThan(
      signMessage.mock.invocationCallOrder[0],
    );
  });

  it('says why the wallet did not sign, and locks no price', async () => {
    const { signature, requestQuote, renderHook } = setup();
    const confirming = renderHook().confirm({ quote: true });
    signature.reject(new PaymentWalletError('declined', 'User rejected'));
    await expect(confirming).resolves.toBe(false);
    expect(renderHook()).toMatchObject({ step: 'idle', problem: 'declined' });
    expect(requestQuote).not.toHaveBeenCalled();
  });

  it('refuses a wallet adapter that cannot sign messages, without asking Quasar', async () => {
    const { confirmPayer, renderHook } = setup({ signMessage: null });
    await expect(renderHook().confirm({ quote: true })).resolves.toBe(false);
    expect(renderHook().problem).toBe('unsupported');
    expect(confirmPayer).not.toHaveBeenCalled();
  });

  it('closes the window on cancel, and still locks the price if the wallet signs later', async () => {
    const { signMessage, signature, requestQuote, renderHook } = setup();
    const confirming = renderHook().confirm({ quote: true });
    await vi.waitFor(() => expect(signMessage).toHaveBeenCalled());
    renderHook().dismiss();
    expect(renderHook().step).toBe('idle');
    signature.resolve('0xsigned');
    await confirming;
    expect(requestQuote).toHaveBeenCalledOnce();
    expect(renderHook().step).toBe('idle');
  });
});
