import { afterEach, describe, expect, it, vi } from 'vitest';

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

  // wagmi's errors, by name: the chain is not in the wagmi config, or the config has no connection of the wallet
  const wagmiError = (name: string, message: string) => Object.assign(new Error(message), { name });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("calls a chain the app's wagmi config lacks unsupported", () => {
    expect(walletErrorKind(wagmiError('ChainNotConfiguredError', 'Chain not configured.'))).toBe('unsupported');
    // viem wraps it in its own error
    const wrapped = Object.assign(new Error('Switch failed'), {
      cause: wagmiError('ChainNotConfiguredError', 'Chain not configured.'),
    });
    expect(walletErrorKind(wrapped)).toBe('unsupported');
  });

  it('calls a wallet the wagmi config of the adapter has no connection of unsupported, and says why in development', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('NODE_ENV', 'development');
    expect(walletErrorKind(wagmiError('ConnectorNotConnectedError', 'Connector not connected.'))).toBe('unsupported');
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain(
      'paymentsEVMAdapter is built on a wagmi config the connected wallet is not in',
    );

    vi.stubEnv('NODE_ENV', 'production');
    expect(walletErrorKind(wagmiError('ConnectorNotConnectedError', 'Connector not connected.'))).toBe('unsupported');
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('does not loop on a cause that points back to itself', () => {
    const error: { message: string; cause?: unknown } = { message: 'loop' };
    error.cause = error;
    expect(walletErrorKind(error)).toBe('failed');
  });
});
