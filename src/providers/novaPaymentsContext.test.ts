import { describe, expect, it, vi } from 'vitest';

describe('NovaPaymentsContext', () => {
  it('is one context for every copy of the package', async () => {
    const first = await import('./novaPaymentsContext');
    vi.resetModules();
    const second = await import('./novaPaymentsContext');

    expect(second).not.toBe(first);
    expect(second.NovaPaymentsContext).toBe(first.NovaPaymentsContext);
    const shared = (globalThis as unknown as Record<symbol, unknown>)[Symbol.for('tuwaio.nova-payments.context')];
    expect(shared).toBe(first.NovaPaymentsContext);
  });
});
