import type { CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { describe, expect, it } from 'vitest';

import { invoiceTotals } from './totals';

const line = (netMinor: string, taxRate: string) => ({
  name: 'Line',
  quantity: '1',
  unitPrice: '0',
  taxCategory: (taxRate === '0' ? 'O' : 'S') as 'O' | 'S',
  taxRate,
  netMinor,
});

const invoice = (lineItems: ReturnType<typeof line>[], totalMinor: string) =>
  ({ lineItems, totalMinor }) as unknown as CheckoutView['invoice'];

describe('invoiceTotals', () => {
  it('takes the subtotal from the lines and the tax from the total, with the rate they share', () => {
    expect(invoiceTotals(invoice([line('4900', '21'), line('1500', '21'), line('1000', '21')], '8954'))).toEqual({
      subtotal: '74.00',
      tax: '15.54',
      rate: '21',
      total: '89.54',
    });
  });

  it('names no rate when the lines have different ones, and no tax when there is none', () => {
    expect(invoiceTotals(invoice([line('1000', '21'), line('1000', '9')], '2300'))).toMatchObject({
      tax: '3.00',
      rate: null,
    });
    expect(invoiceTotals(invoice([line('120000', '0')], '120000'))).toMatchObject({ tax: null, total: '1200.00' });
    expect(invoiceTotals(invoice([line('1000', '7.50')], '1075')).rate).toBe('7.5');
  });
});
