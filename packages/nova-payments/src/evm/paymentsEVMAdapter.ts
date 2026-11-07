import { delay, OrbitAdapter, toEvmChainId } from '@tuwaio/orbit-core';
import { type EvmTransaction, TransactionTracker } from '@tuwaio/pulsar-core';
import type { PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';
import {
  type Config,
  estimateFeesPerGas,
  estimateGas,
  getBalance,
  getBytecode,
  getCapabilities,
  getConnection,
  getConnectorClient,
  readContract,
  sendCalls,
  sendTransaction,
  signMessage,
  switchChain,
  waitForCallsStatus,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core';
import { type Address, encodeFunctionData, erc20Abi, type Hex } from 'viem';

import type { PaymentsAdapter } from '../adapters/types';
import { PaymentWalletError } from '../utils/walletErrors';

/** How long a sponsored payment may take to be included, in milliseconds. */
const CALLS_TIMEOUT_MS = 180_000;
/** How long a sponsored payment past {@link CALLS_TIMEOUT_MS} is still followed, in milliseconds. */
const CALLS_LATE_TIMEOUT_MS = 30 * 60_000;
/** How long to wait before reading a batch again after a read failed. */
const CALLS_LATE_READ_MS = 15_000;

/** A call that moves nothing, to an address nothing runs at: the batch exists only for the switch it makes the wallet offer. */
const NO_OP_CALL = { to: '0x000000000000000000000000000000000000dEaD' as Address, value: 0n };
/** How many times the code of a switched account is read, and how far apart: RPC nodes lag behind the receipt. */
const UPGRADE_CHECKS = 5;
const UPGRADE_CHECK_EVERY_MS = 2000;

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
 * Whether the wallet behind a WalletConnect session is a Safe. Safe{Wallet} connects with the connector `walletConnect`
 * too, and then only the peer's name tells it apart. `SafePal` is another wallet that sends its own transactions, so the
 * name must be the whole word. A session that cannot be read says nothing about the wallet, which may pay.
 */
async function isSafeThroughWalletConnect(connector: ReturnType<typeof getConnection>['connector']): Promise<boolean> {
  if (connector?.type !== 'walletConnect') return false;
  try {
    const provider = (await connector.getProvider()) as { session?: { peer?: { metadata?: { name?: string } } } };
    return /^safe\b/i.test(provider.session?.peer?.metadata?.name ?? '');
  } catch {
    return false;
  }
}

/**
 * The adapter that pays EVM methods of a Nova Payments checkout from the wallet connected through wagmi (the config
 * Satellite Connect and Nova Connect use). It reads balances and estimates fees on the network, asks the wallet to
 * switch networks, sends the transfer (native coin or ERC-20 `transfer`), signs the EIP-3009 authorization of a gasless
 * quote with `eth_signTypedData_v4` exactly as Quasar issued it, signs Quasar's message that confirms the paying wallet
 * with `personal_sign`, and sends sponsored calls with `wallet_sendCalls` and the checkout's ERC-7677 paymaster. A Safe wallet is refused: it returns a Safe transaction hash, not the transaction
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
  const refuseSafe = async () => {
    const connector = getConnection(config).connector;
    if (connector?.id === 'safe' || connector?.type === 'safe' || (await isSafeThroughWalletConnect(connector))) {
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
      await refuseSafe();
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
      await refuseSafe();
      // The wallet must be on the chain of the token's domain; the typed data is signed exactly as Quasar issued it
      const client = await getConnectorClient(config, { chainId: Number(typedData.domain.chainId) });
      return client.request({
        method: 'eth_signTypedData_v4',
        params: [account as Address, JSON.stringify(typedData)],
      });
    },

    signMessage: async ({ message, account }) => {
      // A Safe cannot pay this checkout, so it does not confirm the invoice either
      await refuseSafe();
      return signMessage(config, { account: account as Address, message });
    },

    sendSponsoredCalls: async ({ calls, paymasterUrl, chainId, account, onSent, onLate }) => {
      await refuseSafe();
      const { id } = await sendCalls(config, {
        account: account as Address,
        chainId: evmChainId(chainId),
        calls: calls.map((call) => ({ to: call.to as Address, value: BigInt(call.value), data: call.data as Hex })),
        capabilities: { paymasterService: { url: paymasterUrl } },
      });
      onSent?.();
      // Its transaction still reaches Quasar when it comes. A failed read says nothing about the batch: a dropped
      // session or a disconnected wallet may come back, and the batch lands either way
      const followLate = async () => {
        const until = Date.now() + CALLS_LATE_TIMEOUT_MS;
        while (Date.now() < until) {
          try {
            const late = await waitForCallsStatus(config, { id, timeout: until - Date.now() });
            if (late.status === 'failure') return;
            const hash = late.status === 'success' ? late.receipts?.at(-1)?.transactionHash : undefined;
            if (hash) return onLate?.(hash);
          } catch {
            // Read again below
          }
          await delay(undefined, CALLS_LATE_READ_MS);
        }
      };
      // From here on the wallet has the batch and it may still land: "nothing was sent" would invite a second payment.
      // Only a batch whose own status says that it failed is a failure
      const notConfirmed = (cause?: unknown) => {
        void followLate().catch(() => undefined);
        return new PaymentWalletError('sentUnconfirmed', 'The sponsored payment is not confirmed yet', { cause });
      };
      const result = await waitForCallsStatus(config, { id, timeout: CALLS_TIMEOUT_MS }).catch((error: unknown) => {
        throw notConfirmed(error);
      });
      if (result.status === 'failure') throw new PaymentWalletError('failed', 'The sponsored payment failed');
      const hash = result.status === 'success' ? result.receipts?.at(-1)?.transactionHash : undefined;
      if (!hash) throw notConfirmed();
      return hash;
    },

    explorerUrl: ({ chainId, txKey }) => {
      const chain = config.chains.find((item) => item.id === toEvmChainId(chainId));
      const url = chain?.blockExplorers?.default.url;
      return url ? `${url}/tx/${txKey}` : undefined;
    },

    explorerAddressUrl: ({ chainId, address }) => {
      const chain = config.chains.find((item) => item.id === toEvmChainId(chainId));
      const url = chain?.blockExplorers?.default.url;
      return url ? `${url}/address/${address}` : undefined;
    },

    smartAccountStatus: async ({ chainId, account }) => {
      const id = evmChainId(chainId);
      try {
        const code = await getBytecode(config, { address: account as Address, chainId: id });
        if (code && code !== '0x') return 'smart';
        const capabilities = await getCapabilities(config, { account: account as Address, chainId: id });
        const atomic = (capabilities as { atomic?: { status?: string } }).atomic?.status;
        return atomic === 'ready' ? 'upgradable' : 'unknown';
      } catch {
        // A wallet without EIP-5792 does not answer, and nothing is known of it: Quasar decides on what it gives
        return 'unknown';
      }
    },

    upgradeToSmartAccount: async ({ chainId, account }) => {
      refuseSafe();
      const id = evmChainId(chainId);
      const address = account as Address;
      await switchChain(config, { chainId: id });
      // MetaMask 13.55 signs an ERC-7715 permission for a plain account without switching it to its smart account, and no
      // site may call `wallet_upgradeAccount`. Quasar then refuses the permission, rightly: nothing could ever charge it.
      // An atomic batch is what makes the wallet offer the switch itself. Checked live: it takes two calls, as MetaMask
      // sends a single call as a plain transaction and the account stays as it was. They move nothing
      const { id: batch } = await sendCalls(config, {
        account: address,
        chainId: id,
        forceAtomic: true,
        calls: [NO_OP_CALL, NO_OP_CALL],
      });
      // Its answer decides nothing. Checked live: MetaMask's gas estimate left the batch out of gas, status 500, with the
      // authorization of the same transaction applied. Only the code on the network says whether the account switched
      await waitForCallsStatus(config, { id: batch, timeout: CALLS_TIMEOUT_MS }).catch(() => undefined);
      for (let check = 0; check < UPGRADE_CHECKS; check++) {
        const code = await getBytecode(config, { address, chainId: id }).catch(() => undefined);
        if (code && code !== '0x') return;
        await new Promise((resolve) => setTimeout(resolve, UPGRADE_CHECK_EVERY_MS));
      }
      throw new PaymentWalletError('failed', 'The wallet did not switch the account');
    },

    requestPermission: async ({ request, account }) => {
      const chainId = Number.parseInt(request.chainId, 16);
      // The permission's network may not be the wallet's: the first payment may have gone on another one, and wagmi gives
      // no client until the wallet is on it
      await switchChain(config, { chainId });
      // The ERC-7715 request as MetaMask takes it (checked live with the Quasar engine), from the granting account
      const client = await getConnectorClient(config, { chainId });
      const response = (await client.request({
        method: 'wallet_requestExecutionPermissions',
        params: [{ ...request, from: account }],
      } as never)) as unknown;
      const [granted] = (Array.isArray(response) ? response : [response]) as {
        context?: string;
        delegationManager?: string;
        dependencies?: { factory: string; factoryData: string }[];
      }[];
      if (!granted?.context || !granted.delegationManager) {
        throw new PaymentWalletError('failed', 'The wallet did not grant the permission');
      }
      return {
        context: granted.context,
        delegationManager: granted.delegationManager,
        dependencies: granted.dependencies ?? [],
      };
    },

    revokePermission: async ({ revocation, chainId, account, onSent }) => {
      refuseSafe();
      const chain = evmChainId(chainId);
      await switchChain(config, { chainId: chain });
      const hash = await sendTransaction(config, {
        account: account as Address,
        chainId: chain,
        to: revocation.to as Address,
        data: revocation.data as Hex,
      });
      onSent?.();
      await waitForTransactionReceipt(config, { chainId: chain, hash });
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
