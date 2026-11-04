import { describe, expect, it } from 'vitest';

import { defaultLabels } from '../i18n';
import type { CheckoutWallet } from './methods';
import { solanaClusterToSync, solanaNetworkHint } from './solanaNetwork';

const MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const BASE = 'eip155:8453';

const wallet = (chainId: string, walletId = 'phantom'): CheckoutWallet => ({
  address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  chainId,
  family: chainId.startsWith('solana:') ? 'solana' : 'eip155',
  connectorType: `solana:${walletId}`,
  walletId,
  name: walletId === 'phantom' ? 'Phantom' : walletId === 'solflare' ? 'Solflare' : 'Backpack',
  connection: {},
});

describe('the network of a Solana payment', () => {
  it('reminds the buyer that the wallet chooses its network itself, on a cluster other than mainnet', () => {
    expect(solanaNetworkHint(DEVNET, wallet(MAINNET), defaultLabels)).toEqual({
      title: 'Pay on Solana Devnet',
      text: 'Solana wallets choose their network themselves: switch yours to Solana Devnet before you pay.',
      hint: 'In Phantom: Settings › Developer Settings › Testnet Mode, then Solana Devnet.',
    });
    expect(solanaNetworkHint(DEVNET, wallet(MAINNET, 'solflare'), defaultLabels)?.hint).toBe(
      'In Solflare: Settings › General › Network › Devnet.',
    );
    expect(solanaNetworkHint(DEVNET, wallet(MAINNET, 'backpack'), defaultLabels)?.hint).toBe(
      'Choose the network in the settings of Backpack.',
    );
    // No wallet yet: the reminder without the steps of a wallet
    expect(solanaNetworkHint(DEVNET, null, defaultLabels)?.hint).toBeUndefined();
  });

  it('says nothing for mainnet, where wallets are, and for an EVM payment, which the checkout switches', () => {
    expect(solanaNetworkHint(MAINNET, wallet(MAINNET), defaultLabels)).toBeNull();
    expect(solanaNetworkHint(BASE, wallet(BASE), defaultLabels)).toBeNull();
  });

  it("brings the app's Solana connection to the payment's cluster, with no request to the wallet", () => {
    expect(solanaClusterToSync(DEVNET, wallet(MAINNET))).toBe(DEVNET);
    expect(solanaClusterToSync(DEVNET, wallet(DEVNET))).toBeNull();
    expect(solanaClusterToSync(DEVNET, null)).toBeNull();
    expect(solanaClusterToSync(DEVNET, wallet(BASE))).toBeNull();
    expect(solanaClusterToSync(BASE, wallet(MAINNET))).toBeNull();
  });
});
