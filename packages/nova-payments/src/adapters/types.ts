import type { Transaction } from '@tuwaio/pulsar-core';
import type { PaymentInstructions, PayoutRecord, TransferAuthorizationTypedData } from '@tuwaio/quasar-sdk/checkout';

import type { PaymentFamily } from '../utils/methods';

/** A fee in the native coin of a chain, in its base units. */
export interface NativeFee {
  /** The amount, in base units. */
  amount: bigint;
  /** Decimals of the native coin. */
  decimals: number;
  /** Symbol of the native coin. */
  symbol: string;
}

/** A payment the wallet sent, with the texts of its transaction, for {@link PaymentsAdapter.pulsarTransaction}. */
export interface PulsarTransactionParams {
  /** The transaction hash (EVM) or signature (Solana). */
  txKey: string;
  /** What the wallet sent. */
  instructions: PaymentInstructions;
  /** The sender. */
  account: string;
  /** The connector of the wallet (`evm:metamask`). */
  connectorType: string;
  /** Title of the transaction (at most 100 characters). */
  title: string;
  /** Description of the transaction (at most 300 characters). */
  description: string;
  /** What the transaction pays: `quasarInvoice` is the invoice ID. */
  payload: Record<string, string>;
}

/**
 * What the checkout needs from a chain family to pay from the connected wallet. `@tuwaio/nova-payments/evm` and
 * `@tuwaio/nova-payments/solana` make them; the checkout itself imports no chain library. Chains are CAIP-2 IDs, and
 * amounts base units. A method that fails because of the wallet throws `PaymentWalletError` (or the wallet library's
 * error, which the checkout reads with `walletErrorKind`).
 */
export interface PaymentsAdapter {
  /** The chain family it pays on. */
  family: PaymentFamily;
  /**
   * Reads a balance from the network in the browser (no request to Quasar).
   *
   * @param params - The chain, the account and the token (`native` for the coin of the chain).
   * @returns The balance, in base units.
   */
  getBalance: (params: { chainId: string; account: string; token: string }) => Promise<bigint>;
  /**
   * Estimates the network fee of the transfer, paid in the native coin.
   *
   * @param params - What the wallet sends and the sender.
   * @returns The fee, or `null` when it cannot be estimated.
   */
  estimateFee?: (params: { instructions: PaymentInstructions; account: string }) => Promise<NativeFee | null>;
  /**
   * Whether the wallet sends `wallet_sendCalls` with the `paymasterService` capability on the chain (EIP-5792,
   * ERC-7677).
   *
   * @param params - The chain and the account.
   * @returns `true` when sponsored calls are possible.
   */
  canSponsorCalls?: (params: { chainId: string; account: string }) => Promise<boolean>;
  /**
   * Asks the wallet to switch to the chain of the payment.
   *
   * @param chainId - The chain.
   */
  switchChain?: (chainId: string) => Promise<void>;
  /**
   * Sends the transfer the quote describes, with the wallet's prompt.
   *
   * @param params - The quote's instructions, the sender, and the Satellite Connect connection of the wallet (the
   *   Solana adapter signs with its Wallet Standard account).
   * @returns The transaction hash (EVM) or signature (Solana).
   */
  sendTransfer: (params: {
    instructions: PaymentInstructions;
    account: string;
    connection?: unknown;
  }) => Promise<string>;
  /**
   * Signs the EIP-3009 authorization of a gasless quote (`eth_signTypedData_v4`), with the wallet's prompt.
   *
   * @param params - The typed data and the signer.
   * @returns The 65-byte signature.
   */
  signTransferAuthorization?: (params: {
    typedData: TransferAuthorizationTypedData;
    account: string;
  }) => Promise<string>;
  /**
   * Signs a message with `personal_sign` (EIP-191), with the wallet's prompt: the EIP-4361 message by which the paying
   * wallet confirms the invoice before an EVM payment it sends itself (`confirmPayer` of the checkout store of
   * `@tuwaio/quasar-sdk/checkout`). A free signature that moves no funds; a smart wallet signs it through its own flow
   * (ERC-1271, ERC-6492), often with a passkey. Without it the checkout cannot pay methods that need the confirmation
   * from this wallet.
   *
   * @param params - The message exactly as Quasar wrote it, the signer, and the CAIP-2 network the message names (the
   *   wallet is on it already: the checkout switches it first).
   * @returns The signature, as hex.
   */
  signMessage?: (params: { message: string; account: string; chainId: string }) => Promise<string>;
  /**
   * Checks the signature of the payout record of a quote's receiving address (`quote.payee`), without the wallet: the
   * checkout shows the address and asks the wallet to pay only once the record is signed by the address it names
   * (`payee` of `createCheckoutStore` from `@tuwaio/quasar-sdk/checkout`). On EVM an ordinary wallet's signature is
   * recovered in the page; a smart wallet's is put to its contract on the quote's network (ERC-1271, ERC-6492) through
   * the app's RPC. On Solana the Ed25519 signature is checked in the page. Without it the checkout matches the record
   * with the quote but leaves its signature unchecked.
   *
   * @param params - The record, its signature as Quasar sent it, and the network (CAIP-2) of the quote.
   * @returns Whether the signature is the record's address's.
   */
  verifyPayoutRecord?: (params: { record: PayoutRecord; signature: string; chainId: string }) => Promise<boolean>;
  /**
   * Sends the sponsored calls of a gasless quote with `wallet_sendCalls` and the paymaster, with the wallet's prompt,
   * and waits for the transaction that carries them.
   *
   * @param params - The calls, the paymaster URL of the checkout, the chain, the sender, and `onSent`, called once the
   *   wallet accepted the calls (before they are included).
   * @returns The hash of the transaction (not the batch ID), as Quasar expects it.
   */
  /**
   * The link of a transaction on a block explorer of its chain.
   *
   * @param params - The chain and the transaction hash or signature.
   * @returns The link, or `undefined` when the chain has no known explorer.
   */
  explorerUrl?: (params: { chainId: string; txKey: string }) => string | undefined;
  /**
   * The link of a wallet address on a block explorer of its chain.
   *
   * @param params - The chain and the address.
   * @returns The link, or `undefined` when the chain has no known explorer.
   */
  explorerAddressUrl?: (params: { chainId: string; address: string }) => string | undefined;
  /**
   * Describes a sent payment as a pending transaction of `@tuwaio/pulsar-core`, so that the app's Pulsar store tracks
   * it (and Nova Transactions shows its toast) once the checkout closes.
   *
   * @param params - The payment and the texts of its transaction.
   * @returns The pending transaction, for `injectExternalPendingTxs` of the Pulsar store.
   */
  pulsarTransaction?: (params: PulsarTransactionParams) => Transaction;
  /**
   * Follows a batch the wallet took before the page was reloaded, until its transaction comes or `until` passes.
   *
   * @param params - The batch, until when to follow it (a timestamp) and what to call with its transaction.
   */
  followSponsoredCalls?: (params: { batchId: string; until: number; onLate: (txKey: string) => void }) => void;
  sendSponsoredCalls?: (params: {
    calls: { to: string; value: string; data: string }[];
    paymasterUrl: string;
    chainId: string;
    account: string;
    onSent?: () => void;
    /** Called with the ID of the batch as soon as the wallet took it, before it has a transaction. */
    onAccepted?: (batchId: string) => void;
    /** Called with the transaction of a batch that landed after the adapter gave up waiting (`sentUnconfirmed`). */
    onLate?: (txKey: string) => void;
  }) => Promise<string>;
  /**
   * Sends the call Quasar authorized for a gasless payment (`relayFromPage` of the checkout store) from a one-time
   * account of the page: a key made in memory for this payment only, delegated (EIP-7702) to the account code Quasar's
   * paymaster sponsors, whose user operation goes to the merchant's paymaster and bundler through `paymasterUrl`. The
   * buyer's wallet is not asked again; the key is never stored or sent anywhere.
   *
   * @param params - The chain (CAIP-2), the call and the checkout's paymaster URL.
   * @returns The hash of the user operation.
   */
  sendOneTimeRelay?: (params: {
    chainId: string;
    call: { to: string; data: string };
    paymasterUrl: string;
  }) => Promise<string>;
}
