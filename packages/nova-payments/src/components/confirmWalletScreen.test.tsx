import type { CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PayerProofFlow } from '../hooks/usePayerProof';
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
let flow: PayerProofFlow;
vi.mock('../hooks/usePayerProof', () => ({ usePayerProof: () => flow }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { defaultLabels } = await import('../i18n');
const { PrimaryButton, ScreenContent, SecondaryButton, ScreenError } = await import('./ScreenParts');
const { WalletPrompt } = await import('./WalletPrompt');
const { ConfirmWalletScreen } = await import('./ConfirmWalletScreen');

type Props = Record<string, unknown>;
const BASE = 'eip155:8453';
const PAYER = '0x1111111111111111111111111111111111111111';

/** The text of the rendered tree. */
const textOf = (node: unknown): string =>
  fixture
    .elements(node)
    .flatMap((element) => [element.props.children].flat())
    .filter((child): child is string => typeof child === 'string')
    .join(' ');

/** The step for MetaMask on Base, USDC on Base chosen, the wallet asked to confirm the invoice. */
function step(
  options: {
    flow?: Partial<PayerProofFlow>;
    payerProof?: string;
    phase?: string;
    error?: { code: string; message: string; reason?: string } | null;
    connectorType?: string;
    walletChainId?: string;
    confirmedWallets?: string[];
    storePayer?: string;
  } = {},
) {
  flow = {
    step: 'idle',
    problem: null,
    request: null,
    confirm: vi.fn(async () => true),
    dismiss: vi.fn(),
    ...options.flow,
  };
  const checkout = {
    ...fixture.checkout,
    invoice: { ...fixture.checkout.invoice, number: 'INV-1', totalMinor: '8954', currency: 'USD' },
  } as CheckoutView;
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      screen: 'confirmWallet',
      now: Date.now(),
      state: {
        phase: options.phase ?? 'selectMethod',
        checkout,
        methodId: 'usdc-base',
        payer: options.storePayer ?? `${BASE}:${PAYER}`,
        payerProof: options.payerProof ?? 'required',
        confirmedWallets: options.confirmedWallets ?? [],
        quote: null,
        error: options.error ?? null,
      } as never,
      wallet: {
        family: 'eip155',
        address: PAYER,
        chainId: options.walletChainId ?? BASE,
        name: options.connectorType === 'evm:coinbase' ? 'Coinbase Wallet' : 'MetaMask',
        walletId: 'metamask',
        connectorType: options.connectorType ?? 'evm:metamask',
      } as never,
      setConfirmWallet: vi.fn(),
    },
  );
  const tree = render(ConfirmWalletScreen, {});
  const button = fixture.ofType(tree, PrimaryButton)[0] as ReactElement<Props>;
  return { tree, button, text: textOf(tree) };
}

afterEach(() => unmount());

// A free signature before an EVM payment the buyer's wallet sends, right after the wallet and the
// method, before the price; one per invoice and wallet
describe('the step that confirms the paying wallet', () => {
  it('says what it is in one sentence, and what the wallet signs: invoice, seller, amount and wallet', () => {
    const { text, tree } = step();
    const content = fixture.ofType(tree, ScreenContent)[0] as ReactElement<Props>;
    expect(content.props.title).toBe('Confirm your wallet');
    expect(content.props.subtitle).toBe('Confirm this wallet — it is free and moves no money.');
    expect(text).toContain('INV-1');
    expect(text).toContain('Cosmos');
    expect(text).toContain('89.54 USD');
    expect(fixture.elements(tree).some((element) => element.props.hash === PAYER)).toBe(true);
  });

  it("opens the wallet's signature request from its main button, and goes back to the methods", () => {
    const { tree, button } = step();
    expect(button.props.children).toBe('Confirm in MetaMask');
    (button.props.onClick as () => void)();
    expect(flow.confirm).toHaveBeenCalledWith({ quote: true });
    const back = fixture.ofType(tree, SecondaryButton)[0] as ReactElement<Props>;
    expect(back.props.children).toBe(defaultLabels.pay.back);
    (back.props.onClick as () => void)();
    expect(ctx.setConfirmWallet).toHaveBeenCalledWith(false);
  });

  it('shows the prompt of the wallet over the step while it signs, with the site and the invoice to check', () => {
    const { tree } = step({
      flow: {
        step: 'signing',
        request: { domain: 'shop.example' } as PayerProofFlow['request'],
      },
      payerProof: 'confirming',
    });
    const prompt = fixture.ofType(tree, WalletPrompt)[0] as ReactElement<Props>;
    expect(prompt.props.kind).toBe('proof');
    const details = prompt.props.details as { name: string; value: string }[];
    expect(details).toContainEqual({ name: defaultLabels.payerProof.site, value: 'shop.example' });
    expect(details).toContainEqual({ name: defaultLabels.payerProof.invoice, value: 'INV-1' });
    expect(prompt.props.text).toBe(
      'Sign the message that confirms this wallet pays invoice INV-1 of Cosmos. It is free and moves no money.',
    );
    // The step leaves the layout while the wallet asks: the window takes its place, never both on the screen
    const hidden = fixture.elements(tree).find((element) => element.props.inert === true) as ReactElement<{
      className: string;
    }>;
    expect(hidden.props.className).toContain('novapay:hidden');
    (prompt.props.onCancel as () => void)();
    expect(flow.dismiss).toHaveBeenCalled();
  });

  // The buyer signed with another wallet, and may not want to sign again
  it('opens clean: an error about something else stays out of it', () => {
    const { tree } = step({ error: { code: 'payment_mismatch', message: 'raw' } });
    expect(fixture.ofType(tree, ScreenError)).toEqual([]);
  });

  it('shows the failure of its own requests', () => {
    const { tree } = step({ error: { code: 'rate_limited', message: 'raw' } });
    expect(fixture.ofType(tree, ScreenError)[0].props.children).toBe(defaultLabels.method.rateLimited);
  });

  // The price is on its way: going back was undone a moment later by the pay step
  it('does not go back while the price is being locked', () => {
    const { tree } = step({ phase: 'quoting', payerProof: 'confirmed' });
    expect(fixture.ofType(tree, SecondaryButton)[0].props.disabled).toBe(true);
  });

  it('shows where the wallet is, and that it is asked to switch', () => {
    const { tree } = step({ walletChainId: 'eip155:1' });
    const text = JSON.stringify(tree);
    expect(text).toContain('Ethereum');
    expect(text).toContain('it first asks to switch');
  });

  it('names a wallet that already confirmed the invoice, to switch to it', () => {
    const other = '0x2222222222222222222222222222222222222222';
    const { text } = step({ confirmedWallets: [`${BASE}:${PAYER}`, `${BASE}:${other}`] });
    expect(text).toContain('Already confirmed for this invoice: 0x2222…2222.');
  });

  it('names nothing when only this wallet is known, or none', () => {
    expect(step({ confirmedWallets: [`${BASE}:${PAYER}`] }).text).not.toContain('Already confirmed');
    expect(step().text).not.toContain('Already confirmed');
  });

  it('asks for the wallet connected, also when the store still holds another one', () => {
    const { button } = step({ storePayer: `${BASE}:0x2222222222222222222222222222222222222222` });
    (button.props.onClick as () => void)();
    expect(vi.mocked(ctx.store.getState().setPayer)).toHaveBeenCalledWith(`${BASE}:${PAYER}`);
    expect(flow.confirm).toHaveBeenCalledWith({ quote: true });
  });

  it('leaves no refusal behind when the buyer goes back', () => {
    const { tree } = step({ error: { code: 'payer_proof_declined', message: '' } });
    const back = fixture.ofType(tree, SecondaryButton)[0] as ReactElement<Props>;
    (back.props.onClick as () => void)();
    expect(ctx.setConfirmWallet).toHaveBeenCalledWith(false);
    expect(vi.mocked(ctx.store.getState().clearError)).toHaveBeenCalled();
  });

  it('asks for the passkey of a smart wallet', () => {
    const { text, tree } = step({ connectorType: 'evm:coinbase', flow: { step: 'signing' } });
    expect(text).toContain('Coinbase Wallet may ask for your passkey or fingerprint to sign.');
    const prompt = fixture.ofType(tree, WalletPrompt)[0] as ReactElement<Props>;
    expect(prompt.props.text).toMatch(/^Confirm with your passkey in Coinbase Wallet\./);
  });

  it('shows the network switch first when the wallet is on another network', () => {
    const { tree } = step({ flow: { step: 'switching' } });
    expect((fixture.ofType(tree, WalletPrompt)[0] as ReactElement<Props>).props.kind).toBe('switch');
  });

  it('stays on the step after a refusal, with the reason and the same button to try again', () => {
    const { tree, button } = step({
      flow: { problem: 'declined' },
      error: { code: 'payer_proof_declined', message: '' },
    });
    const errors = fixture.ofType(tree, ScreenError) as ReactElement<Props>[];
    expect(errors.map((error) => error.props.children)).toEqual([
      'You declined the signature in MetaMask. It is free and moves no money: sign it to pay from this wallet, or choose another wallet or method.',
    ]);
    expect(button.props.children).toBe('Confirm in MetaMask');
    expect(button.props.busy).toBe(false);
  });

  it("explains Quasar's refusal of a signature", () => {
    const { tree } = step({ error: { code: 'payer_proof_unavailable', message: '', reason: 'rpc_failed' } });
    expect((fixture.ofType(tree, ScreenError)[0] as ReactElement<Props>).props.children).toBe(
      defaultLabels.payerProof.unavailable,
    );
  });

  it('keeps the button busy while the wallet signs and while the price is locked after it', () => {
    expect(step({ payerProof: 'confirming', flow: { step: 'signing' } }).button.props.busy).toBe(true);
    const quoting = step({ payerProof: 'confirmed', phase: 'quoting' });
    expect(quoting.button.props.busy).toBe(true);
    expect(quoting.button.props.children).toBe(defaultLabels.method.quoting);
  });

  it('lets the buyer confirm again once the wallet window is closed: signing again moves no money', () => {
    // The wallet never answered the first request; the store still waits for it
    const { button } = step({ payerProof: 'confirming' });
    expect(button.props.busy).toBe(false);
    expect(button.props.children).toBe('Confirm in MetaMask');
    (button.props.onClick as () => void)();
    expect(flow.confirm).toHaveBeenCalledWith({ quote: true });
  });

  it('offers "Try again" in the wallet window, and says the wallet may call it a sign-in request', () => {
    const { tree } = step({
      flow: { step: 'signing', request: { domain: 'shop.example' } as PayerProofFlow['request'] },
      payerProof: 'confirming',
    });
    const prompt = fixture.ofType(tree, WalletPrompt)[0] as ReactElement<Props>;
    (prompt.props.onRetry as () => void)();
    expect(flow.confirm).toHaveBeenCalledWith({ quote: true });
    expect(prompt.props.hint).toBe('MetaMask may show it as a sign-in request for shop.example.');
  });

  it('says that a smart wallet confirms again on another network', () => {
    const { text } = step({ connectorType: 'evm:coinbase' });
    expect(text).toContain(defaultLabels.payerProof.noteSmart);
    expect(text).not.toContain(defaultLabels.payerProof.note);
  });

  it('explains a refusal on an underpaid invoice too, where a new wallet pays the rest', () => {
    const { tree } = step({ phase: 'underpaid', error: { code: 'payer_proof_invalid', message: '' } });
    expect((fixture.ofType(tree, ScreenError)[0] as ReactElement<Props>).props.children).toBe(
      defaultLabels.payerProof.invalid,
    );
  });
});
