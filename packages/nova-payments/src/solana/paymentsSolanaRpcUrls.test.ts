/**
 * @file The RPC URLs of a cluster, over the real clients of `@tuwaio/orbit-solana`: a read goes to the next one when one
 * does not answer, and the Pulsar transaction of a payment carries them all for its tracker.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { paymentsSolanaAdapter } from './paymentsSolanaAdapter';

const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const PAYER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const MERCHANT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const MAIN = 'https://main.example/';
const SPARE = 'https://spare.example/';

describe('the RPC URLs of a cluster', () => {
  const asked: string[] = [];

  beforeEach(() => {
    asked.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        asked.push(url);
        if (url === MAIN) return new Response('too many requests', { status: 429 });
        return Response.json({ jsonrpc: '2.0', id: '1', result: { context: { slot: 1 }, value: 2_000_000_000 } });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a balance through the next one when the first does not answer', async () => {
    const adapter = paymentsSolanaAdapter({ rpcUrls: { devnet: [MAIN, SPARE] } });

    await expect(adapter.getBalance({ chainId: DEVNET, account: PAYER, token: 'native' })).resolves.toBe(
      2_000_000_000n,
    );
    expect(asked).toEqual([MAIN, SPARE]);
  });

  // The tracker of Pulsar reads the transaction's URLs when the app's Pulsar adapter has none for the cluster
  it('gives the Pulsar transaction of a payment all of them', () => {
    const tx = paymentsSolanaAdapter({ rpcUrls: { devnet: [MAIN, SPARE] } }).pulsarTransaction!({
      txKey: '5'.repeat(88),
      instructions: {
        family: 'solana',
        chainId: DEVNET,
        to: MERCHANT,
        token: 'native',
        amount: '1',
        decimals: 9,
        symbol: 'SOL',
        reference: PAYER,
        solanaPayUrl: 'solana:x',
      },
      account: PAYER,
      connectorType: 'solana:phantom',
      title: 'Payment',
      description: '',
      payload: {},
    });

    expect(tx).toMatchObject({ rpcUrl: [MAIN, SPARE] });
  });
});
