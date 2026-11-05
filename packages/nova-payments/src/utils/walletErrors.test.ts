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

  // A wallet that does not know the request says so, instead of "something went wrong"
  it.each([4200, -32601, -32004])('knows a wallet that does not support the request (%i)', (code) => {
    expect(walletErrorKind({ code, message: 'Method not supported' })).toBe('unsupported');
    expect(walletErrorKind({ message: 'wrapped', cause: { code } })).toBe('unsupported');
  });

  it('knows a wallet on another network than the request', () => {
    expect(walletErrorKind({ name: 'ConnectorChainMismatchError' })).toBe('wrongNetwork');
  });

  // Each said "the payment failed, only the fee was spent" although nothing had left the wallet
  it.each([
    ['ChainMismatchError', 'wrongNetwork'],
    ['SwitchChainError', 'switchFailed'],
    ['SwitchChainNotSupportedError', 'switchFailed'],
  ])('names %s', (name, kind) => {
    expect(walletErrorKind({ name })).toBe(kind);
    expect(walletErrorKind({ message: 'wrapped', cause: { name } })).toBe(kind);
  });

  // MetaMask's own refusal of an account: the live test of automatic payments got "Something went wrong" for it
  it('knows an account the wallet has not allowed here', () => {
    expect(walletErrorKind({ code: 4100, message: 'not authorized' })).toBe('notAuthorized');
    expect(walletErrorKind({ name: 'UnauthorizedProviderError', cause: { code: 4100 } })).toBe('notAuthorized');
  });

  it('knows a request that already waits in the wallet, also inside a failed switch', () => {
    expect(walletErrorKind({ code: -32002, message: 'already pending' })).toBe('alreadyPending');
    expect(walletErrorKind({ name: 'SwitchChainError', cause: { code: -32002 } })).toBe('alreadyPending');
  });

  it("prefers the buyer's refusal to the switch it stopped", () => {
    expect(walletErrorKind({ name: 'SwitchChainError', cause: { code: 4001 } })).toBe('declined');
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
