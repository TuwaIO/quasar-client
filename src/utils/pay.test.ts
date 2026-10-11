import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import { balanceShortfall, instructionsChainId, payPath, quoteAmounts, quoteRate } from './pay';

const quote = (extra: Partial<CheckoutQuote> = {}): CheckoutQuote =>
  ({
    object: 'checkout_quote',
    methodId: 'usdc-base',
    payer: 'eip155:8453:0x1111111111111111111111111111111111111111',
    cryptoAmountExpected: '89540000',
    amountToSend: '89540000',
    transferFee: null,
    decimals: 6,
    symbol: 'USDC',
    lockedAt: null,
    expiresAt: null,
    reference: null,
    rates: [],
    markupBps: 0,
    discountBps: 0,
    instructions: {
      family: 'eip155',
      chainId: 8453,
      to: '0x2222222222222222222222222222222222222222',
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '89540000',
      decimals: 6,
      symbol: 'USDC',
    },
    gasless: null,
    ...extra,
  }) as CheckoutQuote;

const RELAY = {
  relay: { typedData: { domain: {}, types: {}, primaryType: 'TransferWithAuthorization', message: {} } },
};
const PAYMASTER = { paymaster: { calls: [{ to: '0x3', value: '0', data: '0x' }] } };

describe('payPath', () => {
  it('signs an authorization the merchant relays, unless the buyer pays the gas', () => {
    expect(payPath(quote({ gasless: RELAY }), { withGas: false, canSponsorCalls: false })).toBe('relay');
    expect(payPath(quote({ gasless: RELAY }), { withGas: true, canSponsorCalls: false })).toBe('transfer');
  });

  it('sends sponsored calls from a wallet that takes a paymaster, before an authorization', () => {
    expect(payPath(quote({ gasless: PAYMASTER }), { withGas: false, canSponsorCalls: true })).toBe('paymaster');
    expect(payPath(quote({ gasless: PAYMASTER }), { withGas: false, canSponsorCalls: false })).toBe('transfer');
    expect(payPath(quote({ gasless: { ...RELAY, ...PAYMASTER } }), { withGas: false, canSponsorCalls: true })).toBe(
      'paymaster',
    );
    expect(payPath(quote({ gasless: { ...RELAY, ...PAYMASTER } }), { withGas: false, canSponsorCalls: false })).toBe(
      'relay',
    );
  });

  it('sends the transfer when the merchant sponsors nothing', () => {
    expect(payPath(quote(), { withGas: false, canSponsorCalls: true })).toBe('transfer');
  });
});

describe('quoteAmounts', () => {
  it('sends what the merchant receives when the token keeps no fee', () => {
    expect(quoteAmounts(quote())).toEqual({ send: '89540000', receives: '89540000', fee: null });
  });

  it("adds the token's transfer fee to what the buyer sends", () => {
    expect(
      quoteAmounts(quote({ amountToSend: '89720000', transferFee: { bps: 20, maxFee: null, source: 'contract' } })),
    ).toEqual({ send: '89720000', receives: '89540000', fee: { amount: '180000', percent: '0.2' } });
  });
});

describe('quoteRate', () => {
  it('is the market price of one token in the invoice currency, without the markup or discount of the method', () => {
    expect(quoteRate(quote(), '8954')).toBe(1);
    // 89.54 USD with a 2 % discount at 150 USD per SOL: 0.584994666… SOL, rounded up to 9 decimals
    const sol = quote({ cryptoAmountExpected: '584994667', decimals: 9, symbol: 'SOL', discountBps: 200 });
    expect(quoteRate(sol, '8954')).toBeCloseTo(150, 4);
    const markup = quote({ cryptoAmountExpected: '90883100', markupBps: 150 });
    expect(quoteRate(markup, '8954')).toBeCloseTo(1, 6);
  });

  it('is unknown without the invoice total or a token amount', () => {
    expect(quoteRate(quote(), null)).toBeNull();
    expect(quoteRate(quote({ cryptoAmountExpected: '0' }), '8954')).toBeNull();
  });
});

describe('balanceShortfall', () => {
  it('is how much the wallet lacks for the amount to send', () => {
    expect(balanceShortfall(52_100_000n, quote())).toEqual({ have: '52100000', need: '89540000', short: '37440000' });
    expect(balanceShortfall(89_540_000n, quote())).toBeNull();
    expect(balanceShortfall(100_000_000n, quote())).toBeNull();
  });

  it('counts the network fee when the buyer pays in the coin the gas is paid with', () => {
    expect(balanceShortfall(1000n, quote({ amountToSend: '900' }), 200n)).toEqual({
      have: '1000',
      need: '1100',
      short: '100',
    });
  });
});

describe('instructionsChainId', () => {
  it('is the CAIP-2 chain the wallet pays on', () => {
    expect(instructionsChainId(quote().instructions)).toBe('eip155:8453');
    expect(
      instructionsChainId({
        family: 'solana',
        chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        to: 'x',
        token: 'native',
        amount: '1',
        decimals: 9,
        symbol: 'SOL',
        reference: 'r',
        solanaPayUrl: 'solana:x',
      }),
    ).toBe('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1');
  });
});
