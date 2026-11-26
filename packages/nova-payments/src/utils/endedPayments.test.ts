import { TransactionStatus } from '@tuwaio/pulsar-core';
import { describe, expect, it } from 'vitest';

import { endedPayments } from './endedPayments';

const credited = (txKey: string, extra: object = {}) => ({
  txKey,
  chainId: 'eip155:8453',
  amount: '1',
  symbol: 'USDC',
  decimals: 6,
  from: null,
  at: '2026-11-25T14:00:00.000Z',
  ...extra,
});
const rejected = (txKey: string, reason: string, extra: object = {}) => ({ txKey, reason, final: true, ...extra });

// Live: the node of the page ran out of its allowance. The payment was found and credited, the page said so, and the toast
// beside it went on spinning with "Speed up", which asked the wallet to replace a transaction already mined
describe('what Quasar knows of how the payments of an invoice ended', () => {
  it('a credited one succeeded, and the one it was sped up from was replaced by it', () => {
    expect(endedPayments({ payments: [credited('0xnew', { original: '0xold' }), credited('0xplain')] })).toEqual([
      {
        txKey: '0xold',
        fields: {
          pending: false,
          status: TransactionStatus.Replaced,
          replacedReason: 'repriced',
          replacedTxHash: '0xnew',
        },
      },
      { txKey: '0xnew', fields: { pending: false, isError: false, status: TransactionStatus.Success } },
      { txKey: '0xplain', fields: { pending: false, isError: false, status: TransactionStatus.Success } },
    ]);
  });

  it('a cancelled one was replaced, by what when Quasar knows', () => {
    const ended = { pending: false, status: TransactionStatus.Replaced, replacedReason: 'cancelled' };
    expect(
      endedPayments({
        rejectedPayments: [rejected('0xa', 'cancelled', { replacedBy: '0xb' }), rejected('0xc', 'cancelled')],
      }),
    ).toEqual([
      { txKey: '0xa', fields: { ...ended, replacedTxHash: '0xb' } },
      { txKey: '0xc', fields: ended },
    ]);
  });

  it.each(['reverted', 'expired', 'unresolved_after_24h'])('%s: it failed', (reason) => {
    expect(endedPayments({ rejectedPayments: [rejected('0xa', reason)] })).toEqual([
      { txKey: '0xa', fields: { pending: false, isError: true, status: TransactionStatus.Failed } },
    ]);
  });

  // The transfer went through and pays nothing, which the page tells: its toast speaks of the transfer alone
  it('a transaction that went through without paying the invoice succeeded', () => {
    expect(
      endedPayments({ rejectedPayments: [rejected('0xa', 'no_matching_transfer', { movedMoney: true })] }),
    ).toEqual([{ txKey: '0xa', fields: { pending: false, isError: false, status: TransactionStatus.Success } }]);
  });

  it('a rejected one that was sped up: the hash the wallet returned was replaced by it', () => {
    const [first] = endedPayments({
      rejectedPayments: [rejected('0xnew', 'no_matching_transfer', { movedMoney: true, original: '0xold' })],
    });
    expect(first).toMatchObject({ txKey: '0xold', fields: { replacedReason: 'repriced', replacedTxHash: '0xnew' } });
  });

  // Only lost sight of, or with no word on the network: its tracker goes on
  it.each([
    ['timeout', { final: false }],
    ['not_found', { final: false }],
    ['nonce_spent', { final: false, movedMoney: true }],
    ['settlement_failed', { final: false, movedMoney: true }],
    ['no_quote', {}],
    ['relay_unfinished', {}],
  ])('%s: says nothing of the transaction', (reason, extra) => {
    expect(endedPayments({ rejectedPayments: [rejected('0xa', reason, extra)] })).toEqual([]);
  });

  it('nothing with a Quasar that lists none', () => {
    expect(endedPayments({})).toEqual([]);
  });
});
