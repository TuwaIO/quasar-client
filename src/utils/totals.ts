import type { CheckoutView } from '@tuwaio/quasar-sdk/checkout';

import { minorToDecimal } from './format';

/**
 * Subtotal and tax of the invoice from its lines: the lines carry net amounts, the total includes tax. The tax row
 * shows the rate when all taxed lines share one.
 *
 * @param invoice - The invoice of the checkout.
 * @returns The subtotal, the tax (`null` without tax), its rate (`null` with several) and the total, as decimals.
 */
export function invoiceTotals(invoice: CheckoutView['invoice']) {
  const subtotalMinor = invoice.lineItems.reduce((sum, line) => sum + BigInt(line.netMinor), 0n);
  const totalMinor = BigInt(invoice.totalMinor ?? subtotalMinor.toString());
  const taxMinor = totalMinor - subtotalMinor;
  const rates = [...new Set(invoice.lineItems.filter((line) => Number(line.taxRate) > 0).map((line) => line.taxRate))];
  return {
    subtotal: minorToDecimal(subtotalMinor.toString()),
    tax: taxMinor > 0n ? minorToDecimal(taxMinor.toString()) : null,
    rate: rates.length === 1 ? String(Number(rates[0])) : null,
    total: minorToDecimal(totalMinor.toString()),
  };
}
