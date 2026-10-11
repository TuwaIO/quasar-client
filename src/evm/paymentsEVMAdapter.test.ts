import { OrbitAdapter } from '@tuwaio/orbit-core';
import { TransactionTracker } from '@tuwaio/pulsar-core';
import type { PaymentInstructions, TransferAuthorizationTypedData } from '@tuwaio/quasar-sdk/checkout';
import type { Config } from '@wagmi/core';
import { encodeFunctionData, erc20Abi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wagmi = vi.hoisted(() => ({
  getBalance: vi.fn(),
  readContract: vi.fn(),
  estimateGas: vi.fn(),
  estimateFeesPerGas: vi.fn(),
  getCapabilities: vi.fn(),
  switchChain: vi.fn(),
  sendTransaction: vi.fn(),
  writeContract: vi.fn(),
  getConnectorClient: vi.fn(),
  getConnection: vi.fn(),
  sendCalls: vi.fn(),
  waitForCallsStatus: vi.fn(),
}));
vi.mock('@wagmi/core', () => wagmi);

const { paymentsEVMAdapter } = await import('./paymentsEVMAdapter');

const config = { chains: [baseSepolia] } as unknown as Config;
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const MERCHANT = '0x2222222222222222222222222222222222222222';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const BASE_SEPOLIA = 'eip155:84532';
const usdc: PaymentInstructions = {
  family: 'eip155',
  chainId: 84532,
  to: MERCHANT,
  token: USDC,
  amount: '89540000',
  decimals: 6,
  symbol: 'USDC',
};
const eth: PaymentInstructions = { ...usdc, token: 'native', amount: '37308333333333334', decimals: 18, symbol: 'ETH' };

beforeEach(() => {
  for (const mock of Object.values(wagmi)) mock.mockReset();
  wagmi.getConnection.mockReturnValue({ connector: { id: 'io.metamask', type: 'injected' } });
});

describe('paymentsEVMAdapter', () => {
  it('reads the balance of the native coin and of a token on the chain of the method', async () => {
    const adapter = paymentsEVMAdapter(config);
    wagmi.getBalance.mockResolvedValue({ value: 80n });
    wagmi.readContract.mockResolvedValue(52_100_000n);
    await expect(adapter.getBalance({ chainId: BASE_SEPOLIA, account: ACCOUNT, token: 'native' })).resolves.toBe(80n);
    expect(wagmi.getBalance).toHaveBeenCalledWith(config, { address: ACCOUNT, chainId: 84532 });
    await expect(adapter.getBalance({ chainId: BASE_SEPOLIA, account: ACCOUNT, token: USDC })).resolves.toBe(
      52_100_000n,
    );
    expect(wagmi.readContract).toHaveBeenCalledWith(config, {
      address: USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [ACCOUNT],
      chainId: 84532,
    });
  });

  it('estimates the network fee of the transfer in the native coin of the chain', async () => {
    wagmi.estimateGas.mockResolvedValue(50_000n);
    wagmi.estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 1_000_000_000n });
    await expect(paymentsEVMAdapter(config).estimateFee!({ instructions: usdc, account: ACCOUNT })).resolves.toEqual({
      amount: 50_000_000_000_000n,
      decimals: 18,
      symbol: 'ETH',
    });
    expect(wagmi.estimateGas).toHaveBeenCalledWith(config, {
      account: ACCOUNT,
      chainId: 84532,
      to: USDC,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [MERCHANT, 89_540_000n] }),
    });
  });

  it('knows a wallet that takes a paymaster on the chain, and treats an unknown answer as no', async () => {
    const adapter = paymentsEVMAdapter(config);
    wagmi.getCapabilities.mockResolvedValueOnce({ paymasterService: { supported: true } });
    await expect(adapter.canSponsorCalls!({ chainId: BASE_SEPOLIA, account: ACCOUNT })).resolves.toBe(true);
    expect(wagmi.getCapabilities).toHaveBeenCalledWith(config, { account: ACCOUNT, chainId: 84532 });
    wagmi.getCapabilities.mockResolvedValueOnce({});
    await expect(adapter.canSponsorCalls!({ chainId: BASE_SEPOLIA, account: ACCOUNT })).resolves.toBe(false);
    wagmi.getCapabilities.mockRejectedValueOnce(new Error('Method not supported'));
    await expect(adapter.canSponsorCalls!({ chainId: BASE_SEPOLIA, account: ACCOUNT })).resolves.toBe(false);
  });

  it('switches the wallet to the chain of the payment', async () => {
    await paymentsEVMAdapter(config).switchChain!(BASE_SEPOLIA);
    expect(wagmi.switchChain).toHaveBeenCalledWith(config, { chainId: 84532 });
  });

  it('sends a token transfer or the native coin from the account, on the chain of the quote', async () => {
    const adapter = paymentsEVMAdapter(config);
    wagmi.writeContract.mockResolvedValue('0xtoken');
    wagmi.sendTransaction.mockResolvedValue('0xnative');
    await expect(adapter.sendTransfer({ instructions: usdc, account: ACCOUNT })).resolves.toBe('0xtoken');
    expect(wagmi.writeContract).toHaveBeenCalledWith(config, {
      account: ACCOUNT,
      chainId: 84532,
      address: USDC,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [MERCHANT, 89_540_000n],
    });
    await expect(adapter.sendTransfer({ instructions: eth, account: ACCOUNT })).resolves.toBe('0xnative');
    expect(wagmi.sendTransaction).toHaveBeenCalledWith(config, {
      account: ACCOUNT,
      chainId: 84532,
      to: MERCHANT,
      value: 37_308_333_333_333_334n,
    });
  });

  it('refuses to pay from a Safe, whose key is not the transaction Quasar follows', async () => {
    wagmi.getConnection.mockReturnValue({ connector: { id: 'safe', type: 'safe' } });
    const adapter = paymentsEVMAdapter(config);
    await expect(adapter.sendTransfer({ instructions: usdc, account: ACCOUNT })).rejects.toMatchObject({
      kind: 'unsupported',
    });
    expect(wagmi.writeContract).not.toHaveBeenCalled();
  });

  it("signs the engine's EIP-3009 typed data as it is, with eth_signTypedData_v4 on the chain of its domain", async () => {
    const request = vi.fn(async () => '0xsignature');
    wagmi.getConnectorClient.mockResolvedValue({ request });
    const typedData: TransferAuthorizationTypedData = {
      domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC },
      types: { EIP712Domain: [{ name: 'name', type: 'string' }] },
      primaryType: 'TransferWithAuthorization',
      message: { from: ACCOUNT, to: MERCHANT, value: '89540000' },
    };
    await expect(paymentsEVMAdapter(config).signTransferAuthorization!({ typedData, account: ACCOUNT })).resolves.toBe(
      '0xsignature',
    );
    expect(wagmi.getConnectorClient).toHaveBeenCalledWith(config, { chainId: 84532 });
    expect(request).toHaveBeenCalledWith({
      method: 'eth_signTypedData_v4',
      params: [ACCOUNT, JSON.stringify(typedData)],
    });
  });

  it('sends the sponsored calls with the paymaster, says when the wallet accepted them, and returns their transaction', async () => {
    const order: string[] = [];
    wagmi.sendCalls.mockImplementation(async () => (order.push('sent'), { id: 'batch-1' }));
    wagmi.waitForCallsStatus.mockImplementation(async () => {
      order.push('included');
      return { status: 'success', receipts: [{ transactionHash: '0xincluded' }] };
    });
    const calls = [{ to: USDC, value: '0x0', data: '0xa9059cbb' }];
    await expect(
      paymentsEVMAdapter(config).sendSponsoredCalls!({
        calls,
        paymasterUrl: 'https://quasar/paymaster',
        chainId: BASE_SEPOLIA,
        account: ACCOUNT,
        onSent: () => order.push('wallet done'),
      }),
    ).resolves.toBe('0xincluded');
    expect(order).toEqual(['sent', 'wallet done', 'included']);
    expect(wagmi.sendCalls).toHaveBeenCalledWith(config, {
      account: ACCOUNT,
      chainId: 84532,
      calls: [{ to: USDC, value: 0n, data: '0xa9059cbb' }],
      capabilities: { paymasterService: { url: 'https://quasar/paymaster' } },
    });
    expect(wagmi.waitForCallsStatus).toHaveBeenCalledWith(config, { id: 'batch-1', timeout: 180_000 });

    wagmi.waitForCallsStatus.mockResolvedValueOnce({ status: 'failure', receipts: [] });
    await expect(
      paymentsEVMAdapter(config).sendSponsoredCalls!({
        calls,
        paymasterUrl: 'u',
        chainId: BASE_SEPOLIA,
        account: ACCOUNT,
      }),
    ).rejects.toMatchObject({ kind: 'failed' });
  });

  it('describes a sent payment as a pending Pulsar transaction followed by its hash', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_791_000_000_500);
    const tx = paymentsEVMAdapter(config).pulsarTransaction!({
      txKey: '0xhash',
      instructions: usdc,
      account: ACCOUNT,
      connectorType: 'evm:metamask',
      title: 'Payment to Acme Labs',
      description: '89.54 USDC · INV-2026-42',
      payload: { quasarInvoice: 'inv_1' },
    });
    expect(tx).toEqual({
      adapter: OrbitAdapter.EVM,
      tracker: TransactionTracker.Ethereum,
      txKey: '0xhash',
      hash: '0xhash',
      chainId: 84532,
      from: ACCOUNT,
      to: USDC,
      type: 'payment',
      connectorType: 'evm:metamask',
      title: 'Payment to Acme Labs',
      description: '89.54 USDC · INV-2026-42',
      payload: { quasarInvoice: 'inv_1' },
      pending: true,
      localTimestamp: 1_791_000_000,
      isTrackedModalOpen: false,
    });
    vi.restoreAllMocks();
  });

  it('refuses a chain that is not EVM', async () => {
    await expect(
      paymentsEVMAdapter(config).getBalance({
        chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        account: ACCOUNT,
        token: 'native',
      }),
    ).rejects.toThrow('not an EVM chain');
  });
});
