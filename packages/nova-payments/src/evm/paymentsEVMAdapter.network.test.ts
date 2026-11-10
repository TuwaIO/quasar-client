/**
 * @file The network of the wallet before a request bound to one, through the real wagmi: its mock connector keeps the
 * network the wallet is on and switches it, and what it forwards to a node (signatures, transactions, reads) is answered
 * here. Owner test 2026-11-05, finding 6: MetaMask on a phone, through WalletConnect, stayed on another network; wagmi
 * refused the signature before the wallet saw it (`ConnectorChainMismatchError`), and the buyer got an error with
 * nothing in the wallet.
 */
import type { TransferAuthorizationTypedData } from '@tuwaio/quasar-sdk/checkout';
import { type Config, connect, createConfig, getConnection, http, mock } from '@wagmi/core';
import { type Address, numberToHex } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { walletErrorKind } from '../utils/walletErrors';
import { paymentsEVMAdapter } from './paymentsEVMAdapter';

const ACCOUNT = '0x1111111111111111111111111111111111111111' as Address;
const MERCHANT = '0x2222222222222222222222222222222222222222';
const SIGNATURE = `0x${'ab'.repeat(65)}`;
const TX_HASH = `0x${'cd'.repeat(32)}`;

/** The requests that reached the node, by method. */
let requests: { method: string; params: unknown[] }[] = [];

/** A node that answers what wagmi and viem ask on the way to a signature or a transaction. */
const answers: Record<string, unknown> = {
  eth_signTypedData_v4: SIGNATURE,
  eth_sign: SIGNATURE,
  eth_estimateGas: numberToHex(24_393),
  eth_maxPriorityFeePerGas: '0x1',
  eth_gasPrice: '0x2',
  eth_getBlockByNumber: { baseFeePerGas: '0x1', number: '0x1', timestamp: '0x1', transactions: [] },
  eth_sendTransaction: TX_HASH,
};

function node(): typeof fetch {
  return vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body)) as { id: number; method: string; params?: unknown[] };
    requests.push({ method: body.method, params: body.params ?? [] });
    if (!(body.method in answers)) throw new Error(`Unexpected request ${body.method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: answers[body.method] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/** A wagmi config with one mock wallet, connected on Sepolia while the payment goes on Base Sepolia. */
async function walletOnSepolia(features?: Parameters<typeof mock>[0]['features']): Promise<Config> {
  const config = createConfig({
    chains: [sepolia, baseSepolia],
    connectors: [mock({ accounts: [ACCOUNT], features })],
    transports: { [sepolia.id]: http('http://node.test/sepolia'), [baseSepolia.id]: http('http://node.test/base') },
    storage: null,
  });
  await connect(config, { connector: config.connectors[0], chainId: sepolia.id });
  return config;
}

const typedData = {
  domain: { name: 'USDC', version: '2', chainId: baseSepolia.id, verifyingContract: MERCHANT },
  types: {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
    ],
  },
  primaryType: 'TransferWithAuthorization',
  message: { from: ACCOUNT, to: MERCHANT },
} as unknown as TransferAuthorizationTypedData;

beforeEach(() => {
  requests = [];
  vi.stubGlobal('fetch', node());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('paymentsEVMAdapter: the wallet on another network than the request', () => {
  it('switches the wallet to the network of the authorization before asking it to sign', async () => {
    const config = await walletOnSepolia();
    const adapter = paymentsEVMAdapter(config);
    await expect(adapter.signTransferAuthorization!({ typedData, account: ACCOUNT })).resolves.toBe(SIGNATURE);
    expect(getConnection(config).chainId).toBe(baseSepolia.id);
    expect(requests.map((request) => request.method)).toEqual(['eth_signTypedData_v4']);
  });

  it('switches before the confirmation of the paying wallet: a smart wallet signs for the network it is on', async () => {
    const config = await walletOnSepolia();
    await expect(
      paymentsEVMAdapter(config).signMessage!({ message: 'confirm', account: ACCOUNT, chainId: 'eip155:84532' }),
    ).resolves.toBe(SIGNATURE);
    expect(getConnection(config).chainId).toBe(baseSepolia.id);
  });

  it('switches before the transfer, and the transfer carries the gas limit of the estimate', async () => {
    const config = await walletOnSepolia();
    const hash = await paymentsEVMAdapter(config).sendTransfer({
      instructions: {
        family: 'eip155',
        chainId: baseSepolia.id,
        to: MERCHANT,
        token: 'native',
        amount: '3286688885166017',
        decimals: 18,
        symbol: 'ETH',
      },
      account: ACCOUNT,
    });
    expect(hash).toBe(TX_HASH);
    expect(getConnection(config).chainId).toBe(baseSepolia.id);
    const sent = requests.find((request) => request.method === 'eth_sendTransaction')!.params[0] as { gas: string };
    expect(BigInt(sent.gas)).toBe(30_492n);
  });

  it('asks for no switch when the wallet is on the network already', async () => {
    const config = await walletOnSepolia();
    const switching = vi.spyOn(config.connectors[0], 'switchChain');
    await paymentsEVMAdapter(config).signTransferAuthorization!({
      typedData: { ...typedData, domain: { ...typedData.domain, chainId: sepolia.id } },
      account: ACCOUNT,
    });
    expect(switching).not.toHaveBeenCalled();
  });

  it('says the wallet did not switch, and asks it for no signature', async () => {
    const config = await walletOnSepolia({ switchChainError: new Error('Unrecognized chain ID') });
    const error = await paymentsEVMAdapter(config).signTransferAuthorization!({ typedData, account: ACCOUNT }).catch(
      (caught: unknown) => caught,
    );
    expect(walletErrorKind(error)).toBe('switchFailed');
    expect(requests).toEqual([]);
  });

  it('names a switch the buyer declined before the confirmation, which was never asked for', async () => {
    const config = await walletOnSepolia({ switchChainError: true });
    const error = await paymentsEVMAdapter(config).signMessage!({
      message: 'confirm',
      account: ACCOUNT,
      chainId: 'eip155:84532',
    }).catch((caught: unknown) => caught);
    expect(walletErrorKind(error)).toBe('declined');
    expect(error).toMatchObject({ step: 'switch' });
    expect(requests).toEqual([]);
  });

  it('leaves a switch the buyer declined as declined', async () => {
    const config = await walletOnSepolia({ switchChainError: true });
    const error = await paymentsEVMAdapter(config).signTransferAuthorization!({ typedData, account: ACCOUNT }).catch(
      (caught: unknown) => caught,
    );
    expect(walletErrorKind(error)).toBe('declined');
    expect(requests).toEqual([]);
  });
});
