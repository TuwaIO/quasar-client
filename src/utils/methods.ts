/**
 * @file The connected wallet and the payment methods as the method step needs them: CAIP identifiers, the payer of a
 * method, QR payments, discounts and markups.
 */

import { getChainName } from '@tuwaio/nova-core';
import {
  formatCaip10AccountId,
  parseCaip2ChainId,
  parseCaip19AssetId,
  toCaip2ChainId,
  toEvmChainId,
} from '@tuwaio/orbit-core';
import type { CheckoutMethod } from '@tuwaio/quasar-sdk/checkout';

/** The chain family of a payment method or wallet. */
export type PaymentFamily = 'eip155' | 'solana';

/** The wallet connected through Satellite Connect, as the checkout uses it. */
export interface CheckoutWallet {
  /** The account address. */
  address: string;
  /** CAIP-2 chain the wallet is on (Solana clusters as their genesis-hash ID). */
  chainId: string;
  /** Its chain family. */
  family: PaymentFamily;
  /** Connector type of Satellite Connect (`evm:metamask`). */
  connectorType: string;
  /** The wallet id for `WalletIcon` of `@tuwaio/nova-core` (`metamask`). */
  walletId: string;
  /** The wallet name to show. */
  name: string;
  /** The Satellite Connect connection itself, for the chain adapters (the Solana adapter signs with its account). */
  connection: unknown;
}

/** Names of wallets whose connector id is not how they write their name. */
const WALLET_NAMES: Record<string, string> = {
  metamask: 'MetaMask',
  walletconnect: 'WalletConnect',
  coinbase: 'Coinbase Wallet',
  okx: 'OKX Wallet',
  trust: 'Trust Wallet',
  injected: 'Browser wallet',
};

/**
 * The name of a wallet from its connector type.
 *
 * @param connectorType - Connector type of Satellite Connect, for example `evm:metamask`.
 * @returns The name, for example `MetaMask`.
 */
export function walletLabel(connectorType: string): string {
  const id = connectorType.slice(connectorType.indexOf(':') + 1).toLowerCase();
  return WALLET_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * The family of a CAIP-2 chain.
 *
 * @param chainId - A CAIP-2 chain ID.
 * @returns `eip155` or `solana`; `null` for another namespace.
 */
const familyOf = (chainId: string): PaymentFamily | null => {
  const namespace = parseCaip2ChainId(chainId)?.namespace;
  return namespace === 'eip155' || namespace === 'solana' ? namespace : null;
};

/**
 * The connected wallet of Satellite Connect in CAIP identifiers.
 *
 * @param connection - The active connection of the Satellite store: `address`, `chainId` (an EVM number or a Solana
 * cluster), `connectorType`.
 * @returns The wallet, or `null` without a connection or with a chain the checkout cannot read.
 */
export function connectedWallet(
  connection: { address: string; chainId: string | number; connectorType: string } | null | undefined,
): CheckoutWallet | null {
  if (!connection?.address) return null;
  const chainId = toCaip2ChainId(connection.chainId);
  const family = chainId ? familyOf(chainId) : null;
  if (!chainId || !family) return null;
  return {
    address: connection.address,
    chainId,
    family,
    connectorType: connection.connectorType,
    walletId: connection.connectorType.slice(connection.connectorType.indexOf(':') + 1).toLowerCase(),
    name: walletLabel(connection.connectorType),
    connection,
  };
}

/**
 * The chain family of a payment method.
 *
 * @param method - The method.
 * @returns `eip155` or `solana`; `null` for another namespace.
 */
export function methodFamily(method: CheckoutMethod): PaymentFamily | null {
  return familyOf(method.chainId);
}

/**
 * The payer of a method for the connected wallet: its address on the method's chain. A wallet of the other family
 * cannot pay it; a wallet on another chain of the family pays after switching (the quote names the method's chain).
 *
 * @param wallet - The connected wallet.
 * @param method - The method.
 * @returns The CAIP-10 account, or `null`.
 */
export function payerFor(wallet: CheckoutWallet | null, method: CheckoutMethod): string | null {
  if (!wallet || wallet.family !== methodFamily(method)) return null;
  return formatCaip10AccountId(method.chainId, wallet.address) ?? null;
}

/**
 * Whether a method can be paid by scanning a QR code with a phone: Solana with Solana Pay, an EVM method only through
 * the payment page opened on the phone.
 *
 * @param method - The method.
 * @param payUrl - The payment page of the invoice (its `payUrl`), if the app has it.
 * @returns Whether the QR option applies.
 */
export function canPayWithQr(method: CheckoutMethod, payUrl?: string | null): boolean {
  const family = methodFamily(method);
  return family === 'solana' || (family === 'eip155' && Boolean(payUrl));
}

/**
 * The discount or markup of a method, as the token and network options show it.
 *
 * @param method - The method.
 * @returns `discount` or `markup` with the percent (`'1.5'`), or `null` for neither.
 */
export function priceAdjustment(method: CheckoutMethod): { kind: 'discount' | 'markup'; percent: string } | null {
  const percent = (bps: number) => String(Number((bps / 100).toFixed(2)));
  if (method.discountBps > 0) return { kind: 'discount', percent: percent(method.discountBps) };
  if (method.markupBps > 0) return { kind: 'markup', percent: percent(method.markupBps) };
  return null;
}

/**
 * The name of a method's network, from the chain names of `@tuwaio/nova-core`.
 *
 * @param chainId - CAIP-2 chain of the method (`eip155:8453`, `solana:EtWT…`).
 * @returns The name (`Base`, `Solana Devnet`), `Unknown` for a chain nova-core does not list.
 */
export function networkName(chainId: string): string {
  return getChainName(toEvmChainId(chainId) ?? chainId).name;
}

/**
 * The token of a method as a chain reads its balance, from its CAIP-19 asset.
 *
 * @param method - The payment method.
 * @returns The token contract or mint, or `native` for the coin of the chain (a `slip44` asset, or none).
 */
export function methodToken(method: CheckoutMethod): string {
  const asset = method.assetId ? parseCaip19AssetId(method.assetId) : undefined;
  return !asset || asset.assetNamespace === 'slip44' ? 'native' : asset.assetReference;
}
