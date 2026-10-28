import { createRefundStore, type RefundStoreOptions } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from '../utils/methods';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
  // No NovaConnectProvider above
  useContext: () => undefined,
}));
// The store is read as it is now; the harness renders again on demand
vi.mock('zustand', () => ({
  useStore: (store: { getState: () => unknown }, select?: (state: unknown) => unknown) =>
    select ? select(store.getState()) : store.getState(),
}));
const settings: {
  adapters?: PaymentsAdapter[];
  pulsar?: { injectExternalPendingTxs: ReturnType<typeof vi.fn> };
  onConnectWallet?: (family: 'eip155' | 'solana') => void;
} = {};
vi.mock('./useNovaPayments', () => ({ useNovaPayments: () => settings }));
let wallet: CheckoutWallet | null = null;
vi.mock('./useConnectedWallet', () => ({ useConnectedWallet: () => wallet }));
const connect = vi.fn(() => true);
// The real hook when a test asks for it, else a Nova Connect that connects
const realConnection = vi.hoisted(() => ({ on: false }));
vi.mock('./useWalletConnection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useWalletConnection')>();
  return {
    useWalletConnection: (onConnectWallet?: (family: 'eip155' | 'solana') => void) =>
      realConnection.on
        ? actual.useWalletConnection(onConnectWallet)
        : { canConnect: true, connecting: false, connect },
  };
});

const { render, unmount } = await import('../testing/hookHarness');
const { defaultLabels } = await import('../i18n');
const { useRefund } = await import('./useRefund');

const PAYER = '0x9c1e000000000000000000000000000000004f02';
const MERCHANT = '0x7a0b0000000000000000000000000000000077e1';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const instructions = {
  chainId: 'eip155:8453',
  assetId: `eip155:8453/erc20:${USDC_BASE}`,
  to: PAYER as string | null,
  amount: '15890000',
  decimals: 6,
  symbol: 'USDC',
};
const refund = { id: 'rf_1', invoiceId: 'inv_1', status: 'requested' } as never;
const merchantWallet = (chainId = 'eip155:8453'): CheckoutWallet => ({
  address: MERCHANT,
  chainId,
  family: 'eip155',
  connectorType: 'evm:metamask',
  walletId: 'metamask',
  name: 'MetaMask',
  connection: { id: 'connection' },
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: { balance?: bigint; to?: string | null; submit?: RefundStoreOptions['submit'] } = {}) {
  const adapter: PaymentsAdapter = {
    family: 'eip155',
    getBalance: vi.fn(async () => options.balance ?? 100_000_000n),
    estimateFee: vi.fn(async () => ({ amount: 12_000_000_000_000n, decimals: 18, symbol: 'ETH' })),
    switchChain: vi.fn(async () => undefined),
    sendTransfer: vi.fn(async () => '0xrefund'),
  };
  settings.adapters = [adapter];
  settings.pulsar = undefined;
  const request = vi.fn(async () => ({
    refund,
    instructions: { ...instructions, to: options.to === undefined ? PAYER : options.to },
  }));
  const submit = vi.fn(options.submit ?? (async () => ({ ...(refund as object), status: 'submitted' }) as never));
  const store = createRefundStore({ request, submit, get: vi.fn(async () => refund), pollMs: 60_000 });
  const params = { store, invoiceId: 'inv_1', invoice: 'INV-2026-7', labels: defaultLabels, locale: 'en' };
  const flow = (extra: object = {}) => render(useRefund, { ...params, ...extra }) as ReturnType<typeof useRefund>;
  return { adapter, request, submit, store, flow };
}

afterEach(() => {
  unmount();
  wallet = null;
  realConnection.on = false;
  settings.onConnectWallet = undefined;
  vi.clearAllMocks();
});

// Plan 12 §7.5, board RefundSendStates: the merchant sends a refund from a wallet, Quasar follows it
describe('useRefund', () => {
  it('asks for what to refund, then has the merchant connect a wallet of the network of the payment', async () => {
    const { request, flow } = setup();
    expect(flow().step).toBe('amount');

    await flow().start({ mode: 'exact_received', reason: 'Order cancelled' });
    expect(request).toHaveBeenCalledWith('inv_1', { mode: 'exact_received', reason: 'Order cancelled' });
    expect(flow()).toMatchObject({ step: 'connect', network: 'Base' });

    flow().connect();
    expect(connect).toHaveBeenCalledWith('eip155');
  });

  it("connects through the app's handler without Nova Connect, and can't connect without one", async () => {
    realConnection.on = true;
    const { flow } = setup();
    await flow().start({ mode: 'exact_received' });
    expect(flow().canConnect).toBe(false);
    unmount();

    const onConnectWallet = vi.fn();
    expect(flow({ onConnectWallet }).canConnect).toBe(true);
    flow({ onConnectWallet }).connect();
    expect(onConnectWallet).toHaveBeenCalledWith('eip155');
    unmount();

    // The handler of NovaPaymentsProvider
    settings.onConnectWallet = vi.fn();
    expect(flow().canConnect).toBe(true);
    flow().connect();
    expect(settings.onConnectWallet).toHaveBeenCalledWith('eip155');
  });

  it('starts at once with the refund the app worked out', async () => {
    const { request, flow } = setup();
    flow({ params: { amount: '15.89' } });
    await tick();
    expect(request).toHaveBeenCalledWith('inv_1', { amount: '15.89' });
  });

  it('sends the refund to the payer from the connected wallet and hands its transaction to Quasar', async () => {
    const { adapter, submit, store, flow } = setup();
    wallet = merchantWallet();
    await flow().start({ mode: 'exact_received' });
    expect(flow().step).toBe('confirm');

    await flow().send();
    expect(adapter.sendTransfer).toHaveBeenCalledWith({
      instructions: {
        family: 'eip155',
        chainId: 8453,
        to: PAYER,
        token: USDC_BASE,
        amount: '15890000',
        decimals: 6,
        symbol: 'USDC',
      },
      account: MERCHANT,
      connection: { id: 'connection' },
    });
    expect(submit).toHaveBeenCalledWith('rf_1', { txHash: '0xrefund', from: MERCHANT });
    expect(flow()).toMatchObject({ step: 'confirming', txKey: '0xrefund' });
    store.getState().reset();
  });

  it('asks a wallet on another network to switch to the network of the payment, sending nothing', async () => {
    const { adapter, flow } = setup();
    wallet = merchantWallet('eip155:1');
    await flow().start({ mode: 'exact_received' });
    expect(flow().wrongNetwork).toBe(true);

    await flow().switchNetwork();
    expect(adapter.switchChain).toHaveBeenCalledWith('eip155:8453');
    expect(adapter.sendTransfer).not.toHaveBeenCalled();
    expect(flow().step).toBe('confirm');

    wallet = merchantWallet();
    expect(flow().wrongNetwork).toBe(false);
  });

  it('says the merchant declined the switch in the wallet', async () => {
    const { adapter, flow } = setup();
    vi.mocked(adapter.switchChain!).mockRejectedValueOnce(Object.assign(new Error('User rejected'), { code: 4001 }));
    wallet = merchantWallet('eip155:1');
    await flow().start({ mode: 'exact_received' });
    await flow().switchNetwork();
    expect(flow()).toMatchObject({ step: 'confirm', problem: 'declined' });
  });

  it('switches the wallet first when it sends from another network', async () => {
    const { adapter, flow, store } = setup();
    wallet = merchantWallet('eip155:1');
    await flow().start({ mode: 'exact_received' });
    await flow().send();
    expect(adapter.switchChain).toHaveBeenCalledWith('eip155:8453');
    expect(adapter.sendTransfer).toHaveBeenCalledOnce();
    store.getState().reset();
  });

  it('asks the wallet nothing when it holds too little', async () => {
    const { adapter, submit, flow } = setup({ balance: 1_000_000n });
    wallet = merchantWallet();
    await flow().start({ mode: 'exact_received' });
    flow();
    await tick();
    expect(flow().balance).toBe(1_000_000n);

    await flow().send();
    expect(flow()).toMatchObject({ step: 'confirm', problem: 'notEnough' });
    expect(adapter.sendTransfer).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('says the merchant declined in the wallet, and tells Quasar nothing', async () => {
    const { adapter, submit, flow } = setup();
    vi.mocked(adapter.sendTransfer).mockRejectedValueOnce(Object.assign(new Error('User rejected'), { code: 4001 }));
    wallet = merchantWallet();
    await flow().start({ mode: 'exact_received' });
    await flow().send();
    expect(flow()).toMatchObject({ step: 'confirm', problem: 'declined', txKey: null });
    expect(submit).not.toHaveBeenCalled();
  });

  it('hands a refund the wallet sent over again, never sending it twice', async () => {
    const { adapter, submit, flow, store } = setup({
      submit: vi
        .fn()
        .mockRejectedValueOnce(new Error('Quasar did not answer'))
        .mockResolvedValueOnce({ id: 'rf_1', status: 'submitted' }),
    });
    wallet = merchantWallet();
    await flow().start({ mode: 'exact_received' });
    await flow().send();
    expect(flow()).toMatchObject({ step: 'confirm', txKey: '0xrefund' });
    expect(store.getState().error).not.toBeNull();

    // The window was closed and opened again: the sent transaction is still known
    unmount();
    expect(flow().txKey).toBe('0xrefund');
    await flow().send();
    expect(adapter.sendTransfer).toHaveBeenCalledOnce();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(flow().step).toBe('confirming');
    store.getState().reset();
  });

  it('cannot send a refund whose payer Quasar does not know', async () => {
    const { adapter, flow } = setup({ to: null });
    wallet = merchantWallet();
    await flow().start({ mode: 'exact_received' });
    expect(flow()).toMatchObject({ transfer: null, problem: 'noRecipient' });
    await flow().send();
    expect(adapter.sendTransfer).not.toHaveBeenCalled();
  });

  it("gives the refund to the app's Pulsar store, which tracks it and shows its toast", async () => {
    const { adapter, flow, store } = setup();
    const injectExternalPendingTxs = vi.fn(async () => undefined);
    settings.pulsar = { injectExternalPendingTxs };
    adapter.pulsarTransaction = vi.fn((params) => ({ txKey: params.txKey, title: params.title }) as never);
    wallet = merchantWallet();
    await flow().start({ mode: 'exact_received' });
    await flow().send();
    expect(adapter.pulsarTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ txKey: '0xrefund', title: 'Refund of INV-2026-7', payload: { quasarRefund: 'rf_1' } }),
    );
    expect(injectExternalPendingTxs).toHaveBeenCalledWith([{ txKey: '0xrefund', title: 'Refund of INV-2026-7' }]);
    store.getState().reset();
  });
});
