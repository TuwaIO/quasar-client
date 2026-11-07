import { describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('./useCheckoutContext', () => ({ useCheckoutContext: () => context.value }));

const { usePaymentFacts } = await import('./usePaymentFacts');

const quoteOf = (amountToSend: string, symbol: string, chainId: number) => ({
  amountToSend,
  amountDue: amountToSend,
  cryptoAmountExpected: amountToSend,
  decimals: 6,
  payer: null,
  instructions: { family: 'eip155', chainId, to: '0x2', token: '0x3', amount: amountToSend, decimals: 6, symbol },
});

describe('usePaymentFacts', () => {
  const here = quoteOf('30000000', 'USDC', 8453);
  const paidElsewhere = quoteOf('100000000', 'USDT', 137);
  const useFactsOf = (invoiceStatus: string) => {
    context.value = {
      locale: 'en',
      adapterFor: () => undefined,
      state: { invoiceStatus, quote: here, txHash: '0xhash', txKey: null, checkout: { quote: paidElsewhere } },
    };
    return usePaymentFacts();
  };

  it('names the price this tab locked while the invoice is open', () => {
    expect(useFactsOf('open').amount).toBe('30.00 USDC');
  });

  it('names the payment that happened once it settled: another tab or device may have paid it', () => {
    expect(useFactsOf('paid').amount).toBe('100.00 USDT');
    expect(useFactsOf('paid').network).not.toBe(useFactsOf('open').network);
  });
});
