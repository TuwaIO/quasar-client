import { describe, expect, it, vi } from 'vitest';

import {
  checkQuotePayee,
  payoutAddressesOf,
  type PayoutRecord,
  payoutRecordText,
  withPayoutAddresses,
} from '../checkout/payee';
import type { CheckoutQuote } from '../checkout/types';

const MERCHANT = '0x52908400098527886E0F7030069857D2E4169EE7';
const OTHER = '0x0000000000000000000000000000000000000001';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOL_MERCHANT = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

const RECORD: PayoutRecord = {
  version: 1,
  type: 'address',
  app: 'app_7Kq2',
  chains: ['eip155:1', 'eip155:8453'],
  address: MERCHANT,
  issuedAt: '2026-11-15T01:30:00.000Z',
};

/** An ERC-20 `transfer(to, amount)` call of USDC. */
const transfer = (to: string, amount = 1_000_000n) => ({
  to: USDC,
  value: '0',
  data: `0xa9059cbb${to.slice(2).toLowerCase().padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`,
});

const evmQuote = (overrides: Partial<CheckoutQuote> = {}): CheckoutQuote =>
  ({
    object: 'checkout_quote',
    methodId: 'ap_1',
    payer: `eip155:8453:${OTHER}`,
    instructions: {
      family: 'eip155',
      chainId: 8453,
      to: MERCHANT.toLowerCase(),
      token: USDC,
      amount: '1000000',
      decimals: 6,
      symbol: 'USDC',
    },
    gasless: null,
    payee: { record: RECORD, signature: '0xsig' },
    ...overrides,
  }) as CheckoutQuote;

const solanaQuote = (url: string, payee: CheckoutQuote['payee']): CheckoutQuote =>
  ({
    object: 'checkout_quote',
    methodId: 'ap_2',
    payer: null,
    instructions: {
      family: 'solana',
      chainId: SOLANA,
      to: SOL_MERCHANT,
      token: 'native',
      amount: '1000',
      decimals: 9,
      symbol: 'SOL',
      reference: 'ref',
      solanaPayUrl: url,
    },
    gasless: null,
    payee,
  }) as CheckoutQuote;

describe('the payout record', () => {
  // Quasar signs and checks the same text (`payoutRecordText` of @tuwaio/shared/payments): one byte of difference and
  // no record would verify
  it('is signed as the text Quasar makes of it, line by line', () => {
    expect(payoutRecordText(RECORD)).toBe(
      [
        'Quasar payout address',
        '',
        'This wallet receives the payments of a Quasar app on the networks below. Signing is free: it moves no funds and approves no transfer.',
        '',
        `Address: ${MERCHANT}`,
        'Networks: eip155:1, eip155:8453',
        'App: app_7Kq2',
        'Issued At: 2026-11-15T01:30:00.000Z',
        'Record: address, version 1',
      ].join('\n'),
    );
  });
});

describe('checkQuotePayee', () => {
  it("verifies a quote whose record covers its network and address, by the address's own signature", async () => {
    const verify = vi.fn(async () => true);
    await expect(checkQuotePayee(evmQuote(), { verify })).resolves.toEqual({ status: 'verified', signed: true });
    expect(verify).toHaveBeenCalledWith({ record: RECORD, signature: '0xsig', chainId: 'eip155:8453' });
  });

  it('refuses a signature the verifier does not take, or cannot check', async () => {
    await expect(checkQuotePayee(evmQuote(), { verify: async () => false })).resolves.toEqual({
      status: 'refused',
      reason: 'payee_unverified',
    });
    await expect(
      checkQuotePayee(evmQuote(), {
        verify: async () => {
          throw new Error('rpc down');
        },
      }),
    ).resolves.toEqual({ status: 'refused', reason: 'payee_unverified' });
  });

  it('refuses a quote Quasar has no record for, and one whose record names another address or network', async () => {
    const verify = vi.fn(async () => true);
    await expect(checkQuotePayee(evmQuote({ payee: null }), { verify })).resolves.toEqual({
      status: 'refused',
      reason: 'payee_unsigned',
    });
    await expect(
      checkQuotePayee(evmQuote({ payee: { record: { ...RECORD, address: OTHER }, signature: '0xsig' } }), { verify }),
    ).resolves.toEqual({ status: 'refused', reason: 'payee_mismatch' });
    await expect(
      checkQuotePayee(evmQuote({ payee: { record: { ...RECORD, chains: ['eip155:1'] }, signature: '0xsig' } }), {
        verify,
      }),
    ).resolves.toEqual({ status: 'refused', reason: 'payee_mismatch' });
    expect(verify).not.toHaveBeenCalled();
  });

  // The wallet signs the authorization or sends the calls, not the instructions: each must pay the same address
  it('refuses a gasless offer that pays another address than the instructions', async () => {
    const verify = vi.fn(async () => true);
    const relay = (to: string) =>
      evmQuote({
        gasless: {
          relay: { typedData: { domain: {}, types: {}, primaryType: 'TransferWithAuthorization', message: { to } } },
        },
      });
    await expect(checkQuotePayee(relay(MERCHANT), { verify })).resolves.toMatchObject({ status: 'verified' });
    await expect(checkQuotePayee(relay(OTHER), { verify })).resolves.toEqual({
      status: 'refused',
      reason: 'payee_mismatch',
    });

    const paymaster = (calls: { to: string; value: string; data: string }[]) =>
      evmQuote({ gasless: { paymaster: { calls } } });
    await expect(checkQuotePayee(paymaster([transfer(MERCHANT)]), { verify })).resolves.toMatchObject({
      status: 'verified',
    });
    for (const calls of [
      [transfer(OTHER)],
      [{ ...transfer(MERCHANT), to: OTHER }],
      [{ to: USDC, value: '0', data: '0x23b872dd' }],
      [transfer(MERCHANT), transfer(OTHER)],
    ]) {
      await expect(checkQuotePayee(paymaster(calls), { verify })).resolves.toEqual({
        status: 'refused',
        reason: 'payee_mismatch',
      });
    }
  });

  it('refuses a Solana Pay link to another recipient than the instructions', async () => {
    const payee = { record: { ...RECORD, chains: [SOLANA], address: SOL_MERCHANT }, signature: 'sig' };
    const verify = vi.fn(async () => true);
    await expect(
      checkQuotePayee(solanaQuote(`solana:${SOL_MERCHANT}?amount=0.000001&reference=ref`, payee), { verify }),
    ).resolves.toEqual({ status: 'verified', signed: true });
    await expect(
      checkQuotePayee(solanaQuote(`solana:${OTHER}?amount=0.000001&reference=ref`, payee), { verify }),
    ).resolves.toEqual({ status: 'refused', reason: 'payee_mismatch' });
    // A Solana address is case-sensitive
    await expect(
      checkQuotePayee(solanaQuote(`solana:${SOL_MERCHANT.toLowerCase()}?amount=1`, payee), { verify }),
    ).resolves.toEqual({ status: 'refused', reason: 'payee_mismatch' });
  });

  // A swap in Quasar's database can carry a record its own wallet signed: only the merchant's pinned addresses stop it
  it("refuses an address outside the merchant's pinned addresses, even with a valid record", async () => {
    const verify = vi.fn(async () => true);
    await expect(checkQuotePayee(evmQuote(), { verify, addresses: [OTHER] })).resolves.toEqual({
      status: 'refused',
      reason: 'payee_not_pinned',
    });
    expect(verify).not.toHaveBeenCalled();
    await expect(checkQuotePayee(evmQuote(), { verify, addresses: [MERCHANT.toLowerCase()] })).resolves.toEqual({
      status: 'verified',
      signed: true,
    });
  });

  it('checks the places and the pinned addresses of an engine older than payout records, without a signature', async () => {
    await expect(checkQuotePayee(evmQuote({ payee: undefined }))).resolves.toEqual({
      status: 'verified',
      signed: false,
    });
    await expect(checkQuotePayee(evmQuote({ payee: undefined }), { addresses: [OTHER] })).resolves.toEqual({
      status: 'refused',
      reason: 'payee_not_pinned',
    });
    // Without a verifier the record is matched, its signature not checked
    await expect(checkQuotePayee(evmQuote())).resolves.toEqual({ status: 'verified', signed: false });
  });

  // A page with no chain adapter of the quote's family cannot check the signature: the record is still matched
  it('leaves the signature unchecked when the verifier cannot check the network, and still matches the record', async () => {
    await expect(checkQuotePayee(evmQuote(), { verify: async () => null })).resolves.toEqual({
      status: 'verified',
      signed: false,
    });
    await expect(
      checkQuotePayee(evmQuote({ payee: { record: { ...RECORD, address: OTHER }, signature: '0xsig' } }), {
        verify: async () => null,
      }),
    ).resolves.toEqual({ status: 'refused', reason: 'payee_mismatch' });
  });
});

describe('the pinned payout addresses of a payment link', () => {
  it('travel in the fragment and are read back from it, or from location.hash', () => {
    const link = withPayoutAddresses('https://app.example/pay/tok_1', [MERCHANT, SOL_MERCHANT]);
    expect(link).toBe(`https://app.example/pay/tok_1#payout=${MERCHANT},${SOL_MERCHANT}`);
    expect(payoutAddressesOf(link)).toEqual([MERCHANT, SOL_MERCHANT]);
    expect(payoutAddressesOf(`#payout=${MERCHANT}`)).toEqual([MERCHANT]);
    // A link with a fragment of its own keeps it
    expect(payoutAddressesOf(withPayoutAddresses('https://app.example/pay/tok_1#lang=uk', [MERCHANT]))).toEqual([
      MERCHANT,
    ]);
  });

  it('are none for a link without them, and leave a link without pins as it is', () => {
    expect(withPayoutAddresses('https://app.example/pay/tok_1', [])).toBe('https://app.example/pay/tok_1');
    expect(payoutAddressesOf('https://app.example/pay/tok_1')).toBeUndefined();
    expect(payoutAddressesOf('#payout=')).toBeUndefined();
    expect(payoutAddressesOf('')).toBeUndefined();
  });
});
