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
  getBytecode: vi.fn(),
  switchChain: vi.fn(),
  sendTransaction: vi.fn(),
  writeContract: vi.fn(),
  getConnectorClient: vi.fn(),
  getConnection: vi.fn(),
  getTransactionReceipt: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  sendCalls: vi.fn(),
  waitForCallsStatus: vi.fn(),
  signMessage: vi.fn(),
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

  it("links a transaction to the chain's block explorer", () => {
    const adapter = paymentsEVMAdapter(config);
    expect(adapter.explorerUrl!({ chainId: BASE_SEPOLIA, txKey: '0xhash' })).toBe(
      'https://sepolia.basescan.org/tx/0xhash',
    );
    expect(adapter.explorerAddressUrl!({ chainId: BASE_SEPOLIA, address: '0xme' })).toBe(
      'https://sepolia.basescan.org/address/0xme',
    );
    expect(adapter.explorerAddressUrl!({ chainId: 'eip155:1', address: '0xme' })).toBeUndefined();
    expect(adapter.explorerUrl!({ chainId: 'eip155:1', txKey: '0xhash' })).toBeUndefined();
  });

  it('asks the wallet for the ERC-7715 permission of automatic payments and returns what Quasar needs', async () => {
    const request = vi.fn(async () => [
      { chainId: '0x14a34', context: '0xcontext', delegationManager: '0xmanager', dependencies: [] },
    ]);
    wagmi.getConnectorClient.mockResolvedValue({ request });
    const permission = {
      chainId: '0x14a34',
      to: '0x3333333333333333333333333333333333333333',
      permission: {
        type: 'erc20-token-periodic' as const,
        isAdjustmentAllowed: false,
        data: {
          tokenAddress: USDC,
          periodAmount: '0x2ebae40',
          periodDuration: 2_592_000,
          startTime: 1,
          justification: 'Pro',
        },
      },
      rules: [],
    };
    await expect(
      paymentsEVMAdapter(config).requestPermission!({ request: permission, account: ACCOUNT }),
    ).resolves.toEqual({
      context: '0xcontext',
      delegationManager: '0xmanager',
      dependencies: [],
    });
    // wagmi refuses a client on another network than the wallet's: the first payment may have been on another one
    expect(wagmi.switchChain).toHaveBeenCalledWith(config, { chainId: 84532 });
    expect(wagmi.switchChain.mock.invocationCallOrder[0]).toBeLessThan(
      wagmi.getConnectorClient.mock.invocationCallOrder[0],
    );
    expect(wagmi.getConnectorClient).toHaveBeenCalledWith(config, { chainId: 84532 });
    expect(request).toHaveBeenCalledWith({
      method: 'wallet_requestExecutionPermissions',
      params: [{ ...permission, from: ACCOUNT }],
    });
    request.mockResolvedValueOnce([{} as never]);
    await expect(
      paymentsEVMAdapter(config).requestPermission!({ request: permission, account: ACCOUNT }),
    ).rejects.toMatchObject({
      kind: 'failed',
    });
  });

  describe('the switch of a plain account to its smart account', () => {
    const adapter = () => paymentsEVMAdapter(config);
    const params = { chainId: BASE_SEPOLIA, account: ACCOUNT };

    it('tells a smart account, a plain one the wallet can switch, and an account it knows nothing of', async () => {
      wagmi.getBytecode.mockResolvedValueOnce('0xef0100aa');
      await expect(adapter().smartAccountStatus!(params)).resolves.toBe('smart');

      wagmi.getBytecode.mockResolvedValue('0x');
      wagmi.getCapabilities.mockResolvedValueOnce({ atomic: { status: 'ready' } });
      await expect(adapter().smartAccountStatus!(params)).resolves.toBe('upgradable');

      // Quasar decides on what such a wallet gives: it may deploy through `dependencies`
      wagmi.getCapabilities.mockResolvedValueOnce({});
      await expect(adapter().smartAccountStatus!(params)).resolves.toBe('unknown');
      wagmi.getCapabilities.mockRejectedValueOnce(new Error('no EIP-5792'));
      await expect(adapter().smartAccountStatus!(params)).resolves.toBe('unknown');
    });

    // Live on MetaMask 13.55: one call goes out as a plain transaction (type 2) and the account stays as it was
    it('asks with two calls, atomically, that move nothing', async () => {
      wagmi.sendCalls.mockResolvedValue({ id: '0xbatch' });
      wagmi.waitForCallsStatus.mockResolvedValue({ status: 'success' });
      wagmi.getBytecode.mockResolvedValue('0xef0100aa');
      await adapter().upgradeToSmartAccount!(params);
      const sent = wagmi.sendCalls.mock.calls[0][1];
      expect(sent).toMatchObject({ account: ACCOUNT, chainId: 84532, forceAtomic: true });
      expect(sent.calls).toHaveLength(2);
      for (const call of sent.calls) expect(call).toMatchObject({ value: 0n });
      expect(wagmi.switchChain).toHaveBeenCalledWith(config, { chainId: 84532 });
    });

    // Live on MetaMask 13.55: its gas estimate leaves the batch out of gas (status 500), the authorization still applied
    it('goes by the code on the network, not by the status of the batch', async () => {
      wagmi.sendCalls.mockResolvedValue({ id: '0xbatch' });
      wagmi.waitForCallsStatus.mockResolvedValue({ status: 'failure', statusCode: 500 });
      wagmi.getBytecode.mockResolvedValue('0xef0100aa');
      await expect(adapter().upgradeToSmartAccount!(params)).resolves.toBeUndefined();
      wagmi.waitForCallsStatus.mockRejectedValueOnce(new Error('no status'));
      await expect(adapter().upgradeToSmartAccount!(params)).resolves.toBeUndefined();
    });

    it('fails when the account has no code after all', async () => {
      vi.useFakeTimers();
      try {
        wagmi.sendCalls.mockResolvedValue({ id: '0xbatch' });
        wagmi.waitForCallsStatus.mockResolvedValue({ status: 'success' });
        wagmi.getBytecode.mockResolvedValue('0x');
        const upgrading = adapter().upgradeToSmartAccount!(params);
        const failure = expect(upgrading).rejects.toMatchObject({ kind: 'failed' });
        await vi.runAllTimersAsync();
        await failure;
      } finally {
        vi.useRealTimers();
      }
    });

    it("leaves the buyer's refusal as it is", async () => {
      wagmi.sendCalls.mockRejectedValue({ code: 4001 });
      await expect(adapter().upgradeToSmartAccount!(params)).rejects.toMatchObject({ code: 4001 });
    });
  });

  // "The payment failed, only the fee was spent" with Pay live, for a batch that may still land: a second payment
  it('says a sponsored batch is not confirmed yet, and hands it over when it lands', async () => {
    let lands: (value: unknown) => void = () => undefined;
    wagmi.sendCalls.mockResolvedValue({ id: '0xbatch' });
    wagmi.waitForCallsStatus
      .mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'WaitForCallsStatusTimeoutError' }))
      .mockImplementationOnce(() => new Promise((resolve) => (lands = resolve)));
    const onLate = vi.fn();
    await expect(
      paymentsEVMAdapter(config).sendSponsoredCalls!({
        calls: [],
        paymasterUrl: 'https://quasar/paymaster',
        chainId: BASE_SEPOLIA,
        account: ACCOUNT,
        onLate,
      }),
    ).rejects.toMatchObject({ kind: 'sentUnconfirmed' });
    lands({ status: 'success', receipts: [{ transactionHash: '0xlate' }] });
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('0xlate'));
  });

  // The wallet took the batch: from here on nothing may say that nothing was sent, or the buyer pays again
  it('says a sponsored payment may have gone out when the status read fails after the wallet took it', async () => {
    let lands!: (value: unknown) => void;
    wagmi.sendCalls.mockResolvedValue({ id: 'batch-1' });
    wagmi.waitForCallsStatus
      .mockRejectedValueOnce(new Error('ConnectorNotConnectedError'))
      .mockImplementationOnce(() => new Promise((resolve) => (lands = resolve)));
    const onLate = vi.fn();
    await expect(
      paymentsEVMAdapter(config).sendSponsoredCalls!({
        calls: [],
        paymasterUrl: 'https://quasar/paymaster',
        chainId: BASE_SEPOLIA,
        account: ACCOUNT,
        onLate,
      }),
    ).rejects.toMatchObject({ kind: 'sentUnconfirmed' });
    lands({ status: 'success', receipts: [{ transactionHash: '0xlate' }] });
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('0xlate'));
  });

  it('says a sponsored payment may have gone out when the wallet reports success with no receipt', async () => {
    wagmi.sendCalls.mockResolvedValue({ id: 'batch-1' });
    wagmi.waitForCallsStatus
      .mockResolvedValueOnce({ status: 'success', receipts: [] })
      .mockImplementationOnce(() => new Promise(() => undefined));
    await expect(
      paymentsEVMAdapter(config).sendSponsoredCalls!({
        calls: [],
        paymasterUrl: 'https://quasar/paymaster',
        chainId: BASE_SEPOLIA,
        account: ACCOUNT,
      }),
    ).rejects.toMatchObject({ kind: 'sentUnconfirmed' });
  });

  it('keeps following a batch after a failed read until its hash comes', async () => {
    vi.useFakeTimers();
    try {
      wagmi.sendCalls.mockResolvedValue({ id: 'batch-1' });
      wagmi.waitForCallsStatus
        .mockRejectedValueOnce(new Error('session dropped'))
        .mockRejectedValueOnce(new Error('session dropped'))
        .mockResolvedValueOnce({ status: 'success', receipts: [{ transactionHash: '0xlate' }] });
      const onLate = vi.fn();
      await expect(
        paymentsEVMAdapter(config).sendSponsoredCalls!({
          calls: [],
          paymasterUrl: 'https://quasar/paymaster',
          chainId: BASE_SEPOLIA,
          account: ACCOUNT,
          onLate,
        }),
      ).rejects.toMatchObject({ kind: 'sentUnconfirmed' });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(onLate).toHaveBeenCalledWith('0xlate');
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells when the wallet took a batch, and follows one taken before a reload', async () => {
    wagmi.sendCalls.mockResolvedValue({ id: 'batch-1' });
    wagmi.waitForCallsStatus.mockResolvedValueOnce({ status: 'success', receipts: [{ transactionHash: '0xdone' }] });
    const onAccepted = vi.fn();
    await paymentsEVMAdapter(config).sendSponsoredCalls!({
      calls: [],
      paymasterUrl: 'u',
      chainId: BASE_SEPOLIA,
      account: ACCOUNT,
      onAccepted,
    });
    expect(onAccepted).toHaveBeenCalledWith('batch-1');

    wagmi.waitForCallsStatus.mockResolvedValueOnce({ status: 'success', receipts: [{ transactionHash: '0xlate' }] });
    const onLate = vi.fn();
    paymentsEVMAdapter(config).followSponsoredCalls!({ batchId: 'batch-1', until: Date.now() + 60_000, onLate });
    await vi.waitFor(() => expect(onLate).toHaveBeenCalledWith('0xlate'));
  });

  describe('revoking a permission', () => {
    const revoke = () =>
      paymentsEVMAdapter(config).revokePermission!({
        revocation: { to: MERCHANT, data: '0x3ed01015' },
        chainId: BASE_SEPOLIA,
        account: ACCOUNT,
      });
    beforeEach(() => {
      wagmi.sendTransaction.mockResolvedValue('0xrevoke');
    });

    it('gives the wait for the receipt a limit: it reads the network for as long as it runs', async () => {
      wagmi.waitForTransactionReceipt.mockResolvedValue({ status: 'success' });
      await revoke();
      expect(wagmi.waitForTransactionReceipt).toHaveBeenCalledWith(config, {
        chainId: 84532,
        hash: '0xrevoke',
        timeout: 180_000,
      });
    });

    it('says failed for a revert, as nothing is left to wait for', async () => {
      wagmi.waitForTransactionReceipt.mockRejectedValue(new Error('unknown reason'));
      wagmi.getTransactionReceipt.mockResolvedValue({ status: 'reverted' });
      await expect(revoke()).rejects.toMatchObject({ kind: 'failed' });
    });

    it('passes on any other end of the wait: the transaction may still land', async () => {
      const ranOut = new Error('timed out');
      wagmi.waitForTransactionReceipt.mockRejectedValue(ranOut);
      wagmi.getTransactionReceipt.mockRejectedValue(new Error('not found'));
      await expect(revoke()).rejects.toBe(ranOut);
    });

    it('refuses a Safe', async () => {
      wagmi.getConnection.mockReturnValue({ connector: { id: 'safe', type: 'safe' } });
      await expect(revoke()).rejects.toMatchObject({ kind: 'unsupported' });
      expect(wagmi.sendTransaction).not.toHaveBeenCalled();
    });
  });

  describe('a Safe connected through WalletConnect', () => {
    const connectedThrough = (name: string) =>
      wagmi.getConnection.mockReturnValue({
        connector: {
          id: 'walletConnect',
          type: 'walletConnect',
          getProvider: async () => ({ session: { peer: { metadata: { name } } } }),
        },
      });

    it.each(['Safe{Wallet}', 'Safe', 'safe wallet'])(
      'refuses %s: its hash is not a transaction Quasar can follow',
      async (name) => {
        connectedThrough(name);
        const adapter = paymentsEVMAdapter(config);
        await expect(adapter.sendTransfer({ instructions: usdc, account: ACCOUNT })).rejects.toMatchObject({
          kind: 'unsupported',
        });
        await expect(
          adapter.signMessage!({ message: 'm', account: ACCOUNT, chainId: BASE_SEPOLIA }),
        ).rejects.toMatchObject({
          kind: 'unsupported',
        });
        await expect(
          adapter.signTransferAuthorization!({ typedData: { domain: { chainId: 84532 } } as never, account: ACCOUNT }),
        ).rejects.toMatchObject({ kind: 'unsupported' });
        await expect(
          adapter.sendSponsoredCalls!({ calls: [], paymasterUrl: 'u', chainId: BASE_SEPOLIA, account: ACCOUNT }),
        ).rejects.toMatchObject({ kind: 'unsupported' });
        expect(wagmi.writeContract).not.toHaveBeenCalled();
        expect(wagmi.getConnectorClient).not.toHaveBeenCalled();
      },
    );

    it('lets SafePal pay: it is another wallet that sends its own transactions', async () => {
      connectedThrough('SafePal');
      wagmi.writeContract.mockResolvedValue('0xhash');
      await expect(paymentsEVMAdapter(config).sendTransfer({ instructions: usdc, account: ACCOUNT })).resolves.toBe(
        '0xhash',
      );
    });

    it('lets a wallet pay when its session cannot be read: nothing says it is a Safe', async () => {
      wagmi.getConnection.mockReturnValue({
        connector: { id: 'walletConnect', type: 'walletConnect', getProvider: () => Promise.reject(new Error('no')) },
      });
      wagmi.writeContract.mockResolvedValue('0xhash');
      await expect(paymentsEVMAdapter(config).sendTransfer({ instructions: usdc, account: ACCOUNT })).resolves.toBe(
        '0xhash',
      );
    });
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

  it('signs the payer confirmation of Quasar with personal_sign, exactly as Quasar wrote it', async () => {
    wagmi.signMessage.mockResolvedValue('0xsigned');
    const message = 'shop.example wants you to sign in with your Ethereum account:\n0x1111…';
    await expect(
      paymentsEVMAdapter(config).signMessage!({ message, account: ACCOUNT, chainId: BASE_SEPOLIA }),
    ).resolves.toBe('0xsigned');
    expect(wagmi.signMessage).toHaveBeenCalledWith(config, { account: ACCOUNT, message });
  });

  it('refuses to confirm a Safe, which cannot pay this checkout', async () => {
    wagmi.getConnection.mockReturnValue({ connector: { id: 'safe', type: 'safe' } });
    await expect(
      paymentsEVMAdapter(config).signMessage!({ message: 'm', account: ACCOUNT, chainId: BASE_SEPOLIA }),
    ).rejects.toMatchObject({ kind: 'unsupported' });
    expect(wagmi.signMessage).not.toHaveBeenCalled();
  });
});
