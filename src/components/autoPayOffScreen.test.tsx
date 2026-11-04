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
const { defaultLabels: en } = await import('../i18n/en');
const { PrimaryButton, SecondaryButton } = await import('./ScreenParts');
const { AutoPayOffScreen } = await import('./AutoPayOffScreen');
const { checkoutScreen } = await import('../utils/checkout');

/** The text a rendered tree shows. */
function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const children = (node as { props?: { children?: unknown; subtitle?: unknown } } | null)?.props;
  return children ? `${textOf(children.subtitle)}${textOf(children.children)}` : '';
}

const PAYER = '0x1111111111111111111111111111111111111111';
const CHAIN = 'eip155:84532';
const REVOCATION = { to: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3', data: '0x3ed01015' };

/** The screen with automatic payments on, and `address` connected. */
function screen(address: string | null, adapter: object = {}, extra: object = {}) {
  const autoCharge = {
    status: 'active',
    permission: {
      status: 'active',
      chainId: CHAIN,
      methodId: fixture.checkout.methods[0].id,
      payer: `${CHAIN}:${PAYER}`,
      periodAmount: '49000000',
      periodSeconds: 2_592_000,
    },
    revocation: REVOCATION,
  };
  const checkout = { ...fixture.checkout, autoCharge } as never;
  // Not revoked when the screen looks first, revoked once the wallet sent the transaction
  const permissionRevoked = vi.fn<() => Promise<boolean | null>>().mockResolvedValueOnce(false).mockResolvedValue(true);
  const setRevokeSent = vi.fn();
  const setAutoPayOff = vi.fn();
  const connectWallet = vi.fn(() => true);
  const connectFamily = vi.fn(() => true);
  ctx = fixture.checkoutContextValue(
    {},
    {
      checkout,
      wallet: address ? ({ address, name: 'MetaMask' } as never) : null,
      store: { getState: () => ({ permissionRevoked }) } as never,
      adapterFor: () => ({ family: 'eip155', ...adapter }) as never,
      setAutoPayOff,
      connectWallet,
      connectFamily,
      setRevokeSent,
      ...extra,
    },
  );
  const tree = render(AutoPayOffScreen, {});
  const primary = fixture.elements(tree).find((element) => element.type === PrimaryButton)!;
  const secondary = fixture.elements(tree).find((element) => element.type === SecondaryButton)!;
  return { tree, primary, secondary, permissionRevoked, setAutoPayOff, setRevokeSent, connectWallet, connectFamily };
}

afterEach(() => unmount());

describe('turning off automatic payments', () => {
  it('opens only while they are on', () => {
    const on = { status: 'active', permission: null, revocation: REVOCATION };
    const state = { phase: 'paid', checkout: { autoCharge: on } } as never;
    expect(checkoutScreen(state, { autoPayOff: true })).toBe('autoPayOff');
    expect(checkoutScreen(state, {})).toBe('paid');
    const off = { phase: 'paid', checkout: { autoCharge: { status: 'unavailable', reason: 'x' } } } as never;
    expect(checkoutScreen(off, { autoPayOff: true })).toBe('paid');
  });

  it('sends the transaction from the wallet that allowed them, then asks Quasar, which asks the chain', async () => {
    const revokePermission = vi.fn(async () => undefined);
    const { primary, permissionRevoked, setAutoPayOff } = screen(PAYER, { revokePermission });
    (primary.props.onClick as () => void)();
    await vi.waitFor(() => expect(setAutoPayOff).toHaveBeenCalledWith('done'));
    expect(revokePermission).toHaveBeenCalledWith({
      revocation: REVOCATION,
      chainId: CHAIN,
      account: PAYER,
      onSent: expect.any(Function),
    });
    expect(permissionRevoked).toHaveBeenCalledTimes(2);
  });

  it('asks the chain first: a permission already revoked costs no second transaction', async () => {
    const revokePermission = vi.fn(async () => undefined);
    const { primary, permissionRevoked, setAutoPayOff } = screen(PAYER, { revokePermission });
    permissionRevoked.mockReset();
    permissionRevoked.mockResolvedValue(true);
    (primary.props.onClick as () => void)();
    await vi.waitFor(() => expect(setAutoPayOff).toHaveBeenCalledWith('done'));
    expect(revokePermission).not.toHaveBeenCalled();
  });

  it('remembers a transaction that went out, also after leaving the screen: it is not sent again', async () => {
    const revokePermission = vi.fn(async ({ onSent }: { onSent: () => void }) => {
      onSent();
      throw new Error('timed out waiting for the receipt');
    });
    const { primary, setRevokeSent } = screen(PAYER, { revokePermission });
    (primary.props.onClick as () => void)();
    await vi.waitFor(() => expect(setRevokeSent).toHaveBeenCalledWith(true));

    // The page keeps it: the screen opened again only asks
    revokePermission.mockClear();
    const { primary: again, permissionRevoked } = screen(PAYER, { revokePermission }, { revokeSent: true });
    (again.props.onClick as () => void)();
    await vi.waitFor(() => expect(permissionRevoked).toHaveBeenCalled());
    expect(revokePermission).not.toHaveBeenCalled();
  });

  it('prompts nothing when Quasar could not be asked: the permission may have ended already', async () => {
    const revokePermission = vi.fn(async () => undefined);
    const { primary, permissionRevoked } = screen(PAYER, { revokePermission });
    permissionRevoked.mockReset();
    permissionRevoked.mockResolvedValue(null);
    (primary.props.onClick as () => void)();
    await vi.waitFor(() => expect(permissionRevoked).toHaveBeenCalled());
    await Promise.resolve();
    await Promise.resolve();
    expect(revokePermission).not.toHaveBeenCalled();
    expect(textOf(render(AutoPayOffScreen, {}))).toContain(en.error.generic);
  });

  it('never says the network does not show it yet when Quasar could not be asked', async () => {
    vi.useFakeTimers();
    try {
      const ask = async (answer: boolean | null) => {
        const { primary, permissionRevoked } = screen(PAYER, {}, { revokeSent: true });
        permissionRevoked.mockReset();
        permissionRevoked.mockResolvedValue(answer);
        (primary.props.onClick as () => void)();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(permissionRevoked).toHaveBeenCalledTimes(5);
        return textOf(render(AutoPayOffScreen, {}));
      };
      expect(await ask(false)).toContain(en.autoPayOff.notYet);
      const refused = await ask(null);
      expect(refused).not.toContain(en.autoPayOff.notYet);
      expect(refused).toContain(en.error.generic);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks another wallet to connect that one: nothing else can revoke the permission', () => {
    const revokePermission = vi.fn();
    const { tree, primary, connectWallet, connectFamily } = screen('0x2222222222222222222222222222222222222222', {
      revokePermission,
    });
    expect(primary.props.children).toBe(en.autoPayOff.connect);
    (primary.props.onClick as () => void)();
    // Only a wallet: connecting it for a method would lock a price and start a payment
    expect(connectFamily).toHaveBeenCalledWith('eip155');
    expect(connectWallet).not.toHaveBeenCalled();
    expect(revokePermission).not.toHaveBeenCalled();
    expect(textOf(tree)).toContain('0x1111');
  });

  it('goes back without touching anything', () => {
    const revokePermission = vi.fn();
    const { secondary, setAutoPayOff } = screen(PAYER, { revokePermission });
    expect(secondary.props.children).toBe(en.autoPayOff.keep);
    (secondary.props.onClick as () => void)();
    expect(setAutoPayOff).toHaveBeenCalledWith(null);
    expect(revokePermission).not.toHaveBeenCalled();
  });

  it('tells the buyer the subscription goes on, and to contact the seller to cancel it', () => {
    const { tree } = screen(PAYER);
    expect(en.autoPayOff.subtitle).toContain('contact {merchant}');
    expect(textOf(tree)).toContain(fixture.checkout.merchant.name);
  });
});

describe('what the offer of automatic payments promises', () => {
  it('never says the buyer cancels the subscription in Quasar', () => {
    expect(en.autoPay.turnOff).not.toMatch(/cancel the subscription,/i);
    expect(en.autoPay.validUntilValue).not.toMatch(/cancel/i);
    expect(en.autoPay.turnOff).toContain('contact {merchant}');
  });
});
