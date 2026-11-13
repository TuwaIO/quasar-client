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
      state: {
        invoiceStatus,
        quote: here,
        txHash: '0xhash',
        txKey: null,
        checkout: { quote: paidElsewhere, invoice: {} },
      },
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

  // The paid step named one transaction, the one this page handed over last: an invoice paid in parts has more, and a
  // receipt opened from its link had none to name
  describe('the transfers credited to the invoice', () => {
    const first = '2026-10-08T12:01:00.000Z';
    const second = '2026-10-08T12:05:00.000Z';
    const solana = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const useTransfersOf = (payments: unknown) => {
      context.value = {
        locale: 'en',
        adapterFor: (family: string) => ({
          explorerUrl: ({ chainId, txKey }: { chainId: string; txKey: string }) =>
            `https://scan.example/${family}/${chainId}/${txKey}`,
        }),
        state: { invoiceStatus: 'paid', quote: null, txHash: null, txKey: null, checkout: { invoice: { payments } } },
      };
      return usePaymentFacts().transfers;
    };

    it('are all listed, oldest first, each with its amount, its time and its explorer link', () => {
      const transfers = useTransfersOf([
        {
          txKey: '0xaaa',
          chainId: 'eip155:8453',
          amount: '40000000',
          symbol: 'USDC',
          decimals: 6,
          from: '0x1',
          at: first,
        },
        { txKey: 'sig', chainId: solana, amount: '9000000', symbol: 'USDC', decimals: 6, from: null, at: second },
      ]);
      expect(transfers).toEqual([
        {
          txKey: '0xaaa',
          amount: '40.00 USDC',
          at: Date.parse(first),
          explorerUrl: 'https://scan.example/eip155/eip155:8453/0xaaa',
        },
        {
          txKey: 'sig',
          amount: '9.00 USDC',
          at: Date.parse(second),
          explorerUrl: `https://scan.example/solana/${solana}/sig`,
        },
      ]);
    });

    it('keep their transaction when Quasar names no token or network for one', () => {
      expect(
        useTransfersOf([
          { txKey: '0xaaa', chainId: null, amount: '1', symbol: null, decimals: null, from: null, at: first },
        ]),
      ).toEqual([{ txKey: '0xaaa', amount: null, at: Date.parse(first), explorerUrl: undefined }]);
    });

    it('are none for a Quasar that does not list them', () => {
      expect(useTransfersOf(undefined)).toEqual([]);
    });
  });
});
