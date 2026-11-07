import { expect, it, vi } from 'vitest';

// Whether something loaded Pulsar, which brings `zustand`, `immer` and `dayjs` to a webhook handler's every cold start
const loaded = vi.hoisted(() => ({ pulsar: false }));
vi.mock('@tuwaio/pulsar-core', () => {
  loaded.pulsar = true;
  return { TransactionStatus: {}, TransactionTracker: {} };
});

it('loads no Pulsar with the server entry, which has none of its values', async () => {
  const root = await import('../index');
  expect(loaded.pulsar).toBe(false);
  for (const name of ['TransactionStatus', 'TransactionTracker', 'watchBatchHashes']) {
    expect(name in root).toBe(false);
  }
});

it('has them in the Pulsar entry', async () => {
  const pulsar = await import('../pulsar');
  expect(loaded.pulsar).toBe(true);
  expect(Object.keys(pulsar).sort()).toEqual(['TransactionStatus', 'TransactionTracker', 'watchBatchHashes']);
});
