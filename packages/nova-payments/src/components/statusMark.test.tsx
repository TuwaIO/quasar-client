import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutContextValue } from './checkoutContext';

vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));

let ctx: CheckoutContextValue;
vi.mock('../hooks/useCheckoutContext', () => ({
  useCheckoutContext: () => ctx,
  useOptionalCheckoutContext: () => ctx,
}));

// The look of the icon set of the app: pixel by default, classic with the Heroicons set
const { set } = vi.hoisted(() => ({ set: { look: 'pixel' as 'pixel' | 'classic' } }));
vi.mock('@tuwaio/nova-core', async (importOriginal) => {
  const novaCore = await importOriginal<typeof import('@tuwaio/nova-core')>();
  return { ...novaCore, useNovaIcons: () => ({ ...novaCore.pixelIcons, look: set.look }) };
});

const { DrawnCross, QuasarLoader } = await import('@tuwaio/nova-core');
const { TxStatusVisual } = await import('@tuwaio/nova-transactions');
const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const icons = await import('./icons');
const { StatusMark } = await import('./StatusMark');
const { MARK_CELLS } = await import('./statusMarkPixels');

type Props = Record<string, unknown>;
type Kind = Parameters<typeof StatusMark>[0]['kind'];

/** The mark of a status screen with a customization of the checkout, and the one drawing in its box. */
function mark(kind: Kind, customization: CheckoutContextValue['customization'] = {}) {
  ctx = { ...fixture.checkoutContextValue(customization), store: {} as never };
  const tree = render(StatusMark, { kind }) as ReactElement<Props>;
  const box = fixture.elements(tree).find((element) => element.type === 'span');
  return { tree, drawing: box?.props.children as ReactElement<Props> | undefined };
}

/** The squares a pixel mark is drawn with, as its own component returns them. */
const squaresOf = (drawing: ReactElement<Props>) => {
  const svg = (drawing.type as (props: Props) => ReactElement<Props>)(drawing.props);
  return { svg, squares: fixture.elements(svg.props.children).filter((element) => element.type === 'rect') };
};

afterEach(() => {
  unmount();
  set.look = 'pixel';
});

describe('the mark of a status screen', () => {
  // The wait of a payment is the loader of the whole ecosystem, in the color of a wait
  it('is the Quasar loader in the pending color while the payment is on its way', () => {
    const { drawing } = mark('waiting');
    expect(drawing?.type).toBe(QuasarLoader);
    expect(drawing?.props).toMatchObject({ size: 64, accent: 'var(--tuwa-pending-icon)' });
  });

  it('is a disc with the check mark for a paid invoice and with the cross for a failed payment, in their colors', () => {
    const paid = mark('paid').drawing as ReactElement<Props>;
    expect(paid.props).toMatchObject({ mark: 'check', moves: true });
    expect(String(paid.props.className)).toContain('novapay:text-[var(--tuwa-success-icon)]');
    unmount();
    const failed = mark('failed').drawing as ReactElement<Props>;
    expect(failed.props).toMatchObject({ mark: 'cross', moves: true });
    expect(String(failed.props.className)).toContain('novapay:text-[var(--tuwa-error-icon)]');
  });

  // Only a mark whose every pixel is a square of its own can assemble from the pixels of the loader
  it('draws the disc pixel by pixel, each a square that flies to its place', () => {
    const { svg, squares } = squaresOf(mark('paid').drawing as ReactElement<Props>);
    expect(svg.props['data-motion']).toBe('assemble');
    expect(squares).toHaveLength(MARK_CELLS.check.length);
    for (const square of squares) {
      expect(square.props['data-px']).toBe('');
      expect(Object.keys(square.props.style as object)).toEqual(
        expect.arrayContaining(['--nova-px-x', '--nova-px-y', '--nova-px-delay']),
      );
    }
  });

  it('holds still with the animations of the checkout off', () => {
    const off = { config: { animation: { disabled: true } } };
    const { svg } = squaresOf(mark('paid', off).drawing as ReactElement<Props>);
    expect(svg.props['data-motion']).toBeUndefined();
    unmount();
    expect(mark('expired', off).drawing?.props.motion).toBeUndefined();
  });

  it('keeps one box for every mark, so nothing moves when one follows another', () => {
    const boxes = (['waiting', 'paid', 'failed', 'expired', 'cancelled'] as const).map((kind) => {
      const { tree } = mark(kind);
      unmount();
      const box = fixture.elements(tree).find((element) => element.type === 'span') as ReactElement<Props>;
      return `${String(tree.props.className)} | ${String(box.props.className)}`;
    });
    expect(new Set(boxes).size).toBe(1);
    expect(boxes[0]).toContain('novapay:h-16');
  });

  it('draws the icon of each other outcome in its tone, assembling from its pixels', () => {
    const looks = {
      unconfirmed: [icons.ExclamationTriangleIcon, 'pending-icon'],
      underpaid: [icons.ExclamationTriangleIcon, 'pending-icon'],
      held: [icons.MagnifyingGlassIcon, 'info-icon'],
      refunded: [icons.ArrowUturnLeftIcon, 'info-icon'],
      expired: [icons.ClockIcon, 'text-secondary'],
      replaced: [icons.ArrowPathRoundedSquareIcon, 'info-icon'],
      blocked: [icons.NoSymbolIcon, 'error-icon'],
    } as const;
    for (const [kind, [Icon, tone]] of Object.entries(looks)) {
      const { drawing } = mark(kind as Kind);
      expect(drawing?.type, kind).toBe(Icon);
      expect(String(drawing?.props.className), kind).toContain(`--tuwa-${tone}`);
      expect(drawing?.props.motion, kind).toBe('assemble');
      unmount();
    }
    expect(mark('cancelled').drawing?.props).toMatchObject({ mark: 'cross' });
  });

  it('lets the icon of an outcome be styled or replaced', () => {
    const StatusIcon = () => null;
    const styled = { classNames: { statusIcon: ({ kind }: { kind: string }) => `icon-${kind}` } };
    expect(String(mark('expired', styled).drawing?.props.className)).toContain('icon-expired');
    unmount();
    const replaced = mark('expired', { ...styled, components: { StatusIcon } }).drawing;
    expect(replaced?.type).toBe(StatusIcon);
    expect(replaced?.props).toEqual({ kind: 'expired', className: 'icon-expired' });
  });

  it('takes the classes of `childCustomizations.statusVisual` for the wait and its result', () => {
    const statusVisual = {
      className: 'brand-status',
      iconClassNames: { icon: 'brand-icon', statusOverrides: { succeed: 'brand-paid' } },
    };
    const waiting = mark('waiting', { childCustomizations: { statusVisual } });
    expect(String(waiting.tree.props.className)).toContain('brand-status');
    expect(String(waiting.drawing?.props.className)).toContain('brand-icon');
    unmount();
    const paid = mark('paid', { childCustomizations: { statusVisual } }).drawing;
    expect(String(paid?.props.className)).toContain('brand-paid');
  });

  describe('with the classic icons of an app', () => {
    it('is the status of Nova Transactions, which draws itself in lines', () => {
      set.look = 'classic';
      const statusVisual = { className: 'brand-status', iconClassNames: { icon: 'brand-icon' } };
      ctx = { ...fixture.checkoutContextValue({ childCustomizations: { statusVisual } }), store: {} as never };
      const tree = render(StatusMark, { kind: 'paid', className: 'novapay-page-visual' }) as ReactElement<Props>;
      expect(tree.type).toBe(TxStatusVisual);
      expect(tree.props).toMatchObject({ isSucceed: true, isProcessing: false, isFailed: false });
      expect(tree.props.iconClassNames).toBe(statusVisual.iconClassNames);
      expect(String(tree.props.className)).toBe('novapay-page-visual brand-status');
    });

    it('draws no pixels: the icon of an outcome just shows, and a cancelled invoice gets the cross of Nova', () => {
      set.look = 'classic';
      expect(mark('expired').drawing?.props.motion).toBeUndefined();
      unmount();
      set.look = 'classic';
      expect(mark('cancelled').drawing?.type).toBe(DrawnCross);
    });
  });
});
