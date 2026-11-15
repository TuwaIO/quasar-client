import type { CheckoutQuote, PayoutRecord } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import { payeeStatus, payeeVerified, verifyPayeeWith } from './payee';

const quote = { methodId: 'usdc-base' } as unknown as CheckoutQuote;
const record = { app: 'app_7Kq2' } as unknown as PayoutRecord;

describe('payeeStatus', () => {
  it('is the check of this very quote, and checking until there is one', () => {
    expect(payeeStatus({ quote, payeeCheck: { quote, status: 'verified', signed: true } })).toEqual({
      status: 'verified',
    });
    expect(payeeStatus({ quote, payeeCheck: { quote, status: 'refused', reason: 'payee_unsigned' } })).toEqual({
      status: 'refused',
      reason: 'payee_unsigned',
    });
    expect(payeeStatus({ quote, payeeCheck: { quote, status: 'checking' } })).toEqual({ status: 'checking' });
    expect(payeeStatus({ quote, payeeCheck: null })).toEqual({ status: 'checking' });
    expect(payeeStatus({ quote })).toEqual({ status: 'checking' });
    // The verified check of an earlier quote says nothing of this one
    const earlier = { ...quote };
    expect(payeeStatus({ quote, payeeCheck: { quote: earlier, status: 'verified', signed: true } })).toEqual({
      status: 'checking',
    });
  });
});

describe('payeeVerified', () => {
  it('holds only for a verified check of this very quote', () => {
    expect(payeeVerified({ payeeCheck: { quote, status: 'verified', signed: false } }, quote)).toBe(true);
    expect(payeeVerified({ payeeCheck: { quote: { ...quote }, status: 'verified', signed: true } }, quote)).toBe(false);
    expect(payeeVerified({ payeeCheck: { quote, status: 'checking' } }, quote)).toBe(false);
    expect(payeeVerified({ payeeCheck: { quote, status: 'refused', reason: 'payee_mismatch' } }, quote)).toBe(false);
    expect(payeeVerified({}, quote)).toBe(false);
  });
});

describe('verifyPayeeWith', () => {
  const adapter = (family: 'eip155' | 'solana', verifyPayoutRecord?: PaymentsAdapter['verifyPayoutRecord']) =>
    ({ family, verifyPayoutRecord }) as PaymentsAdapter;

  it("asks the adapter of the quote's chain family", async () => {
    const evm = vi.fn(async () => true);
    const solana = vi.fn(async () => false);
    const adapters = [adapter('eip155', evm), adapter('solana', solana)];
    await expect(verifyPayeeWith(adapters, { record, signature: '0x1', chainId: 'eip155:8453' })).resolves.toBe(true);
    expect(evm).toHaveBeenCalledWith({ record, signature: '0x1', chainId: 'eip155:8453' });
    await expect(
      verifyPayeeWith(adapters, { record, signature: 's', chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' }),
    ).resolves.toBe(false);
    expect(solana).toHaveBeenCalledTimes(1);
  });

  it('cannot check a family with no adapter, or an adapter without the check', async () => {
    const params = { record, signature: 's', chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' };
    await expect(verifyPayeeWith(undefined, params)).resolves.toBeNull();
    await expect(
      verifyPayeeWith(
        [
          adapter(
            'eip155',
            vi.fn(async () => true),
          ),
        ],
        params,
      ),
    ).resolves.toBeNull();
    await expect(verifyPayeeWith([adapter('solana')], params)).resolves.toBeNull();
  });
});
