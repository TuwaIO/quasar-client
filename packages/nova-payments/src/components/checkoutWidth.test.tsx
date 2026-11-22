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
const { CheckoutFrame, CheckoutPageRoot } = await import('./PaymentCheckout');
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
  it.each(['inline'] as const)('%s: 760 px, never wider than its place', (display) => {
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

  it.each(['modal', 'inline'] as const)(
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

  it('page: 880 px, never wider than its place, at least the floor, and nothing scrolls inside', () => {
    const { frame, section } = checkoutWidthClasses('page');
    expect(section.split(' ')).toEqual(
      expect.arrayContaining(['novapay:w-[880px]', 'novapay:max-w-full', 'novapay:box-border']),
    );
    expect(frame).toBe('');
    ctx = fixture.checkoutContextValue({}, { display: 'page' });
    const tree = render(CheckoutFrame, { leave: null });
    const classes = fixture.elements(tree).flatMap(classesOf);
    for (const name of [
      'novapay:sm:h-[680px]',
      'novapay:overflow-hidden',
      'novapay:overflow-y-auto',
      'novapay:min-h-0',
    ]) {
      expect(classes).not.toContain(name);
    }
    expect(classesOf(tree)).toEqual(
      expect.arrayContaining(['novapay:sm:flex-row', 'novapay:sm:min-h-[calc(var(--novapay-page-floor)_-_2px)]']),
    );
  });

  it('page: the root centers the block from its floor, and the block takes the classes of the app', () => {
    const tree = CheckoutPageRoot({ label: 'Pay', className: 'mine', children: 'frame' });
    expect(classesOf(tree)).toEqual(['novapay-page']);
    const [section] = fixture.elements(tree).filter((element) => element.type === 'section');
    const classes = classesOf(section);
    expect(classes).toEqual(expect.arrayContaining(['novapay-page-block', 'mine']));
    expect(classes).not.toContain('novapay:my-8');
    expect(classes).not.toContain('novapay:overflow-hidden');
  });
});

// Owner test 2026-11-09, finding 2: "SOL · Solana Devnet · kPBj…F1DX" broke inside, the address over two lines and a
// "·" at the start of the second line
describe('the line under the amount of the QR code', () => {
  it('keeps every part in one piece, each with the "·" after it, and wraps only between them', () => {
    const quote = {
      methodId: 'sol',
      amountToSend: '84131395',
      decimals: 9,
      expiresAt: null,
      instructions: {
        family: 'solana',
        chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        symbol: 'SOL',
        to: 'kPBjHzJ7wTzQk3s1G9Uu4qBTrvjZbBY3cS4YDYq5F1DX',
        solanaPayUrl: 'solana:kPBjHzJ7wTzQk3s1G9Uu4qBTrvjZbBY3cS4YDYq5F1DX?amount=0.084131395',
      },
    };
    ctx = fixture.checkoutContextValue(
      {},
      { screen: 'qr', state: { ...fixture.checkoutContextValue({}).state, quote } as CheckoutContextValue['state'] },
    );
    const tree = fixture.elements(render(QrScreen, {}));
    const line = tree.find((element) => element.props['data-qr-line'] !== undefined);
    expect(line).toBeDefined();
    expect(classesOf(line)).toEqual(expect.arrayContaining(['novapay:flex-wrap']));
    const parts = fixture
      .elements(line!.props.children)
      .filter((element) => element.props['data-qr-part'] !== undefined);
    expect(parts).toHaveLength(3);
    for (const part of parts) expect(classesOf(part)).toContain('novapay:whitespace-nowrap');
    const text = (part: (typeof parts)[number]) =>
      ([] as unknown[])
        .concat(part.props.children)
        .filter((child) => typeof child === 'string')
        .join('');
    expect(text(parts[0])).toMatch(/^SOL\s·$/);
    expect(text(parts[1])).toMatch(/·$/);
  });
});

// Owner test 2026-11-22: an amount of ETH to 18 decimals pushed its copy button out of the card on the QR step. The row
// of an amount wraps, the amount breaks anywhere when even alone it is too wide, and the button keeps its size
describe('the amount and its copy button', () => {
  it('stay inside the card on the QR step, however long the amount', () => {
    const quote = {
      methodId: 'eth',
      amountToSend: '603408156521420',
      decimals: 18,
      expiresAt: null,
      // The price of an invoice's own address, paid by its EIP-681 request
      invoiceAddress: '0xd03a000000000000000000000000000000001ba8',
      instructions: {
        family: 'eip155',
        chainId: 'eip155:84532',
        symbol: 'ETH',
        to: '0xd03a000000000000000000000000000000001ba8',
      },
    };
    ctx = fixture.checkoutContextValue(
      {},
      {
        screen: 'qr',
        state: { ...fixture.checkoutContextValue({}).state, quote } as unknown as CheckoutContextValue['state'],
      },
    );
    const tree = fixture.elements(render(QrScreen, {}));
    const row = tree.find((element) => element.props['data-amount-row'] !== undefined);
    expect(row).toBeDefined();
    expect(classesOf(row)).toEqual(expect.arrayContaining(['novapay:flex-wrap']));
    const [amount, copy] = fixture.elements(row!.props.children);
    expect(classesOf(amount)).toEqual(expect.arrayContaining(['novapay:min-w-0', 'novapay:[overflow-wrap:anywhere]']));
    expect(classesOf(copy)).toEqual(expect.arrayContaining(['novapay:shrink-0']));
  });

  it('stay inside the card on the step of the wallet too', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./PayScreen.tsx', import.meta.url), 'utf8');
    const row = source.slice(source.indexOf('data-amount-row'), source.indexOf('labels.pay.copyAmount'));
    expect(row).toContain('novapay:flex-wrap');
    expect(row).toContain('novapay:[overflow-wrap:anywhere]');
    expect(row).toContain('novapay:shrink-0');
  });
});
