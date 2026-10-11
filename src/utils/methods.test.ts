import type { CheckoutMethod } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import {
  canPayWithQr,
  connectedWallet,
  methodFamily,
  methodToken,
  networkName,
  payerFor,
  priceAdjustment,
  walletLabel,
} from './methods';

const BASE = 'eip155:8453';
const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const method = (chainId: string, extra: Partial<CheckoutMethod> = {}): CheckoutMethod => ({
  id: 'm',
  name: 'USDC',
  symbol: 'USDC',
  chainId,
  assetId: null,
  decimals: 6,
  gasless: 'off',
  featured: false,
  markupBps: 0,
  discountBps: 0,
  ...extra,
});

describe('connected wallet', () => {
  it('reads the Satellite connection as CAIP identifiers, and keeps it for the chain adapters', () => {
    const connection = {
      address: '0x1111111111111111111111111111111111111111',
      chainId: 8453,
      connectorType: 'evm:metamask',
    };
    expect(connectedWallet(connection)).toEqual({
      address: '0x1111111111111111111111111111111111111111',
      chainId: BASE,
      family: 'eip155',
      connectorType: 'evm:metamask',
      walletId: 'metamask',
      name: 'MetaMask',
      connection,
    });
    expect(
      connectedWallet({
        address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        chainId: 'devnet',
        connectorType: 'solana:phantom',
      }),
    ).toMatchObject({ chainId: SOLANA_DEVNET, family: 'solana', name: 'Phantom' });
    expect(connectedWallet(undefined)).toBeNull();
    expect(connectedWallet({ address: '', chainId: 1, connectorType: 'evm:injected' })).toBeNull();
  });

  it('names wallets as they name themselves', () => {
    expect(walletLabel('evm:walletconnect')).toBe('WalletConnect');
    expect(walletLabel('evm:coinbase')).toBe('Coinbase Wallet');
    expect(walletLabel('solana:solflare')).toBe('Solflare');
    expect(walletLabel('evm:rabby')).toBe('Rabby');
  });

  it("pays from the wallet's address on the method's chain, and only within its chain family", () => {
    const evm = connectedWallet({
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      connectorType: 'evm:metamask',
    });
    expect(payerFor(evm, method(BASE))).toBe('eip155:8453:0x1111111111111111111111111111111111111111');
    expect(payerFor(evm, method(SOLANA_DEVNET))).toBeNull();
    expect(payerFor(null, method(BASE))).toBeNull();
  });
});

describe('methods', () => {
  it('names the network of a CAIP-2 chain, EVM and Solana', () => {
    expect(networkName('eip155:84532')).toBe('Base Sepolia Testnet');
    expect(networkName(SOLANA_DEVNET)).toBe('Solana Devnet');
  });

  it('names the token of a method as the chain reads its balance: the contract or mint, or the native coin', () => {
    expect(methodToken(method(BASE, { assetId: 'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }))).toBe(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    );
    expect(methodToken(method(BASE, { assetId: 'eip155:8453/slip44:60' }))).toBe('native');
    expect(
      methodToken(
        method(SOLANA_DEVNET, { assetId: `${SOLANA_DEVNET}/token:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` }),
      ),
    ).toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
    expect(methodToken(method(SOLANA_DEVNET, { assetId: null }))).toBe('native');
  });

  it('tells EVM and Solana methods apart by their CAIP-2 chain', () => {
    expect(methodFamily(method(BASE))).toBe('eip155');
    expect(methodFamily(method(SOLANA_DEVNET))).toBe('solana');
  });

  it('pays Solana with Solana Pay from a phone, and EVM on the phone only through the payment page', () => {
    expect(canPayWithQr(method(SOLANA_DEVNET))).toBe(true);
    expect(canPayWithQr(method(BASE))).toBe(false);
    expect(canPayWithQr(method(BASE), 'https://quasar.example/pay/token')).toBe(true);
    // A node without a dashboard URL issues invoices with `payUrl: null`
    expect(canPayWithQr(method(BASE), null)).toBe(false);
    expect(canPayWithQr(method(SOLANA_DEVNET), null)).toBe(true);
  });

  it('shows a discount or a markup as a percent', () => {
    expect(priceAdjustment(method(BASE, { discountBps: 200 }))).toEqual({ kind: 'discount', percent: '2' });
    expect(priceAdjustment(method(BASE, { markupBps: 150 }))).toEqual({ kind: 'markup', percent: '1.5' });
    expect(priceAdjustment(method(BASE, { markupBps: 125 }))).toEqual({ kind: 'markup', percent: '1.25' });
    expect(priceAdjustment(method(BASE))).toBeNull();
  });
});
