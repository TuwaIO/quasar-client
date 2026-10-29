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
      icon: undefined,
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

  const icon = (name: string) => `data:image/svg+xml;base64,${name}`;
  const evmAt = (connectorType: string) => ({
    address: '0x1111111111111111111111111111111111111111',
    chainId: 8453,
    connectorType,
  });

  it('names and shows a wallet as the wallet calls itself: an EIP-6963 wallet Nova does not know', () => {
    const connectors = {
      evm: [
        { name: 'MetaMask', icon: icon('mm') },
        { name: 'Switch Wallet', icon: icon('sw') },
      ],
    };
    expect(connectedWallet(evmAt('evm:switchwallet'), connectors)).toMatchObject({
      walletId: 'switchwallet',
      name: 'Switch Wallet',
      icon: icon('sw'),
    });
  });

  it('takes the wallet with exactly the connection type, never one whose type only contains it', () => {
    const connectors = {
      evm: [
        { name: 'MetaMask Flask', icon: icon('flask') },
        { name: 'MetaMask', icon: icon('mm') },
        { name: 'Coinbase Wallet', icon: icon('cbw') },
        { name: 'Base Account', icon: icon('base') },
      ],
    };
    expect(connectedWallet(evmAt('evm:metamask'), connectors)).toMatchObject({ name: 'MetaMask', icon: icon('mm') });
    // `Base Account` is `coinbase`, `Coinbase Wallet` is `coinbasewallet`
    expect(connectedWallet(evmAt('evm:coinbase'), connectors)).toMatchObject({
      name: 'Base Account',
      icon: icon('base'),
    });
    // Only MetaMask Flask is listed: the connection is not it
    expect(connectedWallet(evmAt('evm:metamask'), { evm: [{ name: 'MetaMask Flask', icon: icon('flask') }] })).toEqual(
      expect.objectContaining({ name: 'MetaMask', icon: undefined }),
    );
  });

  it('matches the wallet within the chain family of the connection', () => {
    const solana = {
      address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      chainId: 'devnet',
      connectorType: 'solana:phantom',
    };
    const connectors = {
      evm: [{ name: 'Phantom', icon: icon('evm') }],
      solana: [{ name: 'Phantom', icon: icon('sol') }],
    };
    expect(connectedWallet(solana, connectors)).toMatchObject({ name: 'Phantom', icon: icon('sol') });
  });

  it('falls back to the icon of the connection and a name from the connector type when the wallet is not listed', () => {
    expect(connectedWallet({ ...evmAt('evm:switchwallet'), icon: ` ${icon('own')} ` }, { evm: [] })).toMatchObject({
      name: 'Switchwallet',
      icon: icon('own'),
    });
    expect(connectedWallet(evmAt('evm:switchwallet'))).toMatchObject({ name: 'Switchwallet', icon: undefined });
  });

  it('keeps the names Nova gives to known wallets and to the generic browser connector', () => {
    expect(walletLabel('evm:metamask', 'MetaMask')).toBe('MetaMask');
    expect(walletLabel('evm:injected', 'Injected')).toBe('Browser wallet');
    expect(walletLabel('evm:switchwallet', ' Switch Wallet ')).toBe('Switch Wallet');
    expect(walletLabel('evm:switchwallet', '')).toBe('Switchwallet');
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
