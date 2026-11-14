import { NovaConnectProviderContext, type NovaConnectProviderType } from '@tuwaio/nova-connect/hooks';
import {
  NovaPaymentsProvider,
  type PaymentFamily,
  type PaymentsAdapter,
  type PaymentsPulsar,
  PaymentWalletError,
} from '@tuwaio/nova-payments';
import type { Transaction } from '@tuwaio/pulsar-core';
import { SatelliteStoreContext } from '@tuwaio/satellite-react';
import { type ReactNode, useMemo, useState } from 'react';
import { action } from 'storybook/actions';
import { createStore } from 'zustand/vanilla';

/** A wallet connection as Satellite Connect keeps it. */
export interface SimulatedConnection {
  /** The account. */
  address: string;
  /** EVM chain ID, or the Solana cluster (`devnet`). */
  chainId: string | number;
  /** Connector type (`evm:metamask`, `solana:phantom`). */
  connectorType: string;
  /**
   * The wallet as it announces itself (EIP-6963, Wallet Standard): its name and icon, listed by `getConnectors()` of
   * the store under the family of `connectorType`.
   */
  wallet?: { name: string; icon?: string };
}

/** How the simulated wallet answers. */
export interface SimulatedWalletOptions {
  /** The balance of every token, in base units (default: plenty). */
  balance?: bigint;
  /** Balances of some tokens (`native` for the coin of the chain), over `balance`. */
  balances?: Record<string, bigint>;
  /** The buyer declines every wallet request. */
  decline?: boolean;
  /** The EVM wallet takes a paymaster (a smart wallet). */
  sponsor?: boolean;
  /** The Solana wallet is on another cluster than the payment's: the network refuses the transfer. */
  otherCluster?: boolean;
  /** The wallet cannot sign messages (the confirmation of the paying wallet). */
  cannotSign?: boolean;
  /** The signature request stays open in the wallet, never answered (to look at the wallet window). */
  signPending?: boolean;
}

/** The wallets "Connect" gives, by family: MetaMask on Ethereum (the wrong network for Base Sepolia), Phantom on devnet. */
const CONNECT_AS: Record<'evm' | 'solana', SimulatedConnection> = {
  evm: { address: '0x1111111111111111111111111111111111111111', chainId: 1, connectorType: 'evm:metamask' },
  solana: {
    address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    chainId: 'devnet',
    connectorType: 'solana:phantom',
  },
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The app's Pulsar store in the stories: the actions panel shows the payments a closed checkout hands over. */
const PULSAR: PaymentsPulsar = {
  injectExternalPendingTxs: async (transactions) => action('pulsar.injectExternalPendingTxs')(transactions),
};

/**
 * Wallets for the stories, without an extension: the active connection of a Satellite store, a Nova Connect whose
 * connect modal "connects" a wallet of the requested family after a moment, and chain adapters that answer like a
 * wallet (a delay, then a hash or a refusal) and switch the network in the store. The app's connection for Nova
 * Payments (`app`); with `novaConnect={false}` the app has no Nova Connect (`appStore`), and its own connect button
 * (`onConnectWallet` of `NovaPaymentsProvider`, see the actions panel) connects the wallet.
 */
export function SimulatedWallet({
  connection,
  options = {},
  novaConnect: withNovaConnect = true,
  children,
}: {
  connection?: SimulatedConnection;
  options?: SimulatedWalletOptions;
  novaConnect?: boolean;
  children: ReactNode;
}) {
  const store = useMemo(
    () =>
      createStore(() => ({
        activeConnection: connection,
        // The wallet lists of Satellite Connect: the connected wallet as it announces itself
        getConnectors: () =>
          connection?.wallet ? { [connection.connectorType.split(':')[0]]: [connection.wallet] } : {},
      })),
    [connection],
  );
  const [connecting, setConnecting] = useState(false);
  const {
    balance = 1_000_000_000_000n,
    balances,
    decline = false,
    sponsor = false,
    otherCluster = false,
    cannotSign = false,
    signPending = false,
  } = options;

  const adapters = useMemo<PaymentsAdapter[]>(() => {
    const answer = async (value: string) => {
      await wait(1500);
      if (decline) throw new PaymentWalletError('declined', 'The buyer declined');
      return value;
    };
    const balanceOf = async ({ token }: { token: string }) => balances?.[token] ?? balance;
    return [
      {
        family: 'eip155',
        getBalance: balanceOf,
        estimateFee: async () => ({ amount: 42_000_000_000_000n, decimals: 18, symbol: 'ETH' }),
        canSponsorCalls: async () => sponsor,
        switchChain: async (chainId) => {
          await wait(900);
          if (decline) throw new PaymentWalletError('declined', 'The buyer declined');
          const current = store.getState().activeConnection;
          if (current) store.setState({ activeConnection: { ...current, chainId: Number(chainId.split(':')[1]) } });
        },
        sendTransfer: () => answer(`0x${'ab'.repeat(32)}`),
        signTransferAuthorization: () => answer(`0x${'cd'.repeat(65)}`),
        // personal_sign of the message that confirms the paying wallet
        signMessage: async () => {
          if (cannotSign) throw new PaymentWalletError('unsupported', 'The wallet cannot sign messages');
          if (signPending) return new Promise<string>(() => undefined);
          return answer(`0x${'5a'.repeat(65)}`);
        },
        sendSponsoredCalls: async ({ onSent }) => {
          const hash = await answer(`0x${'ef'.repeat(32)}`);
          onSent?.();
          return hash;
        },
        explorerUrl: ({ txKey }) => `https://sepolia.basescan.org/tx/${txKey}`,
        // The transaction the app's Pulsar store would track after the checkout closed
        pulsarTransaction: (params) => ({ adapter: 'evm', ...params }) as unknown as Transaction,
      },
      {
        family: 'solana',
        getBalance: balanceOf,
        estimateFee: async () => ({ amount: 5000n, decimals: 9, symbol: 'SOL' }),
        sendTransfer: async () => {
          const signature = await answer('5'.repeat(88));
          if (otherCluster) throw new PaymentWalletError('wrongNetwork', 'Blockhash not found');
          return signature;
        },
        explorerUrl: ({ txKey }) => `https://explorer.solana.com/tx/${txKey}?cluster=devnet`,
        pulsarTransaction: (params) => ({ adapter: 'solana', ...params }) as unknown as Transaction,
      },
    ];
  }, [store, balance, balances, decline, sponsor, otherCluster, cannotSign, signPending]);

  const novaConnect = useMemo(
    () =>
      ({
        isConnectModalOpen: connecting,
        setIsConnectModalOpen: (open: boolean, request?: { adapter?: string }) => {
          setConnecting(open);
          if (!open) return;
          setTimeout(() => {
            store.setState({ activeConnection: CONNECT_AS[request?.adapter === 'solana' ? 'solana' : 'evm'] });
            setConnecting(false);
          }, 900);
        },
      }) as unknown as NovaConnectProviderType,
    [connecting, store],
  );

  // The app's own connect button, for an app without Nova Connect
  const onConnectWallet = useMemo(
    () =>
      withNovaConnect
        ? undefined
        : (family: PaymentFamily) => {
            action('onConnectWallet')(family);
            setTimeout(
              () => store.setState({ activeConnection: CONNECT_AS[family === 'solana' ? 'solana' : 'evm'] }),
              900,
            );
          },
    [withNovaConnect, store],
  );

  const payments = (
    <NovaPaymentsProvider adapters={adapters} pulsar={PULSAR} onConnectWallet={onConnectWallet}>
      {children}
    </NovaPaymentsProvider>
  );
  return (
    <SatelliteStoreContext.Provider
      value={store as unknown as Parameters<typeof SatelliteStoreContext.Provider>[0]['value']}
    >
      {withNovaConnect ? (
        <NovaConnectProviderContext.Provider value={novaConnect}>{payments}</NovaConnectProviderContext.Provider>
      ) : (
        payments
      )}
    </SatelliteStoreContext.Provider>
  );
}
