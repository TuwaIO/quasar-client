import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NovaPaymentsSettings } from '../providers/novaPaymentsContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let settings: NovaPaymentsSettings = {};
vi.mock('./useNovaPayments', () => ({ useNovaPayments: () => settings }));

const { render, unmount } = await import('../testing/hookHarness');
const { defaultLabels, loadLabels } = await import('../i18n');
const { usePaymentsLabels } = await import('./usePaymentsLabels');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const renderHook = (locale: string) =>
  render(({ l }: { l: string }) => usePaymentsLabels(l), { l: locale }) as ReturnType<typeof usePaymentsLabels>;

afterEach(() => {
  unmount();
  settings = {};
});

describe('usePaymentsLabels', () => {
  it('shows English until the labels of the language load, then them', async () => {
    expect(renderHook('it').common.close).toBe(defaultLabels.common.close);
    await loadLabels('it');
    await flush();
    expect(renderHook('it').common.close).toBe('Chiudi');
  });

  it('keeps the labels shown while the next language loads', async () => {
    await loadLabels('es');
    expect(renderHook('es').common.close).toBe('Cerrar');
    expect(renderHook('ru').common.close).toBe('Cerrar');
    await loadLabels('ru');
    await flush();
    expect(renderHook('ru').common.close).toBe('Закрыть');
    expect(renderHook('en').common.close).toBe('Close');
  });

  it('applies the labels of the provider, then its transform', async () => {
    const transform = vi.fn((labels: typeof defaultLabels, context: { locale: string }) => ({
      ...labels,
      steps: { ...labels.steps, pay: `${labels.steps.pay} (${context.locale})` },
    }));
    settings = { labels: { common: { close: 'Fertig' } }, customization: { labels: { transform } } };
    const labels = renderHook('de');
    expect(labels.common.close).toBe('Fertig');
    expect(labels.steps.pay).toBe('Pay (de)');
  });
});
