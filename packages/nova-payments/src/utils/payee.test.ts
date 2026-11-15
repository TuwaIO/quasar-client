import type { CheckoutQuote, PayoutRecord } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';
import { handOffPayUrl, payeeStatus, payeeVerified, verifyInvoiceAddressWith, verifyPayeeWith } from './payee';

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

// The phone's checkout must refuse the same addresses as this one: a hand-off link without pins would drop them
describe('handOffPayUrl', () => {
  const EVM = '0x52908400098527886E0F7030069857D2E4169EE7';
  const PAY_URL = 'https://pay.example/pay/tok';

  it('adds the pinned payout addresses to a link that has none', () => {
    expect(handOffPayUrl(PAY_URL, [EVM])).toBe(`${PAY_URL}#payout=${EVM}`);
  });

  it('keeps a link with pins of its own, a checkout without pins and a missing link as they are', () => {
    const pinned = `${PAY_URL}#payout=0x0000000000000000000000000000000000000001`;
    expect(handOffPayUrl(pinned, [EVM])).toBe(pinned);
    expect(handOffPayUrl(PAY_URL, undefined)).toBe(PAY_URL);
    expect(handOffPayUrl(PAY_URL, [])).toBe(PAY_URL);
    expect(handOffPayUrl(null, [EVM])).toBeNull();
    expect(handOffPayUrl(undefined, [EVM])).toBeUndefined();
  });
});

describe('verifyInvoiceAddressWith', () => {
  const invoiceAddress = { index: '0' } as unknown as Parameters<typeof verifyInvoiceAddressWith>[1]['invoiceAddress'];

  it('asks the EVM adapter, and answers null where none checks the address', async () => {
    const verifyInvoiceAddress = vi.fn(async () => true);
    const adapters = [{ family: 'eip155', verifyInvoiceAddress } as unknown as PaymentsAdapter];
    const params = { invoiceAddress, address: '0x1', chainId: 'eip155:8453' };
    await expect(verifyInvoiceAddressWith(adapters, params)).resolves.toBe(true);
    expect(verifyInvoiceAddress).toHaveBeenCalledWith(params);
    await expect(verifyInvoiceAddressWith([], params)).resolves.toBeNull();
    await expect(verifyInvoiceAddressWith(undefined, params)).resolves.toBeNull();
    await expect(
      verifyInvoiceAddressWith([{ family: 'eip155' } as unknown as PaymentsAdapter], params),
    ).resolves.toBeNull();
  });
});
