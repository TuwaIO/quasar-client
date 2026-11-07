import type { CheckoutPhase, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

const { render, unmount } = await import('../testing/hookHarness');
const { useAutoReturn, usePaidCallback } = await import('./useOutcomeEffects');

const invoice = { id: 'inv_1', number: 'INV-2026-42' } as CheckoutView['invoice'];

afterEach(unmount);

describe('usePaidCallback', () => {
  it('tells the app once that the invoice is paid', () => {
    const onPaid = vi.fn();
    const renderHook = (phase: CheckoutPhase) =>
      render(({ p }: { p: CheckoutPhase }) => usePaidCallback(p, invoice, onPaid), { p: phase });
    renderHook('confirming');
    expect(onPaid).not.toHaveBeenCalled();
    renderHook('paid');
    renderHook('paid');
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid).toHaveBeenCalledWith({ ...invoice, status: 'paid' });
  });

  it('calls with the status the event gave: the read of the invoice comes after it', () => {
    const onPaid = vi.fn();
    const stale = { ...invoice, status: 'processing' } as CheckoutView['invoice'];
    render(({ i }: { i: CheckoutView['invoice'] }) => usePaidCallback('paid', i, onPaid), { i: stale });
    expect(onPaid.mock.calls[0]?.[0]).toMatchObject({ status: 'paid' });
  });

  it('tells the app about each invoice the same window shows', () => {
    const onPaid = vi.fn();
    const renderHook = (i: CheckoutView['invoice']) =>
      render(({ v }: { v: CheckoutView['invoice'] }) => usePaidCallback('paid', v, onPaid), { v: i });
    renderHook(invoice);
    renderHook({ ...invoice, id: 'inv_2' });
    expect(onPaid).toHaveBeenCalledTimes(2);
  });

  it('says nothing of a link opened on an invoice already paid: it is a receipt being read', () => {
    const onPaid = vi.fn();
    render(() => usePaidCallback('paid', invoice, onPaid, true), {});
    expect(onPaid).not.toHaveBeenCalled();
  });
});

describe('useAutoReturn', () => {
  it('counts from when the reason to stay ended, not from the mount', () => {
    const navigate = vi.fn();
    const renderHook = (seconds: number, now: number) =>
      render(
        ({ s, n }: { s: number; n: number }) =>
          useAutoReturn({ url: 'https://shop.example', seconds: s, now: n, navigate }),
        { s: seconds, n: now },
      ) as ReturnType<typeof useAutoReturn>;
    expect(renderHook(0, 0).left).toBeNull();
    // The buyer read the offer for a minute, then the reason to stay ended
    renderHook(5, 60_000);
    expect(renderHook(5, 60_000).left).toBe(5);
    expect(navigate).not.toHaveBeenCalled();
    expect(renderHook(5, 62_000).left).toBe(3);
  });

  const START = 1_000_000;
  const setup = () => {
    const navigate = vi.fn();
    const renderHook = (now: number, url: string | null = 'https://acme.example/thanks', seconds = 5) =>
      render(
        ({ n, u, s }: { n: number; u: string | null; s: number }) =>
          useAutoReturn({ url: u, seconds: s, now: n, navigate }),
        { n: now, u: url, s: seconds },
      ) as ReturnType<typeof useAutoReturn>;
    return { navigate, renderHook };
  };

  it('counts down and sends the buyer back to the seller', () => {
    const { navigate, renderHook } = setup();
    expect(renderHook(START).left).toBe(5);
    expect(renderHook(START + 3_000).left).toBe(2);
    expect(navigate).not.toHaveBeenCalled();
    renderHook(START + 5_000);
    renderHook(START + 6_000);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://acme.example/thanks');
  });

  it('stays when the buyer asks, and does nothing without a return link or with zero seconds', () => {
    const { navigate, renderHook } = setup();
    renderHook(START).stay();
    expect(renderHook(START + 6_000).left).toBeNull();
    unmount();
    expect(renderHook(START, null).left).toBeNull();
    unmount();
    expect(renderHook(START, 'https://acme.example', 0).left).toBeNull();
    renderHook(START + 10_000, 'https://acme.example', 0);
    expect(navigate).not.toHaveBeenCalled();
  });
});
