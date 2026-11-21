import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NovaPaymentsSettings } from '../providers/novaPaymentsContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let settings: NovaPaymentsSettings = {};
vi.mock('./useNovaPayments', () => ({ useNovaPayments: () => settings }));

const { render, unmount } = await import('../testing/hookHarness');
const { useConnectionLocale } = await import('./useConnectionLocale');

const renderHook = (locale: string | null) =>
  render(({ l }: { l: string | null }) => useConnectionLocale(l), { l: locale });

afterEach(() => {
  unmount();
  settings = {};
});

// Nova's own connect modal spoke English on a Ukrainian checkout: "Connect Wallet", "BACK", "I don't have a wallet"
describe('useConnectionLocale', () => {
  it("tells Nova's own connection the language of the checkout shown, and the next one it switches to", () => {
    const setCheckoutLocale = vi.fn();
    settings = { setCheckoutLocale };
    renderHook('uk');
    expect(setCheckoutLocale).toHaveBeenLastCalledWith('uk');
    renderHook('uk');
    expect(setCheckoutLocale).toHaveBeenCalledTimes(1);
    renderHook('zh-CN');
    expect(setCheckoutLocale).toHaveBeenLastCalledWith('zh-CN');
  });

  it('tells nothing while the language is not known or the checkout is hidden', () => {
    const setCheckoutLocale = vi.fn();
    settings = { setCheckoutLocale };
    renderHook(null);
    expect(setCheckoutLocale).not.toHaveBeenCalled();
  });

  it("does nothing without Nova's own connection", () => {
    expect(() => renderHook('uk')).not.toThrow();
  });
});
