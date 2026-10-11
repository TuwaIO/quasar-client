import { OrbitAdapter, toEvmChainId } from '@tuwaio/orbit-core';
import { type EvmTransaction, TransactionTracker } from '@tuwaio/pulsar-core';
import type { PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';
import {
  type Config,
  estimateFeesPerGas,
  estimateGas,
  getBalance,
  getCapabilities,
  getConnection,
  getConnectorClient,
  readContract,
  sendCalls,
  sendTransaction,
  switchChain,
  waitForCallsStatus,
  writeContract,
} from '@wagmi/core';
import { type Address, encodeFunctionData, erc20Abi, type Hex } from 'viem';

import type { PaymentsAdapter } from '../adapters/types';
import { PaymentWalletError } from '../utils/walletErrors';

/** How long a sponsored payment may take to be included, in milliseconds. */
const CALLS_TIMEOUT_MS = 180_000;

/** The EVM chain ID of a CAIP-2 chain. */
function evmChainId(chainId: string): number {
  const id = toEvmChainId(chainId);
  if (id === undefined) throw new Error(`${chainId} is not an EVM chain`);
  return id;
}

/** The EVM instructions of a quote. */
function evmInstructions(instructions: PaymentInstructions) {
  if (instructions.family !== 'eip155') throw new Error(`${instructions.chainId} is not an EVM chain`);
  return instructions;
}

/** The transaction that moves the quoted amount: a native transfer, or an ERC-20 `transfer` call. */
function transferRequest(instructions: Extract<PaymentInstructions, { family: 'eip155' }>) {
  if (instructions.token === 'native') return { to: instructions.to as Address, value: BigInt(instructions.amount) };
  return {
    to: instructions.token as Address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [instructions.to as Address, BigInt(instructions.amount)],
    }),
  };
}

/**
 * The adapter that pays EVM methods of a Nova Payments checkout from the wallet connected through wagmi (the config
 * Satellite Connect and Nova Connect use). It reads balances and estimates fees on the network, asks the wallet to
 * switch networks, sends the transfer (native coin or ERC-20 `transfer`), signs the EIP-3009 authorization of a gasless
 * quote with `eth_signTypedData_v4` exactly as Quasar issued it, and sends sponsored calls with `wallet_sendCalls` and
 * the checkout's ERC-7677 paymaster. A Safe wallet is refused: it returns a Safe transaction hash, not the transaction
 * Quasar follows. Pass it in `adapters` of `NovaPaymentsProvider`.
 *
 * Side effects: RPC reads through the wagmi transports; wallet prompts.
 *
 * @param config - The wagmi config of the app.
 * @returns The EVM adapter.
 *
 * @example
 * ```tsx
 * import { NovaPaymentsProvider } from '@tuwaio/nova-payments';
 * import { paymentsEVMAdapter } from '@tuwaio/nova-payments/evm';
 *
 * const adapters = [paymentsEVMAdapter(wagmiConfig)];
 *
 * export function Payments({ children }: { children: React.ReactNode }) {
 *   return <NovaPaymentsProvider adapters={adapters}>{children}</NovaPaymentsProvider>;
 * }
 * ```
 */
export function paymentsEVMAdapter(config: Config): PaymentsAdapter {
  const refuseSafe = () => {
    const connector = getConnection(config).connector;
    if (connector?.id === 'safe' || connector?.type === 'safe') {
      throw new PaymentWalletError('unsupported', 'A Safe wallet cannot pay this checkout');
    }
  };

  return {
    family: 'eip155',

    getBalance: async ({ chainId, account, token }) => {
      const id = evmChainId(chainId);
      if (token === 'native') return (await getBalance(config, { address: account as Address, chainId: id })).value;
      return readContract(config, {
        address: token as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account as Address],
        chainId: id,
      });
    },

    estimateFee: async ({ instructions, account }) => {
      const evm = evmInstructions(instructions);
      const gas = await estimateGas(config, {
        account: account as Address,
        chainId: evm.chainId,
        ...transferRequest(evm),
      });
      const fees = await estimateFeesPerGas(config, { chainId: evm.chainId });
      const price = fees.maxFeePerGas ?? fees.gasPrice;
      if (price === undefined) return null;
      const native = config.chains.find((chain) => chain.id === evm.chainId)?.nativeCurrency;
      return { amount: gas * price, decimals: native?.decimals ?? 18, symbol: native?.symbol ?? 'ETH' };
    },

    canSponsorCalls: async ({ chainId, account }) => {
      try {
        const capabilities = await getCapabilities(config, {
          account: account as Address,
          chainId: evmChainId(chainId),
        });
        return (capabilities as { paymasterService?: { supported?: boolean } }).paymasterService?.supported === true;
      } catch {
        // A wallet without EIP-5792 does not answer: it cannot take a paymaster
        return false;
      }
    },

    switchChain: async (chainId) => {
      await switchChain(config, { chainId: evmChainId(chainId) });
    },

    sendTransfer: async ({ instructions, account }) => {
      const evm = evmInstructions(instructions);
      refuseSafe();
      if (evm.token === 'native') {
        return sendTransaction(config, {
          account: account as Address,
          chainId: evm.chainId,
          to: evm.to as Address,
          value: BigInt(evm.amount),
        });
      }
      return writeContract(config, {
        account: account as Address,
        chainId: evm.chainId,
        address: evm.token as Address,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [evm.to as Address, BigInt(evm.amount)],
      });
    },

    signTransferAuthorization: async ({ typedData, account }) => {
      // The wallet must be on the chain of the token's domain; the typed data is signed exactly as Quasar issued it
      const client = await getConnectorClient(config, { chainId: Number(typedData.domain.chainId) });
      return client.request({
        method: 'eth_signTypedData_v4',
        params: [account as Address, JSON.stringify(typedData)],
      });
    },

    sendSponsoredCalls: async ({ calls, paymasterUrl, chainId, account, onSent }) => {
      refuseSafe();
      const { id } = await sendCalls(config, {
        account: account as Address,
        chainId: evmChainId(chainId),
        calls: calls.map((call) => ({ to: call.to as Address, value: BigInt(call.value), data: call.data as Hex })),
        capabilities: { paymasterService: { url: paymasterUrl } },
      });
      onSent?.();
      const result = await waitForCallsStatus(config, { id, timeout: CALLS_TIMEOUT_MS });
      const hash = result.status === 'success' ? result.receipts?.at(-1)?.transactionHash : undefined;
      if (!hash) throw new PaymentWalletError('failed', 'The sponsored payment failed');
      return hash;
    },

    pulsarTransaction: ({ txKey, instructions, account, connectorType, title, description, payload }) => {
      const evm = evmInstructions(instructions);
      const transaction: EvmTransaction = {
        adapter: OrbitAdapter.EVM,
        tracker: TransactionTracker.Ethereum,
        txKey,
        hash: txKey as Hex,
        chainId: evm.chainId,
        from: account,
        to: (evm.token === 'native' ? evm.to : evm.token) as Address,
        type: 'payment',
        connectorType,
        title,
        description,
        payload,
        pending: true,
        localTimestamp: Math.floor(Date.now() / 1000),
        isTrackedModalOpen: false,
      };
      return transaction;
    },
  };
}
