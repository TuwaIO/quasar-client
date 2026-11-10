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
  getTransactionReceipt,
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
import { PaymentWalletError, walletErrorKind } from '../utils/walletErrors';

/** How long a sponsored payment may take to be included, in milliseconds. */
const CALLS_TIMEOUT_MS = 180_000;
/** How long a sponsored payment past {@link CALLS_TIMEOUT_MS} is still followed, in milliseconds. */
const CALLS_LATE_TIMEOUT_MS = 30 * 60_000;
/** How long to wait before reading a batch again after a read failed. */
const CALLS_LATE_READ_MS = 15_000;

/**
 * How much gas a transfer gets above the app RPC's estimate, in percent. Gas the transaction does not use is not paid,
 * and a recipient with an EIP-7702 delegation runs code on receipt, which a wallet's own estimate may leave out.
 */
const GAS_HEADROOM_PERCENT = 25n;

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
 * The gas limit of a transfer: the app RPC's estimate plus {@link GAS_HEADROOM_PERCENT}, rounded up; none when the
 * estimate fails, and the wallet estimates itself.
 */
async function gasLimit(
  config: Config,
  account: Address,
  instructions: Extract<PaymentInstructions, { family: 'eip155' }>,
): Promise<{ gas?: bigint }> {
  try {
    const estimate = await estimateGas(config, {
      account,
      chainId: instructions.chainId,
      ...transferRequest(instructions),
    });
    return { gas: (estimate * (100n + GAS_HEADROOM_PERCENT) + 99n) / 100n };
  } catch {
    return {};
  }
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
 * switch networks, sends the transfer (native coin or ERC-20 `transfer`; the native coin with the gas limit the app's
 * RPC estimates plus 25%, as a recipient with an EIP-7702 delegation runs code on receipt; the wallet estimates the
 * gas of a token transfer, and of any transfer when that read fails),
 * signs the EIP-3009 authorization of a gasless quote with `eth_signTypedData_v4` exactly as Quasar issued it, signs
 * Quasar's message that confirms the paying wallet with `personal_sign`, and sends sponsored calls with
 * `wallet_sendCalls` and the checkout's ERC-7677 paymaster. Before each of these four requests, a wallet that reports
 * another network than the request's is asked to switch (wagmi would refuse the request before the wallet saw it); a
 * switch that fails is a `PaymentWalletError` of the kind `switchFailed`, a refused one stays `declined`, both with
 * `step: 'switch'`. A Safe wallet
 * is refused: it returns a Safe transaction hash, not the transaction Quasar follows. Pass it in `adapters` of
 * `NovaPaymentsProvider`.
 *
 * Side effects: RPC reads through the wagmi transports (`eth_estimateGas` before each transfer); wallet prompts,
 * including a network switch.
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

  // wagmi refuses a request bound to a network when the wallet is on another one (`ConnectorChainMismatchError`), before
  // the wallet sees it, and the page may not know: MetaMask on a phone, through WalletConnect, stayed on another network
  // and the buyer got an error with nothing in the wallet (owner test 2026-11-05, finding 6). So the wallet is asked to
  // switch first, and only when the network it reports is another one: a switch to where it is would prompt for nothing
  const onChain = async (chainId: number) => {
    let current: number | undefined;
    try {
      current = await getConnection(config).connector?.getChainId();
    } catch {
      // A wallet that does not tell its network: wagmi's own check decides
      return;
    }
    if (current === undefined || current === chainId) return;
    try {
      await switchChain(config, { chainId });
    } catch (error) {
      // A refusal stays a refusal, of the switch and not of the request that never showed; a request already waiting
      // stays one; anything else is a switch that did not happen
      const kind = walletErrorKind(error);
      if (kind === 'declined') {
        throw new PaymentWalletError('declined', `The wallet declined the switch to ${chainId}`, {
          cause: error,
          step: 'switch',
        });
      }
      if (kind !== 'failed') throw error;
      throw new PaymentWalletError('switchFailed', `The wallet did not switch to ${chainId}`, {
        cause: error,
        step: 'switch',
      });
    }
  };

  // A batch's transaction still reaches Quasar when it comes. A failed read says nothing about the batch: a dropped session or
  // a disconnected wallet may come back, and the batch lands either way
  const followBatch = async (id: string, until: number, onLate?: (txKey: string) => void) => {
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
      await onChain(evm.chainId);
      if (evm.token === 'native') {
        // The gas limit comes from the app's RPC, not the wallet: OneKey's own limit left a payment to a merchant with an
        // EIP-7702 delegation out of gas (owner test 2026-11-05, finding 5). A failed estimate leaves it to the wallet.
        // A token transfer runs no code of the recipient, and its gas stays the wallet's (review 11-10: MetaMask's own
        // margin covers a balance slot written from zero, which 25% over an earlier estimate may not)
        const gas = await gasLimit(config, account as Address, evm);
        return sendTransaction(config, {
          account: account as Address,
          chainId: evm.chainId,
          to: evm.to as Address,
          value: BigInt(evm.amount),
          ...gas,
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
      const chainId = Number(typedData.domain.chainId);
      await onChain(chainId);
      const client = await getConnectorClient(config, { chainId });
      return client.request({
        method: 'eth_signTypedData_v4',
        params: [account as Address, JSON.stringify(typedData)],
      });
    },

    signMessage: async ({ message, account, chainId }) => {
      // A Safe cannot pay this checkout, so it does not confirm the invoice either
      await refuseSafe();
      // A smart wallet signs for the network it is on: the one the confirmation is for
      const id = toEvmChainId(chainId);
      if (id !== undefined) await onChain(id);
      return signMessage(config, { account: account as Address, message });
    },

    followSponsoredCalls: ({ batchId, until, onLate }) => {
      void followBatch(batchId, until, onLate).catch(() => undefined);
    },

    sendSponsoredCalls: async ({ calls, paymasterUrl, chainId, account, onSent, onAccepted, onLate }) => {
      await refuseSafe();
      await onChain(evmChainId(chainId));
      const { id } = await sendCalls(config, {
        account: account as Address,
        chainId: evmChainId(chainId),
        calls: calls.map((call) => ({ to: call.to as Address, value: BigInt(call.value), data: call.data as Hex })),
        capabilities: { paymasterService: { url: paymasterUrl } },
      });
      onAccepted?.(id);
      onSent?.();
      // From here on the wallet has the batch and it may still land: "nothing was sent" would invite a second payment.
      // Only a batch whose own status says that it failed is a failure
      const notConfirmed = (cause?: unknown) => {
        void followBatch(id, Date.now() + CALLS_LATE_TIMEOUT_MS, onLate).catch(() => undefined);
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
      await refuseSafe();
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
      await refuseSafe();
      const chain = evmChainId(chainId);
      await switchChain(config, { chainId: chain });
      const hash = await sendTransaction(config, {
        account: account as Address,
        chainId: chain,
        to: revocation.to as Address,
        data: revocation.data as Hex,
      });
      onSent?.();
      try {
        await waitForTransactionReceipt(config, { chainId: chain, hash, timeout: CALLS_TIMEOUT_MS });
      } catch (error) {
        // wagmi throws a plain error on a reverted receipt, and so does a wait that ran out. Only the receipt tells them
        // apart: a reverted revocation left nothing to wait for, and the wallet may be asked again
        const receipt = await getTransactionReceipt(config, { chainId: chain, hash }).catch(() => null);
        if (receipt?.status === 'reverted') {
          throw new PaymentWalletError('failed', 'The revocation reverted', { cause: error });
        }
        throw error;
      }
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
