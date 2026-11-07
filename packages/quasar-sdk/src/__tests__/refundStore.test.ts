import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRefundStore } from '../checkout';
import { QuasarSDKError } from '../core/errors';
import type { Refund, RefundStart } from '../modules/payments/types';

const refund = (status: Refund['status'], extra: Partial<Refund> = {}): Refund =>
  ({ id: 'ref_1', object: 'refund', invoiceId: 'inv_1', status, amount: '10.00', ...extra }) as Refund;

const START: RefundStart = {
  refund: refund('requested'),
  instructions: {
    chainId: 'eip155:8453',
    assetId: 'eip155:8453/erc20:0x3',
    to: '0x1',
    amount: '10000000',
    decimals: 6,
    symbol: 'USDC',
  },
};

describe('createRefundStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('a transaction the wallet sent', () => {
    const SENT = { txHash: '0xsent', from: '0xmerchant' };
    const memory = () => {
      const items = new Map<string, string>();
      return {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => void items.set(key, value),
        removeItem: (key: string) => void items.delete(key),
      };
    };
    const noAnswer = () => vi.fn().mockRejectedValue(new Error('Quasar did not answer'));
    const refusal = (status: number, code: string) =>
      vi.fn().mockRejectedValue(Object.assign(new Error(code), { status, code }));
    const page = (
      handOverStorage: ReturnType<typeof memory>,
      calls: Partial<Parameters<typeof createRefundStore>[0]> = {},
    ) =>
      createRefundStore({
        request: vi.fn().mockResolvedValue(START),
        submit: noAnswer(),
        get: vi.fn().mockResolvedValue(refund('requested')),
        pollMs: 60_000,
        handOverStorage,
        ...calls,
      });

    it('is kept through a reload when Quasar did not answer, so the wallet is not asked again', async () => {
      const storage = memory();
      const first = page(storage);
      await first.getState().start('inv_1');
      expect(await first.getState().submit(SENT)).toBe(false);
      expect(first.getState()).toMatchObject({ phase: 'awaitingTransfer', sentTransaction: SENT });

      const reloaded = page(storage);
      reloaded.getState().resume(refund('requested'), START.instructions);
      expect(reloaded.getState().sentTransaction).toEqual(SENT);
      // Quasar still says that the refund waits, and a wallet asked now would send it a second time
      expect(await reloaded.getState().recheck()).toBe(false);
      expect(reloaded.getState().phase).toBe('awaitingTransfer');
    });

    it('is forgotten once Quasar took it', async () => {
      const storage = memory();
      const first = page(storage, { submit: vi.fn().mockResolvedValue(refund('submitted')) });
      await first.getState().start('inv_1');
      expect(await first.getState().submit(SENT)).toBe(true);
      first.getState().reset();
      const reloaded = page(storage);
      reloaded.getState().resume(refund('requested'), START.instructions);
      expect(reloaded.getState().sentTransaction).toBeNull();
    });

    it('is forgotten when Quasar refused it for good, and the page says why', async () => {
      const storage = memory();
      const first = page(storage, { submit: refusal(409, 'refund_from_buyer') });
      await first.getState().start('inv_1');
      await first.getState().submit(SENT);
      expect(first.getState()).toMatchObject({ sentTransaction: null, error: { code: 'refund_from_buyer' } });
      const reloaded = page(storage);
      reloaded.getState().resume(refund('requested'), START.instructions);
      expect(reloaded.getState().sentTransaction).toBeNull();
    });

    it.each([401, 403, 408, 425, 429])(
      'stays kept on a %i, which says nothing about the transaction',
      async (status) => {
        const storage = memory();
        const first = page(storage, { submit: refusal(status, 'not_now') });
        await first.getState().start('inv_1');
        await first.getState().submit(SENT);
        expect(first.getState().sentTransaction).toEqual(SENT);
      },
    );

    it('comes back on a new start for the invoice, with no second refund asked for', async () => {
      const storage = memory();
      const first = page(storage);
      await first.getState().start('inv_1');
      await first.getState().submit(SENT);

      const request = vi.fn();
      const reloaded = page(storage, { request });
      expect(await reloaded.getState().start('inv_1', { amount: '5.00' } as never)).toBe(true);
      expect(request).not.toHaveBeenCalled();
      expect(reloaded.getState()).toMatchObject({
        phase: 'awaitingTransfer',
        sentTransaction: SENT,
        instructions: START.instructions,
        refund: { id: 'ref_1' },
      });
    });

    it('follows a refund Quasar turns out to have taken, when the answer was lost', async () => {
      const storage = memory();
      const first = page(storage);
      await first.getState().start('inv_1');
      await first.getState().submit(SENT);

      const request = vi.fn();
      const reloaded = page(storage, { request, get: vi.fn().mockResolvedValue(refund('submitted')) });
      await reloaded.getState().start('inv_1');
      expect(request).not.toHaveBeenCalled();
      expect(reloaded.getState().phase).toBe('confirming');
      reloaded.getState().reset();
    });

    it('asks for no second refund while Quasar does not say what became of the first', async () => {
      const storage = memory();
      const first = page(storage);
      await first.getState().start('inv_1');
      await first.getState().submit(SENT);

      const request = vi.fn();
      const reloaded = page(storage, { request, get: noAnswer() });
      expect(await reloaded.getState().start('inv_1')).toBe(false);
      expect(request).not.toHaveBeenCalled();
      expect(reloaded.getState().error).not.toBeNull();
    });

    it('asks for a new refund once the kept one is over', async () => {
      const storage = memory();
      const first = page(storage);
      await first.getState().start('inv_1');
      await first.getState().submit(SENT);

      const request = vi.fn().mockResolvedValue(START);
      const reloaded = page(storage, { request, get: vi.fn().mockResolvedValue(refund('confirmed')) });
      expect(await reloaded.getState().start('inv_1')).toBe(true);
      expect(request).toHaveBeenCalledOnce();
      expect(reloaded.getState().sentTransaction).toBeNull();
    });

    it('works without a storage: a full or blocked one only loses the reload', async () => {
      const blocked = {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
        removeItem: () => {
          throw new Error('blocked');
        },
      };
      const first = page(blocked);
      await first.getState().start('inv_1');
      await first.getState().submit(SENT);
      expect(first.getState().sentTransaction).toEqual(SENT);
    });
  });

  describe('following a submitted refund', () => {
    const following = async (get: () => Promise<Refund>) => {
      vi.useFakeTimers();
      const store = createRefundStore({
        request: vi.fn().mockResolvedValue(START),
        submit: vi.fn().mockResolvedValue(refund('submitted')),
        get,
        pollMs: 5_000,
        handOverStorage: null,
      });
      await store.getState().start('inv_1');
      await store.getState().submit({ txHash: '0x1', from: '0x2' });
      return store;
    };

    it('reads calmly once the refund has been on its way for minutes: it can stay for days', async () => {
      const get = vi.fn(async () => refund('submitted'));
      const store = await following(get);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      const atFirst = get.mock.calls.length;
      expect(atFirst).toBeGreaterThanOrEqual(59);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(get.mock.calls.length - atFirst).toBeLessThanOrEqual(10);
      store.getState().reset();
    });

    it.each([401, 403, 404])('stops on a %i: reading again cannot help', async (status) => {
      const get = vi.fn().mockRejectedValue(Object.assign(new Error('no'), { status, code: 'no' }));
      const store = await following(get);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(get).toHaveBeenCalledOnce();
      expect(store.getState().phase).toBe('confirming');
    });

    it('goes on after a read that failed for now', async () => {
      const get = vi
        .fn()
        .mockRejectedValueOnce(new Error('Quasar did not answer'))
        .mockResolvedValueOnce(refund('confirmed'));
      const store = await following(get);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(store.getState().phase).toBe('confirmed');
    });

    it('stops on stopFollowing and goes on with keepFollowing', async () => {
      const get = vi.fn(async () => refund('submitted'));
      const store = await following(get);
      store.getState().stopFollowing();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(get).not.toHaveBeenCalled();
      store.getState().keepFollowing();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(get).toHaveBeenCalledOnce();
      store.getState().reset();
    });

    it('keepFollowing starts nothing for a refund that is not on its way', async () => {
      const get = vi.fn(async () => refund('submitted'));
      vi.useFakeTimers();
      const store = createRefundStore({
        request: vi.fn().mockResolvedValue(START),
        submit: vi.fn(),
        get,
        handOverStorage: null,
      });
      await store.getState().start('inv_1');
      store.getState().keepFollowing();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('recheck, before a wallet is asked', () => {
    const started = async (get: () => Promise<Refund>) => {
      const store = createRefundStore({
        request: vi.fn().mockResolvedValue(START),
        submit: vi.fn(),
        get,
        pollMs: 1_000,
      });
      await store.getState().start('inv_1');
      return store;
    };

    it('says yes while the refund still waits for its transaction', async () => {
      const store = await started(async () => refund('requested'));
      expect(await store.getState().recheck()).toBe(true);
      expect(store.getState().phase).toBe('awaitingTransfer');
    });

    // Another tab continued the refund and Quasar priced it again: the old amount would over- or under-refund the buyer
    it('says no to a refund priced again meanwhile, and shows the new amount', async () => {
      const store = await started(async () => refund('requested', { cryptoAmount: '12000000' }));
      expect(await store.getState().recheck()).toBe(false);
      expect(store.getState()).toMatchObject({
        phase: 'awaitingTransfer',
        instructions: { amount: '12000000' },
        error: { code: 'refund_repriced' },
      });
      expect(await store.getState().recheck()).toBe(true);
      expect(store.getState().error).toBeNull();
    });

    it('says no to a refund withdrawn meanwhile, and shows why: a window left open would pay out money nobody asks for', async () => {
      const store = await started(async () => refund('failed', { failureReason: 'withdrawn' }));
      expect(await store.getState().recheck()).toBe(false);
      expect(store.getState()).toMatchObject({ phase: 'failed', refund: { failureReason: 'withdrawn' } });
    });

    it('says no to a refund another window already sent, and follows it', async () => {
      vi.useFakeTimers();
      const get = vi.fn().mockResolvedValue(refund('submitted', { txHash: '0xfeed' }));
      const store = await started(get);
      expect(await store.getState().recheck()).toBe(false);
      expect(store.getState().phase).toBe('confirming');

      get.mockResolvedValue(refund('confirmed'));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(store.getState().phase).toBe('confirmed');
      store.getState().reset();
    });

    it('says no when Quasar does not answer: it cannot be known that the refund still waits', async () => {
      const store = await started(async () => {
        throw new Error('network');
      });
      expect(await store.getState().recheck()).toBe(false);
      expect(store.getState()).toMatchObject({ phase: 'awaitingTransfer', error: { code: 'request_failed' } });
    });

    it('says no without a refund', async () => {
      const store = createRefundStore({ request: vi.fn(), submit: vi.fn(), get: vi.fn() });
      expect(await store.getState().recheck()).toBe(false);
    });
  });

  it('asks for a refund, takes its transaction and follows it until confirmed', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(START);
    const submit = vi.fn().mockResolvedValue(refund('submitted', { txHash: '0xfeed' }));
    const get = vi
      .fn()
      .mockResolvedValueOnce(refund('submitted'))
      .mockResolvedValueOnce(refund('confirmed', { creditNoteNumber: 'CN-2026-1' }));
    const store = createRefundStore({ request, submit, get, pollMs: 1_000 });
    expect(store.getState().phase).toBe('idle');

    expect(await store.getState().start('inv_1', { amount: '10.00', reason: 'Partial refund' })).toBe(true);
    expect(request).toHaveBeenCalledWith('inv_1', { amount: '10.00', reason: 'Partial refund' });
    expect(store.getState()).toMatchObject({ phase: 'awaitingTransfer', instructions: START.instructions });

    // The merchant's wallet sends instructions.amount of the token to instructions.to, then:
    expect(await store.getState().submit({ txHash: '0xfeed', from: '0x9' })).toBe(true);
    expect(submit).toHaveBeenCalledWith('ref_1', { txHash: '0xfeed', from: '0x9' });
    expect(store.getState().phase).toBe('confirming');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.getState().phase).toBe('confirming');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.getState()).toMatchObject({ phase: 'confirmed', refund: { creditNoteNumber: 'CN-2026-1' } });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('picks up a refund still waiting for its transaction, and reports a failed one', async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockResolvedValue(refund('failed', { failureReason: 'wrong_amount' }));
    const store = createRefundStore({
      request: vi.fn(),
      submit: vi.fn().mockResolvedValue(refund('submitted')),
      get,
      pollMs: 1_000,
    });
    store.getState().resume(refund('requested'), START.instructions);
    expect(store.getState().phase).toBe('awaitingTransfer');
    await store.getState().submit({ txHash: '0xfeed', from: '0x9' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(store.getState()).toMatchObject({ phase: 'failed', refund: { failureReason: 'wrong_amount' } });
  });

  it('names the invoice a transfer is held on too, for one refund only', async () => {
    const refusal = new QuasarSDKError('[Quasar SDK] Request Failed (409): Held elsewhere', 409, new Error('x'), {
      code: 'payment_held_elsewhere',
      details: { invoice: 'inv_2' },
    });
    const store = createRefundStore({
      request: vi.fn().mockRejectedValue(refusal),
      submit: vi.fn(),
      get: vi.fn(),
    });
    expect(await store.getState().start('inv_1')).toBe(false);
    expect(store.getState()).toMatchObject({
      phase: 'idle',
      error: { code: 'payment_held_elsewhere', status: 409, otherInvoice: 'inv_2' },
    });
  });

  it('shows what a refund would send without asking for it', async () => {
    const shown = {
      amount: '10.00',
      currency: 'EUR',
      cryptoAmount: '12000000',
      symbol: 'USDC',
      decimals: 6,
      received: '50000000',
      atPaymentRate: '10000000',
      exactPossible: true,
    };
    const preview = vi.fn().mockResolvedValue(shown);
    const request = vi.fn();
    const store = createRefundStore({ request, preview, submit: vi.fn(), get: vi.fn() });
    expect(await store.getState().preview('inv_1', { amount: '10.00', mode: 'fiat_value' })).toEqual(shown);
    expect(preview).toHaveBeenCalledWith('inv_1', { amount: '10.00', mode: 'fiat_value' });
    expect(request).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({ phase: 'idle', refund: null });

    preview.mockRejectedValueOnce(
      new QuasarSDKError('The amount exceeds what is left', 400, new Error('x'), { code: 'amount_exceeds_refundable' }),
    );
    expect(await store.getState().preview('inv_1', { amount: '999.00' })).toBeNull();
    expect(store.getState().error?.code).toBe('amount_exceeds_refundable');

    const without = createRefundStore({ request, submit: vi.fn(), get: vi.fn() });
    expect(await without.getState().preview('inv_1')).toBeNull();
    expect(without.getState().error).toBeNull();
  });

  it('forgets an earlier refusal when asked to look again, even with no way to look first', async () => {
    const refused = new QuasarSDKError('Too much', 400, new Error('x'), { code: 'amount_exceeds_refundable' });
    const store = createRefundStore({ request: vi.fn().mockRejectedValue(refused), submit: vi.fn(), get: vi.fn() });
    expect(await store.getState().start('inv_1', { amount: '999.00' })).toBe(false);
    expect(store.getState().error?.code).toBe('amount_exceeds_refundable');
    expect(await store.getState().preview('inv_1', { amount: '9.00' })).toBeNull();
    expect(store.getState().error).toBeNull();
  });

  // An app's own route cannot throw this package's class: a refusal of the engine read as "Quasar does not answer"
  it("keeps the code, the status and the words of a refusal from the app's own route", async () => {
    const refused = Object.assign(new Error('The refund that failed may still land'), {
      code: 'refund_may_have_landed',
      status: 409,
      text: 'In the language of the reader',
    });
    const store = createRefundStore({
      request: vi.fn().mockRejectedValue(refused),
      submit: vi.fn(),
      get: vi.fn(),
    });
    await store.getState().start('inv_1');
    expect(store.getState().error).toEqual({
      code: 'refund_may_have_landed',
      message: 'The refund that failed may still land',
      status: 409,
      text: 'In the language of the reader',
    });
  });

  it('reads any other failure as Quasar not answering', async () => {
    const store = createRefundStore({
      request: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
      submit: vi.fn(),
      get: vi.fn(),
    });
    await store.getState().start('inv_1');
    expect(store.getState().error).toEqual({ code: 'request_failed', message: 'Failed to fetch' });
  });

  it('keeps the refusal of the server and lets the merchant try again', async () => {
    const refusal = new QuasarSDKError('[Quasar SDK] Request Failed (409): Already used', 409, new Error('x'), {
      code: 'transaction_already_used',
    });
    const store = createRefundStore({
      request: vi.fn().mockResolvedValue(START),
      submit: vi.fn().mockRejectedValueOnce(refusal).mockResolvedValue(refund('submitted')),
      get: vi.fn().mockResolvedValue(refund('confirmed')),
    });
    await store.getState().start('inv_1');
    expect(await store.getState().submit({ txHash: '0xfeed', from: '0x9' })).toBe(false);
    expect(store.getState()).toMatchObject({
      phase: 'awaitingTransfer',
      error: { code: 'transaction_already_used', status: 409 },
    });
    store.getState().reset();
    expect(store.getState()).toMatchObject({ phase: 'idle', refund: null, error: null });
  });
});
