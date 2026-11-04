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
    expect(onPaid).toHaveBeenCalledWith(invoice);
  });
});

describe('useAutoReturn', () => {
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
