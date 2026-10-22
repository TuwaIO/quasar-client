import { describe, expect, it } from 'vitest';

import { refundTransfer } from './refund';

const PAYER = '0x9c1e000000000000000000000000000000004f02';
const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

// Plan 12 §7.5: the merchant's wallet sends the refund the way a buyer's wallet sends a payment
describe('refundTransfer', () => {
  it('turns the refund of an ERC-20 payment into an EVM transfer to the payer', () => {
    expect(
      refundTransfer({
        chainId: 'eip155:8453',
        assetId: 'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        to: PAYER,
        amount: '15890000',
        decimals: 6,
        symbol: 'USDC',
      }),
    ).toEqual({
      family: 'eip155',
      chainId: 8453,
      to: PAYER,
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '15890000',
      decimals: 6,
      symbol: 'USDC',
    });
  });

  it('sends the coin of the chain for a native asset, on EVM and on Solana', () => {
    const eth = {
      chainId: 'eip155:84532',
      assetId: 'eip155:84532/slip44:60',
      to: PAYER,
      amount: '1',
      decimals: 18,
      symbol: 'ETH',
    };
    expect(refundTransfer(eth)).toMatchObject({ family: 'eip155', chainId: 84532, token: 'native' });
    const sol = {
      chainId: SOLANA_DEVNET,
      assetId: `${SOLANA_DEVNET}/slip44:501`,
      to: 'Payer1111',
      amount: '5',
      decimals: 9,
      symbol: 'SOL',
    };
    expect(refundTransfer(sol)).toEqual({
      family: 'solana',
      chainId: SOLANA_DEVNET,
      to: 'Payer1111',
      token: 'native',
      amount: '5',
      decimals: 9,
      symbol: 'SOL',
      reference: '',
      solanaPayUrl: '',
    });
  });

  it('sends an SPL token by its mint', () => {
    const usdc = {
      chainId: SOLANA_DEVNET,
      assetId: `${SOLANA_DEVNET}/token:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`,
      to: 'Payer1111',
      amount: '2000000',
      decimals: 6,
      symbol: 'USDC',
    };
    expect(refundTransfer(usdc)).toMatchObject({ token: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' });
  });

  it('has nothing to send without a recipient or on another chain family', () => {
    const base = { assetId: 'eip155:8453/slip44:60', amount: '1', decimals: 18, symbol: 'ETH' };
    expect(refundTransfer({ ...base, chainId: 'eip155:8453', to: null })).toBeNull();
    expect(refundTransfer({ ...base, chainId: 'cosmos:cosmoshub-4', to: 'cosmos1x' })).toBeNull();
  });
});
