import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutWallet } from './methods';
import { payInvoice } from './payInvoice';
import { PaymentWalletError } from './walletErrors';

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const wallet: CheckoutWallet = {
  address: ACCOUNT,
  chainId: 'eip155:8453',
  family: 'eip155',
  connectorType: 'evm:metamask',
  walletId: 'metamask',
  name: 'MetaMask',
  connection: { connectedAccount: 'ui-account' },
};
const instructions = {
  family: 'eip155' as const,
  chainId: 8453,
  to: '0x2222222222222222222222222222222222222222',
  token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  amount: '89540000',
  decimals: 6,
  symbol: 'USDC',
};
const typedData = { domain: {}, types: {}, primaryType: 'TransferWithAuthorization', message: {} };
const calls = [{ to: '0x3', value: '0', data: '0x' }];
const quote = {
  payer: `eip155:8453:${ACCOUNT}`,
  instructions,
  gasless: { relay: { typedData }, paymaster: { calls } },
} as unknown as CheckoutQuote;

const fakes = () => {
  const actions = { submit: vi.fn(async () => true), relay: vi.fn(async () => true) };
  const store = { getState: () => actions };
  const adapter: PaymentsAdapter = {
    family: 'eip155',
    getBalance: vi.fn(async () => 0n),
    sendTransfer: vi.fn(async () => '0xtransfer'),
    signTransferAuthorization: vi.fn(async () => '0xsignature'),
    sendSponsoredCalls: vi.fn(async () => '0xsponsored'),
  };
  return { actions, store, adapter };
};

describe('payInvoice', () => {
  it('sends the transfer and hands its hash to Quasar with the wallet', async () => {
    const { actions, store, adapter } = fakes();
    await expect(payInvoice({ adapter, store, quote, wallet, path: 'transfer', paymasterUrl: null })).resolves.toBe(
      true,
    );
    expect(adapter.sendTransfer).toHaveBeenCalledWith({
      instructions,
      account: ACCOUNT,
      connection: wallet.connection,
    });
    expect(actions.submit).toHaveBeenCalledWith({ txKey: '0xtransfer', connectorType: 'evm:metamask' });
  });

  it('says when the wallet is done, before Quasar takes the payment', async () => {
    const { actions, store, adapter } = fakes();
    const order: string[] = [];
    actions.submit.mockImplementation(async () => (order.push('submit'), true));
    await payInvoice({
      adapter,
      store,
      quote,
      wallet,
      path: 'transfer',
      paymasterUrl: null,
      onWalletDone: () => order.push('wallet'),
    });
    expect(order).toEqual(['wallet', 'submit']);
  });

  it('signs the authorization and lets Quasar relay it', async () => {
    const { actions, store, adapter } = fakes();
    await payInvoice({ adapter, store, quote, wallet, path: 'relay', paymasterUrl: null });
    expect(adapter.signTransferAuthorization).toHaveBeenCalledWith({ typedData, account: ACCOUNT });
    expect(actions.relay).toHaveBeenCalledWith('0xsignature');
    expect(actions.submit).not.toHaveBeenCalled();
  });

  it('sends the sponsored calls with the paymaster and hands the transaction hash to Quasar', async () => {
    const { actions, store, adapter } = fakes();
    // The wallet is still on Ethereum: the calls go on the quote's chain
    const onEthereum = { ...wallet, chainId: 'eip155:1' };
    await payInvoice({
      adapter,
      store,
      quote,
      wallet: onEthereum,
      path: 'paymaster',
      paymasterUrl: 'https://quasar/paymaster',
    });
    expect(adapter.sendSponsoredCalls).toHaveBeenCalledWith({
      calls,
      paymasterUrl: 'https://quasar/paymaster',
      chainId: 'eip155:8453',
      account: ACCOUNT,
    });
    expect(actions.submit).toHaveBeenCalledWith({ txKey: '0xsponsored', connectorType: 'evm:metamask' });
  });

  it('names the transaction the wallet sent before Quasar takes it, and none for a gasless signature', async () => {
    const { actions, store, adapter } = fakes();
    const order: string[] = [];
    actions.submit.mockImplementation(async () => (order.push('submit'), true));
    const onSent = vi.fn((txKey: string) => order.push(`sent ${txKey}`));
    await payInvoice({ adapter, store, quote, wallet, path: 'transfer', paymasterUrl: null, onSent });
    expect(order).toEqual(['sent 0xtransfer', 'submit']);

    await payInvoice({ adapter, store, quote, wallet, path: 'paymaster', paymasterUrl: 'https://quasar/pm', onSent });
    expect(onSent).toHaveBeenLastCalledWith('0xsponsored');

    onSent.mockClear();
    await payInvoice({ adapter, store, quote, wallet, path: 'relay', paymasterUrl: null, onSent });
    expect(onSent).not.toHaveBeenCalled();
  });

  it('says the wallet is done as soon as it accepted the sponsored calls, before they are included', async () => {
    const { store, adapter } = fakes();
    const order: string[] = [];
    adapter.sendSponsoredCalls = vi.fn(async ({ onSent }) => {
      onSent?.();
      order.push('included');
      return '0xsponsored';
    });
    await payInvoice({
      adapter,
      store,
      quote,
      wallet,
      path: 'paymaster',
      paymasterUrl: 'https://quasar/pm',
      onWalletDone: () => order.push('wallet done'),
    });
    expect(order.slice(0, 2)).toEqual(['wallet done', 'included']);
  });

  it('refuses a path the adapter or the quote cannot take', async () => {
    const { store, adapter } = fakes();
    const bare: PaymentsAdapter = {
      family: 'eip155',
      getBalance: adapter.getBalance,
      sendTransfer: adapter.sendTransfer,
    };
    await expect(
      payInvoice({ adapter: bare, store, quote, wallet, path: 'relay', paymasterUrl: null }),
    ).rejects.toEqual(expect.objectContaining({ kind: 'unsupported' }));
    await expect(
      payInvoice({ adapter, store, quote, wallet, path: 'paymaster', paymasterUrl: null }),
    ).rejects.toBeInstanceOf(PaymentWalletError);
    await expect(
      payInvoice({ adapter, store, quote: { ...quote, gasless: null }, wallet, path: 'relay', paymasterUrl: null }),
    ).rejects.toEqual(expect.objectContaining({ kind: 'unsupported' }));
  });
});
