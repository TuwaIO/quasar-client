/**
 * @file Why a wallet did not pay: the buyer declined, the wallet cannot do it, or it failed.
 */

/** Why a wallet request did not go through. */
export type PaymentWalletErrorKind = 'declined' | 'unsupported' | 'failed';

/** The error a payments adapter throws when it knows why the wallet did not pay. */
export class PaymentWalletError extends Error {
  /**
   * @param kind - Why: `declined` by the buyer, `unsupported` by the wallet, or `failed`.
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

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * Why a wallet request failed, from the error the wallet library threw: EIP-1193 code `4001` and viem's
 * `UserRejectedRequestError` (also as a `cause`), and the "user rejected" messages of Wallet Standard wallets, are
 * `declined`.
 *
 * @param error - What the wallet library threw.
 * @returns `declined`, `unsupported` or `failed`.
 */
export function walletErrorKind(error: unknown): PaymentWalletErrorKind {
  const seen = new Set<unknown>();
  for (let current = error; current !== undefined && current !== null && !seen.has(current);) {
    seen.add(current);
    if (current instanceof PaymentWalletError) return current.kind;
    if (field(current, 'code') === USER_REJECTED || field(current, 'name') === 'UserRejectedRequestError') {
      return 'declined';
    }
    const message = field(current, 'message');
    if (typeof message === 'string' && DECLINED_MESSAGE.test(message)) return 'declined';
    current = field(current, 'cause');
  }
  return 'failed';
}
