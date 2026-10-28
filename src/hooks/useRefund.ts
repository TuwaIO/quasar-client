import type {
  CheckoutError,
  PaymentInstructions,
  RefundPhase,
  RefundState,
  RefundStore,
} from '@tuwaio/quasar-sdk/checkout';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import type { NativeFee } from '../adapters/types';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { formatTokenAmount } from '../utils/format';
import { type CheckoutWallet, networkName, type PaymentFamily } from '../utils/methods';
import { instructionsChainId } from '../utils/pay';
import { refundTransfer } from '../utils/refund';
import { walletErrorKind } from '../utils/walletErrors';
import { useAsyncValue } from './useAsyncValue';
import { useConnectedWallet } from './useConnectedWallet';
import { useNovaPayments } from './useNovaPayments';
import { useWalletConnection } from './useWalletConnection';

/** What a refund asks for: the amount and mode `start` takes (`RefundParams` of `@tuwaio/quasar-sdk`). */
export type RefundRequest = Parameters<RefundState['start']>[1];

/**
 * Where a refund stands for the merchant: `amount` (what to refund), `requesting`, `connect` (a wallet of the
 * payment's network), `confirm`, `switching` and `wallet` (the wallet asks), `submitting`, `confirming` (the network
 * confirms it), `confirmed` or `failed`.
 */
export type RefundStep =
  | 'amount'
  | 'requesting'
  | 'connect'
  | 'confirm'
  | 'switching'
  | 'wallet'
  | 'submitting'
  | 'confirming'
  | 'confirmed'
  | 'failed';

/**
 * Why a refund was not sent: the wallet holds too little (`notEnough`), the merchant declined, the wallet cannot send
 * it or sent it on another network, it failed, or Quasar does not know the payer (`noRecipient`).
 */
export type RefundProblem = 'notEnough' | 'declined' | 'unsupported' | 'wrongNetwork' | 'failed' | 'noRecipient';

// The transaction a wallet sent for a refund of a store, kept past the window that sent it: until Quasar takes it,
// the next send hands it over again instead of sending a second one
const sentTransactions = new WeakMap<RefundStore, { refundId: string; txKey: string }>();

/** What {@link useRefund} needs. */
export interface UseRefundParams {
  /** The refund store (`createRefundStore` of `@tuwaio/quasar-sdk/checkout`). */
  store: RefundStore;
  /** The paid invoice to refund. */
  invoiceId: string;
  /** Its number, for the transaction in Pulsar (the ID without one). */
  invoice?: string;
  /** The refund the app worked out: asked for at once, without the amount step. */
  params?: RefundRequest;
  /** The labels of the language. */
  labels: NovaPaymentsLabels;
  /** The language, for amounts. */
  locale: string;
  /**
   * Connects a wallet of the payment's chain family, for apps without Nova Connect (the `onConnectWallet` of
   * `NovaPaymentsProvider` otherwise). Inside `NovaConnectProvider` the refund opens its connect modal instead.
   *
   * @param family - The chain family of the payment.
   */
  onConnectWallet?: (family: PaymentFamily) => void;
}

/** What {@link useRefund} returns. */
export interface RefundFlow {
  /** Where the refund stands. */
  step: RefundStep;
  /** The refund store's phase. */
  phase: RefundPhase;
  /** The refund, once asked for. */
  refund: RefundState['refund'];
  /** Why the last request to Quasar failed. */
  error: CheckoutError | null;
  /** What the wallet sends, or `null` before the refund is asked for or without a payer. */
  transfer: PaymentInstructions | null;
  /** The CAIP-2 chain of the payment. */
  chainId: string | null;
  /** The name of its network. */
  network: string;
  /** The amount to send with its symbol. */
  amount: string;
  /** The connected wallet, when it is of the payment's chain family. */
  wallet: CheckoutWallet | null;
  /** Whether the EVM wallet is on another network than the payment's: {@link RefundFlow.switchNetwork} first. */
  wrongNetwork: boolean;
  /** What the wallet holds of the asset: `undefined` while read, `null` when unknown. */
  balance: bigint | null | undefined;
  /** The estimated network fee. */
  fee: NativeFee | null | undefined;
  /** Why the refund was not sent, until the next try. */
  problem: RefundProblem | null;
  /** The transaction the wallet sent; while Quasar has not taken it, {@link RefundFlow.send} hands it over again. */
  txKey: string | null;
  /** Whether the page can connect a wallet. */
  canConnect: boolean;
  /** Whether the connect modal is open. */
  connecting: boolean;
  /**
   * Asks Quasar for the refund.
   *
   * @param params - Amount, mode and reason.
   */
  start: (params: RefundRequest) => Promise<void>;
  /** Asks the merchant to connect a wallet of the payment's chain family. */
  connect: () => void;
  /** Asks the EVM wallet to switch to the payment's network; sends nothing. */
  switchNetwork: () => Promise<void>;
  /** Sends the refund from the wallet (switching its network first) and hands its transaction to Quasar. */
  send: () => Promise<void>;
}

/**
 * Refunds a payment from the merchant's connected wallet (spec §7.5): asks Quasar for the refund through the store,
 * sends its transfer to the payer with the payments adapter of the chain family (switching the wallet to the payment's
 * network first, and never prompting a wallet that holds too little), hands the transaction to Quasar and lets the
 * store follow it until Quasar confirms it and issues the credit note. A transaction the wallet sent is handed over
 * again on the next {@link RefundFlow.send}, never sent twice. With the app's Pulsar store (`pulsar` of
 * `NovaPaymentsProvider`) and an adapter that describes its transactions, the refund is also tracked by Pulsar, and
 * Nova Transactions shows its toast.
 *
 * Side effects: the store's calls; wallet prompts; balance and fee reads from the network; the Pulsar store.
 *
 * @param params - See {@link UseRefundParams}.
 * @returns See {@link RefundFlow}.
 */
export function useRefund({
  store,
  invoiceId,
  invoice,
  params,
  labels,
  locale,
  onConnectWallet,
}: UseRefundParams): RefundFlow {
  const state = useStore(store);
  const { adapters, pulsar } = useNovaPayments();
  const connected = useConnectedWallet();
  const connection = useWalletConnection(onConnectWallet);
  const [status, setStatus] = useState<'idle' | 'switching' | 'wallet'>('idle');
  const [problem, setProblem] = useState<RefundProblem | null>(null);
  const [, rerender] = useState(0);
  // A refund the app worked out is asked for once
  const started = useRef(false);

  const sent = sentTransactions.get(store);
  const txKey = sent && sent.refundId === state.refund?.id ? sent.txKey : null;
  const transfer = state.instructions ? refundTransfer(state.instructions) : null;
  const family: PaymentFamily | null = transfer?.family ?? null;
  const chainId = transfer ? instructionsChainId(transfer) : (state.instructions?.chainId ?? null);
  const adapter = adapters?.find((item) => item.family === family);
  const wallet = connected && connected.family === family ? connected : null;
  const network = chainId ? networkName(chainId) : '';
  const wrongNetwork = Boolean(wallet && family === 'eip155' && chainId && wallet.chainId !== chainId);
  const asked = state.instructions;
  const amount = asked ? `${formatTokenAmount(asked.amount, asked.decimals, locale)} ${asked.symbol}` : '';

  const balance = useAsyncValue(
    transfer && wallet && adapter ? `balance|${chainId}|${wallet.address}|${transfer.token}` : null,
    () => adapter!.getBalance({ chainId: chainId!, account: wallet!.address, token: transfer!.token }),
  );
  const fee = useAsyncValue(
    transfer && wallet && adapter?.estimateFee ? `fee|${chainId}|${wallet.address}|${transfer.token}` : null,
    () => adapter!.estimateFee!({ instructions: transfer!, account: wallet!.address }),
  );

  useEffect(() => {
    if (!params || started.current || store.getState().phase !== 'idle') return;
    started.current = true;
    void store.getState().start(invoiceId, params);
  }, [params, store, invoiceId]);

  const handOver = async (sent: string, from: CheckoutWallet, sentTransfer: PaymentInstructions) => {
    if (!pulsar || !adapter?.pulsarTransaction || !state.refund) return;
    const values = { invoice: invoice ?? invoiceId, amount };
    try {
      await pulsar.injectExternalPendingTxs([
        adapter.pulsarTransaction({
          txKey: sent,
          instructions: sentTransfer,
          account: from.address,
          connectorType: from.connectorType,
          title: formatLabel(labels.refund.txTitle, values),
          description: formatLabel(labels.refund.txDescription, values),
          payload: { quasarRefund: state.refund.id },
        }),
      ]);
    } catch {
      // Tracking is a convenience: Quasar follows the refund either way
    }
  };

  const switchNetwork = async () => {
    setProblem(null);
    if (!wrongNetwork || !adapter?.switchChain) return;
    try {
      setStatus('switching');
      await adapter.switchChain(chainId!);
    } catch (error) {
      setProblem(walletErrorKind(error));
    } finally {
      setStatus('idle');
    }
  };

  const send = async () => {
    setProblem(null);
    if (!transfer) return setProblem('noRecipient');
    if (!wallet || !adapter) return setProblem('unsupported');
    // Quasar did not take the transaction the wallet sent: hand it over again, never send a second one
    if (txKey) {
      await store.getState().submit({ txHash: txKey, from: wallet.address });
      return;
    }
    const needed = BigInt(transfer.amount) + (transfer.token === 'native' && fee ? fee.amount : 0n);
    if (typeof balance === 'bigint' && balance < needed) return setProblem('notEnough');
    try {
      if (wrongNetwork && adapter.switchChain) {
        setStatus('switching');
        await adapter.switchChain(chainId!);
      }
      setStatus('wallet');
      const hash = await adapter.sendTransfer({
        instructions: transfer,
        account: wallet.address,
        connection: wallet.connection,
      });
      if (state.refund) sentTransactions.set(store, { refundId: state.refund.id, txKey: hash });
      setStatus('idle');
      rerender((count) => count + 1);
      void handOver(hash, wallet, transfer);
      await store.getState().submit({ txHash: hash, from: wallet.address });
    } catch (error) {
      setStatus('idle');
      setProblem(walletErrorKind(error));
    }
  };

  const awaiting: RefundStep = status !== 'idle' ? status : wallet ? 'confirm' : 'connect';
  const step: RefundStep =
    state.phase === 'idle'
      ? params
        ? 'requesting'
        : 'amount'
      : state.phase === 'awaitingTransfer'
        ? awaiting
        : state.phase;

  return {
    step,
    phase: state.phase,
    refund: state.refund,
    error: state.error,
    transfer,
    chainId,
    network,
    amount,
    wallet,
    wrongNetwork,
    balance,
    fee,
    problem: problem ?? (state.instructions && !transfer ? 'noRecipient' : null),
    txKey,
    canConnect: connection.canConnect,
    connecting: connection.connecting,
    start: async (request) => {
      setProblem(null);
      sentTransactions.delete(store);
      await store.getState().start(invoiceId, request);
    },
    connect: () => {
      if (family) connection.connect(family);
    },
    switchNetwork,
    send,
  };
}
