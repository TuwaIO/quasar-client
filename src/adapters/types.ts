import type { PaymentInstructions, TransferAuthorizationTypedData } from '@tuwaio/quasar-sdk/checkout';

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
   * @param params - The quote's instructions and the sender.
   * @returns The transaction hash (EVM) or signature (Solana).
   */
  sendTransfer: (params: { instructions: PaymentInstructions; account: string }) => Promise<string>;
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
   * Sends the sponsored calls of a gasless quote with `wallet_sendCalls` and the paymaster, with the wallet's prompt,
   * and waits for the transaction that carries them.
   *
   * @param params - The calls, the paymaster URL of the checkout, the chain and the sender.
   * @returns The hash of the transaction (not the batch ID), as Quasar expects it.
   */
  sendSponsoredCalls?: (params: {
    calls: { to: string; value: string; data: string }[];
    paymasterUrl: string;
    chainId: string;
    account: string;
  }) => Promise<string>;
}
