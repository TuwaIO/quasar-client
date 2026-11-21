import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { forgetBatch, keepBatch, type KeptBatch, keptBatchOf } from './keptBatches';

const KEY = 'nova-payments:sponsoredBatches';

const memory = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
};

const batch = (invoiceId: string, at = Date.now()): KeptBatch => ({
  invoiceId,
  batchId: `batch-${invoiceId}`,
  account: '0x1111111111111111111111111111111111111111',
  instructions: {
    family: 'eip155',
    chainId: 84532,
    to: '0x2222222222222222222222222222222222222222',
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    amount: '89540000',
    decimals: 6,
    symbol: 'USDC',
  },
  connectorType: 'evm:metamask',
  at,
});

let storage: ReturnType<typeof memory>;
beforeEach(() => {
  storage = memory();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

// Kept in the browser, not in the tab: an entry nobody can read would break the checkout in every tab of the browser
// until the storage is cleared, where it once broke one tab
describe('kept sponsored batches', () => {
  it('skip entries that are not batches, and keep the ones that are', () => {
    const kept = batch('inv_1');
    storage.setItem(KEY, JSON.stringify([null, 7, 'batch', { invoiceId: 'inv_2' }, kept]));
    expect(() => keptBatchOf('inv_1')).not.toThrow();
    expect(keptBatchOf('inv_1')).toEqual(kept);
    expect(keptBatchOf('inv_2')).toBeNull();

    // The next write leaves only batches that still count
    keepBatch(batch('inv_3'));
    expect(JSON.parse(storage.getItem(KEY) ?? '[]').map((entry: KeptBatch) => entry.invoiceId)).toEqual([
      'inv_1',
      'inv_3',
    ]);
  });

  it('read nothing from an entry that is not a list, and forget it', () => {
    storage.setItem(KEY, '{"invoiceId":"inv_1"}');
    expect(keptBatchOf('inv_1')).toBeNull();
    forgetBatch('inv_1');
    expect(storage.getItem(KEY)).toBeNull();
  });
});
