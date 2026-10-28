import { type Context, createContext } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import type { NovaPaymentsLabelOverrides } from '../i18n';
import type { PaymentsPulsar } from '../utils/handOver';
import type { PaymentFamily } from '../utils/methods';
import type { NovaPaymentsProviderCustomization } from './NovaPaymentsProvider';

/**
 * Whose wallet connection the checkouts and refunds use, as `NovaPaymentsProvider` decided on its first render:
 *
 * - `app`: the app's. A Satellite store (`SatelliteConnectProvider` of `@tuwaio/satellite-react`) and
 *   `NovaConnectProvider` of `@tuwaio/nova-connect` are above it: the wallet, its network, the connect modal and SIWX
 *   are the app's, and Nova adds nothing.
 * - `appStore`: the app's Satellite store without Nova Connect: "Connect wallet" calls `onConnectWallet`.
 * - `own`: Nova's own. The app has no Satellite store and gave `ownConnection`: Nova runs its own store, watchers and
 *   connect modal, without SIWX.
 * - `none`: no connection. The buyer pays with a QR code, or connects through `onConnectWallet`.
 */
export type PaymentsConnectionMode = 'app' | 'appStore' | 'own' | 'none';

/** The settings `NovaPaymentsProvider` gives the checkouts below it. */
export interface NovaPaymentsSettings {
  /** The Quasar API, if set. */
  baseUrl?: string;
  /** Texts to replace in every language. */
  labels?: NovaPaymentsLabelOverrides;
  /** Customization of the labels. */
  customization?: NovaPaymentsProviderCustomization;
  /**
   * The chain families the checkouts pay from a connected wallet on: the `adapters` prop, or those of `ownConnection`
   * when Nova runs its own connection.
   */
  adapters?: PaymentsAdapter[];
  /** The app's Pulsar store, which takes over the payments a checkout closed on. */
  pulsar?: PaymentsPulsar;
  /** Whose wallet connection the checkouts use; unset without `NovaPaymentsProvider`. */
  connection?: PaymentsConnectionMode;
  /**
   * The app's handler that connects a wallet, for the checkouts and refunds below without Nova Connect.
   *
   * @param family - The chain family of the payment.
   */
  onConnectWallet?: (family: PaymentFamily) => void;
}

// The context is stored on `globalThis` under a global symbol, so several copies of this package share one context
const CONTEXT_SYMBOL = Symbol.for('tuwaio.nova-payments.context');

const contextHolder = globalThis as unknown as { [CONTEXT_SYMBOL]?: Context<NovaPaymentsSettings> };

/**
 * The context of `NovaPaymentsProvider`, created once and saved on `globalThis`
 * (`Symbol.for('tuwaio.nova-payments.context')`), so copies of the package share it. @internal
 */
export const NovaPaymentsContext =
  contextHolder[CONTEXT_SYMBOL] ?? (contextHolder[CONTEXT_SYMBOL] = createContext<NovaPaymentsSettings>({}));
