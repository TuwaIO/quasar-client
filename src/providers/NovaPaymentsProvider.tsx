import type { NovaConnectProviderPropsWithCustomization } from '@tuwaio/nova-connect';
import type { SatelliteConnectProviderProps } from '@tuwaio/satellite-react';
import { type ReactNode, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { CheckoutLocale, NovaPaymentsLabelOverrides, NovaPaymentsLabels } from '../i18n';
import type { PaymentsPulsar } from '../utils/handOver';
import type { PaymentFamily } from '../utils/methods';
import { useDetectedPaymentsConnection } from './detectConnection';
import { NovaPaymentsContext, type PaymentsConnectionMode } from './novaPaymentsContext';
import { LazyOwnConnection } from './ownConnectionLoader';

/** What the labels customization of {@link NovaPaymentsProvider} gets with the labels it transforms. */
export interface NovaPaymentsLabelsContext {
  /** The language of the checkout. */
  locale: CheckoutLocale | string;
}

/** Customization of {@link NovaPaymentsProvider}. */
export type NovaPaymentsProviderCustomization = {
  /** Labels. */
  labels?: {
    /**
     * Changes the labels of a language after the built-in ones and `labels` are applied, for example to translate a
     * language the package does not have.
     *
     * @param labels - The labels of the language with `labels` applied.
     * @param context - The language.
     * @returns The labels to use.
     */
    transform?: (labels: NovaPaymentsLabels, context: NovaPaymentsLabelsContext) => NovaPaymentsLabels;
  };
};

/**
 * The wallet connection Nova brings when the app has no `SatelliteConnectProvider` above {@link NovaPaymentsProvider}:
 * a Satellite store, its watchers and a Nova Connect modal, all its own. Create it once, at module level: new adapter
 * objects on every render would be passed to the store again.
 *
 * Nova keeps one store per Satellite adapter (the first of `adapter`) for the life of the page, since the wagmi config
 * and the wallets keep their connections too: a checkout closed and opened again, another page, or a second
 * `NovaPaymentsProvider` on the same adapters shows the wallet still connected. Nova's part of the package (its
 * store and the Nova Connect modal) loads on demand, the first time a provider uses its own connection.
 */
export interface NovaPaymentsOwnConnection {
  /**
   * The Satellite adapters of Nova's store: `satelliteEVMAdapter(wagmiConfig, chains)` of `@tuwaio/satellite-evm`,
   * `satelliteSolanaAdapter({ rpcUrls })` of `@tuwaio/satellite-solana`.
   */
  adapter: SatelliteConnectProviderProps['adapter'];
  /**
   * The watchers of that store, which follow the wallets: `<EVMConnectorsWatcher wagmiConfig={wagmiConfig} />` of
   * `@tuwaio/nova-connect/evm`, `<SolanaConnectorsWatcher />` of `@tuwaio/nova-connect/solana` (without `siwx`).
   */
  watchers: ReactNode;
  /**
   * The payment adapters, on the same wagmi config as `adapter`: `paymentsEVMAdapter(wagmiConfig)`,
   * `paymentsSolanaAdapter({ rpcUrls })`.
   */
  adapters: PaymentsAdapter[];
  /**
   * The props of Nova's own connect modal (`NovaConnectProvider` of `@tuwaio/nova-connect`): `appChains` and/or
   * `solanaRPCUrls` (the modals are rendered only with them), `labels`, `legal`, `withBalance`… Never `siwx`: Nova's
   * own connection pays and refunds, it does not sign anyone in.
   */
  novaConnect: Omit<NovaConnectProviderPropsWithCustomization, 'children' | 'siwx'>;
  /**
   * Whether to reconnect the last wallet after a page load (default `false`). With `true`, Satellite's start-up runs
   * once per page load (`initializeAutoConnect` of the store), which first disconnects the wallets of its adapters.
   * Without it, Nova's connect modal hides "Remember this wallet", since nothing would reconnect the wallet, unless
   * `novaConnect.customization` sets `hidden` of `modals.connectModal.childComponents.rememberWallet`.
   */
  autoConnect?: boolean;
  /**
   * Whether to keep the connected wallet in `localStorage` after the tab closes (default `false`: in `sessionStorage`
   * until the tab closes). See `rememberWallet` of `createSatelliteConnectStore` from `@tuwaio/satellite-core`. The
   * keys are shared with every Satellite store of the site: connecting a wallet that is not remembered moves the last
   * connection out of `localStorage`, and disconnecting removes it, so another Satellite app on the same origin
   * forgets the wallet it remembered.
   */
  rememberWallet?: boolean;
}

/** Props of {@link NovaPaymentsProvider}. */
export interface NovaPaymentsProviderProps {
  /** The Quasar API (Quasar Cloud by default, the address of your node for the Community Edition). */
  baseUrl?: string;
  /** Texts to replace in every language. */
  labels?: NovaPaymentsLabelOverrides;
  /** Customization of the labels. */
  customization?: NovaPaymentsProviderCustomization;
  /**
   * The chain families the checkouts pay from the app's connected wallet on: `paymentsEVMAdapter` of
   * `@tuwaio/nova-payments/evm` (on the wagmi config of the app's Satellite EVM adapter), `paymentsSolanaAdapter` of
   * `@tuwaio/nova-payments/solana`. Without the adapter of a method's family, the buyer pays that method with a QR
   * code. When Nova uses its own connection, the `adapters` of `ownConnection` replace them. Without `adapters`, a
   * provider on the connection of a `NovaPaymentsProvider` above (the app's, or Nova's own) uses the adapters of that
   * provider; `[]` asks for QR codes only.
   */
  adapters?: PaymentsAdapter[];
  /**
   * The app's Pulsar store (`injectExternalPendingTxs` of `createPulsarStore` from `@tuwaio/pulsar-core`). While a
   * checkout is open it tracks the payment itself; when it closes before Quasar settled a payment the wallet sent, the
   * payment goes to this store, which tracks it and keeps it in the history, and Nova Transactions shows its toast.
   */
  pulsar?: PaymentsPulsar;
  /**
   * The wallet connection Nova brings when the app has none: used only when no `SatelliteConnectProvider` is above
   * (see {@link NovaPaymentsOwnConnection}). Inside the app's Satellite store, Nova uses the app's connection and never
   * adds a second one.
   */
  ownConnection?: NovaPaymentsOwnConnection;
  /**
   * Connects a wallet of a chain family when there is no Nova Connect to open (an app that connects wallets its own
   * way): the default of every `PaymentCheckout`, `RefundButton` and `RefundDialog` below, which their own
   * `onConnectWallet` overrides.
   *
   * @param family - The chain family of the payment.
   */
  onConnectWallet?: (family: PaymentFamily) => void;
  /** The app. */
  children: ReactNode;
}

const isDevelopment = () => process.env.NODE_ENV === 'development';

/**
 * Gives the checkouts and refunds below it the Quasar API, the labels, the chain adapters and a wallet connection. A
 * checkout works without it, with Quasar Cloud, the built-in labels and QR payments only.
 *
 * The wallet connection is chosen once, on the first render (see {@link PaymentsConnectionMode} and
 * {@link usePaymentsConnection}): Nova brings its own connection only when the app has none.
 *
 * - Inside the app's `SatelliteConnectProvider` (from `@tuwaio/satellite-react`) and `NovaConnectProvider` (from
 *   `@tuwaio/nova-connect`): the app's wallet, network, connect modal and SIWX, with the `adapters` prop. Nova mounts
 *   nothing of its own.
 * - Inside the app's Satellite store without Nova Connect: the app's wallet; "Connect wallet" calls `onConnectWallet`.
 *   Nova never adds a second store.
 * - Without a Satellite store, with `ownConnection`: Nova's own store, watchers and connect modal (never SIWX), with
 *   the adapters of `ownConnection`. It runs no start-up disconnect unless `autoConnect` is set. That part loads on
 *   demand: until it is loaded, nothing below the provider is rendered.
 * - Without either: QR payments, and `onConnectWallet`.
 *
 * A `NovaPaymentsProvider` inside another one's own connection sees that connection as the app's, so two stores never
 * stack, and without `adapters` it pays with those of the provider above. A later change of the providers above never
 * remounts the checkouts on another connection.
 *
 * Side effects: with its own connection, those of the Satellite store, kept in memory for the life of the page (the
 * last wallet in `sessionStorage`, or in `localStorage` with `rememberWallet`, under keys shared with every Satellite
 * store of the site), of the watchers and of Nova Connect. In development (`NODE_ENV` is `development`),
 * `console.warn` once when the providers above change after the first render, when `ownConnection` is given inside the
 * app's store without Nova Connect, and when `ownConnection` is given but the app's connection is used without
 * `adapters` (its own or those of a `NovaPaymentsProvider` above).
 *
 * @param props - See {@link NovaPaymentsProviderProps}.
 * @returns The provider.
 *
 * @example
 * ```tsx
 * import { NovaPaymentsProvider, PaymentCheckout } from '@tuwaio/nova-payments';
 *
 * export function Checkout({ token }: { token: string }) {
 *   return (
 *     <NovaPaymentsProvider baseUrl="https://quasar.example.com" labels={{ steps: { pay: 'Payment' } }}>
 *       <PaymentCheckout token={token} display="inline" />
 *     </NovaPaymentsProvider>
 *   );
 * }
 * ```
 */
export function NovaPaymentsProvider({
  baseUrl,
  labels,
  customization,
  adapters,
  pulsar,
  ownConnection,
  onConnectWallet,
  children,
}: NovaPaymentsProviderProps) {
  const outer = useContext(NovaPaymentsContext);
  const detected = useDetectedPaymentsConnection(Boolean(ownConnection));
  // Decided once: the checkouts below are never remounted on another connection
  const [connection] = useState<PaymentsConnectionMode>(detected);
  const [firstOwnConnection] = useState(ownConnection);
  const own = connection === 'own' ? (ownConnection ?? firstOwnConnection) : undefined;
  // A provider above with a connection (the app's, or its own) is on the store this one uses: its adapters fit it
  const onOuterConnection =
    (connection === 'app' || connection === 'appStore') &&
    outer.connection !== undefined &&
    outer.connection !== 'none';
  const walletAdapters = own ? own.adapters : (adapters ?? (onOuterConnection ? outer.adapters : undefined));

  const value = useMemo(
    () => ({ baseUrl, labels, customization, adapters: walletAdapters, pulsar, connection, onConnectWallet }),
    [baseUrl, labels, customization, walletAdapters, pulsar, connection, onConnectWallet],
  );

  const warned = useRef<Set<string> | null>(null);
  const hasOwnConnection = Boolean(ownConnection);
  const hasAdapters = Boolean(walletAdapters);
  useEffect(() => {
    if (!isDevelopment()) return;
    warned.current ??= new Set();
    const shown = warned.current;
    const warn = (key: string, message: string) => {
      if (shown.has(key)) return;
      shown.add(key);
      console.warn(`[NovaPaymentsProvider] ${message}`);
    };
    if (detected !== connection) {
      warn(
        'connection',
        `it keeps the wallet connection it chose on its first render ("${connection}"), though the providers above ` +
          `now call for "${detected}". Render it inside the app's SatelliteConnectProvider and NovaConnectProvider ` +
          'from the start.',
      );
    }
    if (hasOwnConnection && connection === 'appStore') {
      warn(
        'appStore',
        "it is inside the app's SatelliteConnectProvider without NovaConnectProvider: it uses the app's wallet and " +
          'never adds a second store, so `ownConnection` is not used. Connect wallets with `onConnectWallet`, or ' +
          'render it inside NovaConnectProvider.',
      );
    }
    if (hasOwnConnection && !hasAdapters && (connection === 'app' || connection === 'appStore')) {
      warn(
        'adapters',
        "it uses the app's wallet connection, so the adapters of `ownConnection` are not used: pass `adapters` on " +
          "the app's wagmi config to pay from the app's wallet.",
      );
    }
  }, [detected, connection, hasOwnConnection, hasAdapters]);

  return (
    <NovaPaymentsContext.Provider value={value}>
      {own ? (
        <Suspense fallback={null}>
          <LazyOwnConnection own={own}>{children}</LazyOwnConnection>
        </Suspense>
      ) : (
        children
      )}
    </NovaPaymentsContext.Provider>
  );
}
