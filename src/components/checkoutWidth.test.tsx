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

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { CheckoutFrame } = await import('./PaymentCheckout');
const { checkoutWidthClasses } = await import('./classes');
const { QrScreen } = await import('./QrScreen');

const classesOf = (element: unknown) =>
  String((element as ReactElement<{ className?: string }>).props.className ?? '').split(' ');

/** The classes of the checkout frame shown as `display`. */
function frameClasses(display: CheckoutContextValue['display']) {
  ctx = fixture.checkoutContextValue({}, { display });
  return classesOf(render(CheckoutFrame, { leave: null }));
}

afterEach(() => unmount());

// Showcase review, 2026-10-29: on a 768 px window with page padding the inline checkout kept 760 px and overflowed
describe('the width of the checkout', () => {
  it.each(['inline', 'page'] as const)('%s: 760 px, never wider than its place', (display) => {
    const { frame, section } = checkoutWidthClasses(display);
    // Not `w-full`: in a parent as wide as its content (a centered flex box) it would follow the content of each step
    expect(section.split(' ')).toEqual(
      expect.arrayContaining(['novapay:w-[760px]', 'novapay:max-w-full', 'novapay:box-border']),
    );
    expect(section).not.toMatch(/sm:w-/);
    expect(frame).toBe('');
    // The frame fills the block
    const classes = frameClasses(display);
    expect(classes).toContain('novapay:w-full');
    expect(classes.filter((name) => /(^|:)w-\[/.test(name))).toEqual([]);
  });

  it('modal: 760 px from 640 px, but never wider than the window with the dialog padding', () => {
    const { frame, section } = checkoutWidthClasses('modal');
    expect(section).toBe('');
    expect(frame).toBe('novapay:sm:w-[min(760px,calc(100vw_-_2rem_-_2px))]');
    expect(frameClasses('modal')).toEqual(
      expect.arrayContaining(['novapay:w-full', 'novapay:sm:w-[min(760px,calc(100vw_-_2rem_-_2px))]']),
    );
  });

  it.each(['modal', 'inline', 'page'] as const)(
    '%s: keeps the two panes and the 680 px height from 640 px, one column below',
    (display) => {
      expect(frameClasses(display)).toEqual(
        expect.arrayContaining(['novapay:flex-col', 'novapay:sm:flex-row', 'novapay:sm:h-[680px]']),
      );
    },
  );
});

// At 640 px of window the screen area of the two panes is 320 px wide: the Solana Pay code and its facts side by side
// squeezed the facts to a column of a few words. They go side by side only when the screen area itself has the room
describe('the Solana Pay step in a narrow screen area', () => {
  it('puts the code and its facts side by side by the width of the screen area, not of the window', () => {
    ctx = fixture.checkoutContextValue({}, { display: 'inline', screen: 'method' });
    const frame = render(CheckoutFrame, { leave: null });
    const area = fixture.elements(frame).find((element) => 'data-novapay-scroll' in element.props);
    expect(classesOf(area)).toContain('novapay:@container');

    const quote = {
      methodId: 'sol',
      amountToSend: '1000000',
      decimals: 6,
      expiresAt: null,
      instructions: {
        family: 'solana',
        chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        symbol: 'USDC',
        to: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
        solanaPayUrl: 'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?amount=1',
      },
    };
    ctx = fixture.checkoutContextValue(
      {},
      { screen: 'qr', state: { ...fixture.checkoutContextValue({}).state, quote } as CheckoutContextValue['state'] },
    );
    const classes = fixture.elements(render(QrScreen, {})).flatMap(classesOf);
    expect(classes).toEqual(
      expect.arrayContaining(['novapay:@min-[440px]:flex-row', 'novapay:@min-[440px]:self-auto']),
    );
    expect(classes.filter((name) => name.startsWith('novapay:sm:'))).toEqual([]);
  });
});
