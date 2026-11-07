/**
 * @file Why a wallet did not pay: the buyer declined, the wallet cannot do it, it is on another network, or it failed.
 */

import { errorChain } from '@tuwaio/orbit-core';

/**
 * Why a wallet request did not go through: `declined` by the buyer, `unsupported` by the wallet, `wrongNetwork` when it
 * was on another network than the request, `switchFailed` when it did not switch, `notAuthorized` when it has not allowed
 * the account for the site (EIP-1193 4100), `alreadyPending` when another request of the site still waits in it,
 * `sentUnconfirmed` when it sent a payment that is not confirmed yet (it may still land), or `failed`.
 */
export type PaymentWalletErrorKind =
  | 'declined'
  | 'unsupported'
  | 'wrongNetwork'
  | 'switchFailed'
  | 'notAuthorized'
  | 'alreadyPending'
  | 'sentUnconfirmed'
  | 'failed';

/** The error a payments adapter throws when it knows why the wallet did not pay. */
export class PaymentWalletError extends Error {
  /**
   * @param kind - Why: see {@link PaymentWalletErrorKind}.
   * @param message - What to log.
   * @param options - The original error as `cause`.
   */
  constructor(
    readonly kind: PaymentWalletErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PaymentWalletError';
  }
}

// EIP-1193 `userRejectedRequest`
const USER_REJECTED = 4001;
const DECLINED_MESSAGE =
  /user (rejected|denied|declined|cancell?ed)|(rejected|denied|declined|cancell?ed) by (the )?user/i;
// wagmi's errors: the chain is not in the wagmi config of the adapter, or that config has no connection of the wallet
const CHAIN_NOT_CONFIGURED = 'ChainNotConfiguredError';
const CONNECTOR_NOT_CONNECTED = 'ConnectorNotConnectedError';
/** wagmi's and viem's errors of a wallet on another network than the request. */
const CHAIN_MISMATCH: ReadonlySet<unknown> = new Set(['ConnectorChainMismatchError', 'ChainMismatchError']);
/** wagmi's and viem's errors of a network switch the wallet did not make, without the buyer refusing it. */
const SWITCH_FAILED: ReadonlySet<unknown> = new Set(['SwitchChainError', 'SwitchChainNotSupportedError']);
/** EIP-1193 `unsupported method`, and JSON-RPC `method not found` and `method not supported`. */
const UNSUPPORTED_CODES: ReadonlySet<unknown> = new Set([4200, -32601, -32004]);
/** EIP-1193 `unauthorized`: the wallet has not allowed the account or the method for the site. */
const NOT_AUTHORIZED = 4100;
/** JSON-RPC `resource unavailable`, as MetaMask answers while the site has a request waiting in it. */
const ALREADY_PENDING = -32002;

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * Why a wallet request failed, from the error the wallet library threw and the causes it wraps, whichever of them names
 * it: EIP-1193 code `4001` and viem's `UserRejectedRequestError`, and the "user rejected" messages of Wallet Standard
 * wallets, are `declined`. A request the wallet already has waiting (code `-32002`) is `alreadyPending`, also inside a
 * failed switch: the buyer answers it there. wagmi's `ChainNotConfiguredError` (the network of the payment is not in the
 * wagmi config of `paymentsEVMAdapter`; the buyer can still pay with the QR code) and `ConnectorNotConnectedError` (that
 * config has no connection of the wallet) are `unsupported`, as is a wallet that does not know the request (codes 4200,
 * -32601, -32004). `ConnectorChainMismatchError` and `ChainMismatchError` are `wrongNetwork`; `SwitchChainError` and
 * `SwitchChainNotSupportedError` are `switchFailed`; code `4100` is `notAuthorized`. Named apart so that the page never
 * says a payment failed, or that a fee was spent, about a request that never left the wallet.
 *
 * Side effects: in development (`NODE_ENV` is `development`), a failure it cannot name logs to the console, and a
 * `ConnectorNotConnectedError` logs a `console.error`:
 * the app gave `NovaPaymentsProvider` an EVM adapter built on another wagmi config than the one its wallet connection
 * (its Satellite EVM adapter) uses.
 *
 * @param error - What the wallet library threw.
 * @returns The kind.
 */
export function walletErrorKind(error: unknown): PaymentWalletErrorKind {
  const chain = errorChain(error);
  const named = (test: (item: unknown) => boolean) => chain.find(test);
  const given = named((item) => item instanceof PaymentWalletError);
  if (given) return (given as PaymentWalletError).kind;
  const declined = (item: unknown) => {
    const message = field(item, 'message');
    return (
      field(item, 'code') === USER_REJECTED ||
      field(item, 'name') === 'UserRejectedRequestError' ||
      (typeof message === 'string' && DECLINED_MESSAGE.test(message))
    );
  };
  if (named(declined)) return 'declined';
  if (named((item) => field(item, 'code') === ALREADY_PENDING)) return 'alreadyPending';
  if (named((item) => field(item, 'name') === CHAIN_NOT_CONFIGURED || UNSUPPORTED_CODES.has(field(item, 'code')))) {
    return 'unsupported';
  }
  if (named((item) => CHAIN_MISMATCH.has(field(item, 'name')))) return 'wrongNetwork';
  if (named((item) => SWITCH_FAILED.has(field(item, 'name')))) return 'switchFailed';
  if (named((item) => field(item, 'code') === NOT_AUTHORIZED)) return 'notAuthorized';
  const notConnected = named((item) => field(item, 'name') === CONNECTOR_NOT_CONNECTED);
  if (notConnected) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[nova-payments] paymentsEVMAdapter is built on a wagmi config the connected wallet is not in: give ' +
          'NovaPaymentsProvider `adapters` on the wagmi config of the Satellite EVM adapter that connects the wallet.',
        notConnected,
      );
    }
    return 'unsupported';
  }
  // Nothing on the screen says what went wrong: a developer finds it here
  if (process.env.NODE_ENV === 'development') console.error('[nova-payments] The wallet failed:', error);
  return 'failed';
}
