import { describe, expect, it } from 'vitest';

import { PaymentWalletError, walletErrorKind } from './walletErrors';

describe('walletErrorKind', () => {
  it('knows a request the buyer declined in the wallet', () => {
    expect(walletErrorKind({ code: 4001, message: 'User rejected the request.' })).toBe('declined');
    expect(walletErrorKind(Object.assign(new Error('x'), { name: 'UserRejectedRequestError' }))).toBe('declined');
    // viem wraps the provider error in its own
    expect(walletErrorKind(Object.assign(new Error('Request failed'), { cause: { code: 4001 } }))).toBe('declined');
    // Wallet Standard wallets reject with a message
    expect(walletErrorKind(new Error('User rejected the request'))).toBe('declined');
    expect(walletErrorKind(new Error('Transaction cancelled by user'))).toBe('declined');
  });

  it('keeps the kind an adapter gave, and calls anything else a failure', () => {
    expect(walletErrorKind(new PaymentWalletError('unsupported', 'No paymaster support'))).toBe('unsupported');
    expect(walletErrorKind(new PaymentWalletError('declined', 'Declined'))).toBe('declined');
    expect(walletErrorKind(new Error('execution reverted'))).toBe('failed');
    expect(walletErrorKind('boom')).toBe('failed');
    expect(walletErrorKind(undefined)).toBe('failed');
  });

  it('does not loop on a cause that points back to itself', () => {
    const error: { message: string; cause?: unknown } = { message: 'loop' };
    error.cause = error;
    expect(walletErrorKind(error)).toBe('failed');
  });
});
