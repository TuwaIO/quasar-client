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
let accountKind: string | null = null;
vi.mock('../hooks/useAsyncValue', () => ({ useAsyncValue: () => accountKind }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { defaultLabels: en } = await import('../i18n/en');
const { formatLabel } = await import('../i18n');
const { PrimaryButton, ScreenError } = await import('./ScreenParts');
const { AutoPayScreen } = await import('./AutoPayScreen');
const { WalletPrompt } = await import('./WalletPrompt');

const ACCOUNT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const CHAIN = 'eip155:84532';
const GRANTED = { context: '0xcontext', delegationManager: '0xmanager', dependencies: [] };
const values = { wallet: 'MetaMask', network: 'Base Sepolia Testnet' };

/** A promise to settle from the test. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** The offer, with `address` connected on the network of the permission. */
function setup(adapter: object = {}, address: string | null = ACCOUNT) {
  const offer = {
    status: 'available',
    methodId: fixture.checkout.methods[0].id,
    request: {
      chainId: '0x14a34',
      to: OTHER,
      permission: {
        type: 'erc20-token-periodic',
        data: { periodAmount: '0xf4240', periodDuration: 86_400, startTime: 1, justification: 'Pro' },
      },
      rules: [],
    },
  };
  const state: { error: { code: string; reason?: string } | null } = { error: null };
  const grantPermission = vi.fn<(params: unknown, sign?: unknown) => Promise<boolean>>(async () => true);
  const clearError = vi.fn(() => {
    state.error = null;
  });
  const setAutoPay = vi.fn();
  const connectFamily = vi.fn(() => true);
  const requestPermission = vi.fn(async () => GRANTED);
  const shape = () => ({
    checkout: {
      ...fixture.checkout,
      methods: [{ ...fixture.checkout.methods[0], chainId: CHAIN }],
      autoCharge: offer,
    } as never,
    state: { phase: 'paid', error: state.error } as never,
  });
  const wallet = (at: string | null) =>
    at ? ({ address: at, name: 'MetaMask', chainId: CHAIN, walletId: 'metamask' } as never) : null;
  const mount = (at: string | null) => {
    ctx = fixture.checkoutContextValue(
      {},
      {
        ...shape(),
        wallet: wallet(at),
        store: { getState: () => ({ error: state.error, grantPermission, clearError }) } as never,
        adapterFor: () => ({ family: 'eip155', requestPermission, ...adapter }) as never,
        setAutoPay,
        connectFamily,
      },
    );
    return render(AutoPayScreen, {});
  };
  const press = (at: string | null = address) =>
    (fixture.ofType(mount(at), PrimaryButton)[0].props.onClick as () => void)();
  const errors = (at: string | null = address) =>
    fixture.ofType(mount(at), ScreenError).map((element) => element.props.children);
  const prompt = (at: string | null = address) => fixture.ofType(mount(at), WalletPrompt)[0];
  return { mount, press, errors, prompt, state, grantPermission, requestPermission, setAutoPay, connectFamily };
}

afterEach(() => {
  accountKind = null;
  unmount();
});

describe('allowing automatic payments', () => {
  it('stops waiting for a wallet that lost its request, and the buyer can ask again', async () => {
    vi.useFakeTimers();
    const { press, requestPermission, mount } = setup();
    requestPermission.mockImplementationOnce(() => new Promise<typeof GRANTED>(() => {}));
    press();
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    // Not asked twice while it waits, but a request nobody answers for this long is over
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(
      fixture.ofType(mount('0x1111111111111111111111111111111111111111'), PrimaryButton)[0].props.busy,
    ).toBeFalsy();
    press();
    await vi.advanceTimersByTimeAsync(0);
    expect(requestPermission).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('asks for the permission and hands it to Quasar', async () => {
    const { press, requestPermission, grantPermission, setAutoPay } = setup();
    press();
    await vi.waitFor(() => expect(setAutoPay).toHaveBeenCalledWith(false));
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(grantPermission).toHaveBeenCalledWith({ payer: `${CHAIN}:${ACCOUNT}`, ...GRANTED }, undefined);
  });

  // Live on MetaMask 13.55: it signs for a plain account without switching it, and Quasar refuses what could never be
  // charged. The buyer saw "Something went wrong", with the permission listed as granted in the wallet
  describe('from a plain account', () => {
    it('says first that it needs a smart account, and has the wallet switch it before the permission', async () => {
      accountKind = 'upgradable';
      const upgradeToSmartAccount = vi.fn(async () => undefined);
      const { mount, press, requestPermission, setAutoPay } = setup({ upgradeToSmartAccount });
      expect(JSON.stringify(mount(ACCOUNT))).toContain('Automatic payments need a smart account');
      press();
      await vi.waitFor(() => expect(setAutoPay).toHaveBeenCalledWith(false));
      expect(upgradeToSmartAccount).toHaveBeenCalledWith({ chainId: CHAIN, account: ACCOUNT });
      expect(upgradeToSmartAccount.mock.invocationCallOrder[0]).toBeLessThan(
        requestPermission.mock.invocationCallOrder[0],
      );
    });

    it('says nothing of it for a smart account', async () => {
      accountKind = 'smart';
      const upgradeToSmartAccount = vi.fn(async () => undefined);
      const { mount, press, setAutoPay } = setup({ upgradeToSmartAccount });
      expect(JSON.stringify(mount(ACCOUNT))).not.toContain('need a smart account');
      press();
      await vi.waitFor(() => expect(setAutoPay).toHaveBeenCalledWith(false));
      expect(upgradeToSmartAccount).not.toHaveBeenCalled();
    });

    // A Cancel leaves the upgrade open in the wallet, and each one costs the buyer a fee
    it('asks for no second switch while the first waits in the wallet', () => {
      accountKind = 'upgradable';
      const upgradeToSmartAccount = vi.fn(() => new Promise(() => undefined));
      const { press } = setup({ upgradeToSmartAccount });
      press();
      press();
      expect(upgradeToSmartAccount).toHaveBeenCalledOnce();
    });

    it('shows the switch while the wallet asks for it', () => {
      accountKind = 'upgradable';
      const { press, prompt } = setup({ upgradeToSmartAccount: () => new Promise(() => undefined) });
      press();
      expect(prompt().props).toMatchObject({
        kind: 'confirm',
        text: formatLabel(en.autoPay.smartAccountPrompt, values),
      });
    });

    it('asks for no permission when the buyer refuses the switch', async () => {
      accountKind = 'upgradable';
      const upgradeToSmartAccount = vi.fn(async () => {
        throw { code: 4001 };
      });
      const { press, errors, requestPermission } = setup({ upgradeToSmartAccount });
      press();
      await vi.waitFor(() => expect(errors()).toContain(formatLabel(en.pay.declined, values)));
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it('tells how to do it in the wallet when the wallet did not switch', async () => {
      accountKind = 'upgradable';
      const upgradeToSmartAccount = vi.fn(async () => {
        throw new Error('no code');
      });
      const { press, errors } = setup({ upgradeToSmartAccount });
      press();
      await vi.waitFor(() => expect(errors()).toContain(formatLabel(en.autoPay.smartAccountNeeded, values)));
    });

    it('tells the same when Quasar refuses a wallet that could never be charged, and asks the wallet again', async () => {
      const { press, errors, state, grantPermission, requestPermission } = setup();
      grantPermission.mockImplementationOnce(async () => {
        state.error = { code: 'permission_invalid', reason: 'wallet_unknown' };
        return false;
      });
      press();
      await vi.waitFor(() => expect(errors()).toContain(formatLabel(en.autoPay.smartAccountNeeded, values)));
      press();
      await vi.waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(2));
    });
  });

  it('says what a wallet refusal means, never "something went wrong"', async () => {
    const cases: [unknown, string][] = [
      [{ code: 4100 }, formatLabel(en.pay.notAuthorized, values)],
      [{ code: -32002 }, formatLabel(en.walletPrompt.stillWaiting, values)],
      [{ name: 'SwitchChainError' }, formatLabel(en.pay.switchFailed, values)],
      [new Error('no context'), formatLabel(en.autoPay.notGranted, values)],
    ];
    for (const [failure, text] of cases) {
      const { press, errors } = setup({
        requestPermission: async () => {
          throw failure;
        },
      });
      press();
      await vi.waitFor(() => expect(errors()).toContain(text));
      unmount();
    }
  });

  // Cancel, Allow, and approving both granted twice and sent `POST permission` twice
  it('keeps one request open in the wallet, whatever the buyer presses', async () => {
    const asked = deferred<typeof GRANTED>();
    const requestPermission = vi.fn(() => asked.promise);
    const { press, prompt, grantPermission, setAutoPay } = setup({ requestPermission });
    press();
    (prompt().props.onCancel as () => void)();
    press();
    await vi.waitFor(() => expect(prompt().props.kind).toBe('permission'));
    asked.resolve(GRANTED);
    await vi.waitFor(() => expect(setAutoPay).toHaveBeenCalledWith(false));
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(grantPermission).toHaveBeenCalledTimes(2);
  });

  it('says nothing of a refusal the wallet gives after the buyer closed the window', async () => {
    const asked = deferred<typeof GRANTED>();
    const { press, prompt, errors } = setup({ requestPermission: () => asked.promise });
    press();
    (prompt().props.onCancel as () => void)();
    asked.reject({ code: 4001 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(errors()).toEqual([]);
  });

  // The wallet had already granted it: only the free confirmation was refused
  it('does not ask for the permission again after a refused confirmation', async () => {
    const { press, errors, state, grantPermission, requestPermission } = setup();
    grantPermission.mockImplementationOnce(async () => {
      state.error = { code: 'payer_proof_declined' };
      return false;
    });
    press();
    await vi.waitFor(() => expect(errors()).toContain(formatLabel(en.payerProof.declined, values)));
    press();
    await vi.waitFor(() => expect(grantPermission).toHaveBeenCalledTimes(2));
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it('shows the confirmation while the wallet asks for it', async () => {
    const signMessage = vi.fn(() => new Promise<string>(() => undefined));
    const { press, prompt, grantPermission } = setup({ signMessage });
    grantPermission.mockImplementationOnce(async (_params, sign) => {
      await (sign as (message: string, issued: { chainId: string }) => Promise<string>)('sign me', { chainId: CHAIN });
      return true;
    });
    press();
    await vi.waitFor(() => expect(prompt()?.props.kind).toBe('proof'));
  });

  it('connects a wallet first when none is connected', () => {
    const { mount, connectFamily, requestPermission } = setup({}, null);
    const button = fixture.ofType(mount(null), PrimaryButton)[0];
    expect(button.props.children).toBe(en.pay.connect);
    (button.props.onClick as () => void)();
    expect(connectFamily).toHaveBeenCalledWith('eip155');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('forgets a refusal when another wallet is connected', async () => {
    const { mount, press, errors } = setup({
      requestPermission: async () => {
        throw { code: 4001 };
      },
    });
    press();
    await vi.waitFor(() => expect(errors()).toContain(formatLabel(en.pay.declined, values)));
    mount(OTHER);
    expect(errors(OTHER)).toEqual([]);
  });

  it('gives the offer back when the wallet is disconnected while it asks', () => {
    const { press, prompt, mount } = setup({ requestPermission: () => new Promise(() => undefined) });
    press();
    expect(prompt()).toBeDefined();
    expect(fixture.ofType(mount(null), WalletPrompt)).toEqual([]);
    expect(fixture.ofType(mount(null), PrimaryButton)[0].props.busy).toBeUndefined();
  });
});
