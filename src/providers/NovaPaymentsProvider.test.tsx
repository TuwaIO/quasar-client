import { type ReactElement, type ReactNode, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaymentsAdapter } from '../adapters/types';

// The values of the contexts above the rendered component; any other context reads its default
const contextValues = vi.hoisted(() => new Map<unknown, unknown>());
vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
  useContext: (context: { _currentValue?: unknown }) =>
    contextValues.has(context) ? contextValues.get(context) : context._currentValue,
}));

/** A Satellite store that records what is asked of it. */
type FakeStore = ReturnType<typeof fakeStore>;
const fakeStore = vi.hoisted(() => (params: unknown) => {
  const state = {
    updateParameters: vi.fn(),
    initializeAutoConnect: vi.fn(async () => undefined),
    disconnectAll: vi.fn(async () => undefined),
  };
  return { params, state, getState: () => state, setState: vi.fn(), subscribe: vi.fn() };
});
const created = vi.hoisted(() => [] as Array<ReturnType<typeof fakeStore>>);
vi.mock('@tuwaio/satellite-core', () => ({
  createSatelliteConnectStore: vi.fn((params: unknown) => {
    const store = fakeStore(params);
    created.push(store);
    return store;
  }),
}));
// Nova Connect's provider is only looked for in the tree
vi.mock('@tuwaio/nova-connect', () => ({ NovaConnectProvider: () => null }));

const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { SatelliteStoreContext } = await import('@tuwaio/satellite-react');
const { NovaConnectProviderContext } = await import('@tuwaio/nova-connect/hooks');
const { NovaConnectProvider } = await import('@tuwaio/nova-connect');
const { createSatelliteConnectStore } = await import('@tuwaio/satellite-core');
const { NovaPaymentsContext } = await import('./novaPaymentsContext');
const { NovaPaymentsProvider } = await import('./NovaPaymentsProvider');
const { OwnConnection } = await import('./OwnConnection');
const { LazyOwnConnection, loadOwnConnection } = await import('./ownConnectionLoader');
const { usePaymentsConnection } = await import('../hooks/usePaymentsConnection');

type Props = Record<string, unknown>;
type Element = ReactElement<Props>;

const adapter = (family: 'eip155' | 'solana') => ({ family }) as PaymentsAdapter;
const appAdapters = [adapter('eip155')];
const ownAdapters = [adapter('eip155'), adapter('solana')];
function Watchers() {
  return null;
}
// New Satellite adapters for every connection: Nova keeps one store per adapter for the life of the page
const own = (extra: Props = {}) =>
  ({
    adapter: [{ key: 'evm' }, { key: 'solana' }],
    watchers: <Watchers />,
    adapters: ownAdapters,
    novaConnect: { appChains: [{ id: 11155111 }], withBalance: true },
    ...extra,
  }) as never;

/** The parents the app renders above the provider. */
const appStore = { getState: () => ({}) };
const appNovaConnect = { setIsConnectModalOpen: vi.fn(), isConnectModalOpen: false };
const parents = ({ store = false, novaConnect = false }: { store?: boolean | object; novaConnect?: boolean }) => {
  contextValues.clear();
  if (store) contextValues.set(SatelliteStoreContext, store === true ? appStore : store);
  if (novaConnect) contextValues.set(NovaConnectProviderContext, appNovaConnect);
};

const provider = (props: Props) => render(NovaPaymentsProvider, { children: 'checkout', ...props } as never);
const settingsOf = (tree: unknown) => (fixture.ofType(tree, NovaPaymentsContext)[0] as Element).props.value as Props;
const ownOf = (tree: unknown) => fixture.ofType(tree, LazyOwnConnection)[0] as Element | undefined;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  // In the browser: Nova keeps its own stores only there
  vi.stubGlobal('window', {});
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  unmount();
  contextValues.clear();
  created.length = 0;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NovaPaymentsProvider', () => {
  it("uses the app's connection under its Satellite store and Nova Connect: nothing of its own", () => {
    parents({ store: true, novaConnect: true });
    const tree = provider({ adapters: appAdapters, ownConnection: own() });

    expect(createSatelliteConnectStore).not.toHaveBeenCalled();
    expect(ownOf(tree)).toBeUndefined();
    expect(fixture.ofType(tree, NovaConnectProvider)).toHaveLength(0);
    expect(fixture.ofType(tree, Watchers)).toHaveLength(0);
    expect(settingsOf(tree)).toMatchObject({ connection: 'app', adapters: appAdapters });
    expect(warn).not.toHaveBeenCalled();
  });

  it("uses the app's store without Nova Connect: connecting goes through onConnectWallet, never a second store", () => {
    parents({ store: true });
    const onConnectWallet = vi.fn();
    const tree = provider({ adapters: appAdapters, onConnectWallet, ownConnection: own() });

    expect(createSatelliteConnectStore).not.toHaveBeenCalled();
    expect(ownOf(tree)).toBeUndefined();
    expect(settingsOf(tree)).toMatchObject({ connection: 'appStore', adapters: appAdapters, onConnectWallet });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('ownConnection');
  });

  it('brings its own connection when the app has no Satellite store', () => {
    const connection = own();
    const tree = provider({ adapters: appAdapters, ownConnection: connection });

    expect(ownOf(tree)?.props.own).toBe(connection);
    expect(settingsOf(tree)).toMatchObject({ connection: 'own', adapters: ownAdapters });
    expect(warn).not.toHaveBeenCalled();
  });

  it("loads its own connection on demand, so an app that never uses it does not load Nova Connect's modals", async () => {
    const tree = provider({ ownConnection: own() });

    const boundary = fixture.ofType(tree, Suspense)[0] as Element;
    expect(boundary.props.fallback).toBeNull();
    expect(ownOf(boundary)).toBeDefined();
    await expect(loadOwnConnection()).resolves.toEqual({ default: OwnConnection });
  });

  it("keeps today's behaviour without a connection: QR codes, and the app's onConnectWallet", () => {
    const onConnectWallet = vi.fn();
    const tree = provider({ adapters: appAdapters, onConnectWallet });

    expect(createSatelliteConnectStore).not.toHaveBeenCalled();
    expect(ownOf(tree)).toBeUndefined();
    expect(settingsOf(tree)).toMatchObject({ connection: 'none', adapters: appAdapters, onConnectWallet });
  });

  it('keeps the connection it chose on its first render, and says so once in development', () => {
    const tree = provider({ ownConnection: own() });
    expect(settingsOf(tree).connection).toBe('own');

    // The app's providers appear above it later
    parents({ store: true, novaConnect: true });
    const next = provider({ ownConnection: own() });
    expect(settingsOf(next).connection).toBe('own');
    expect(ownOf(next)).toBeDefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('first render');

    provider({ ownConnection: own() });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("warns when the app's connection is used without adapters for it", () => {
    parents({ store: true, novaConnect: true });
    const tree = provider({ ownConnection: own() });

    expect(settingsOf(tree)).toMatchObject({ connection: 'app', adapters: undefined });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('adapters');
  });

  it('warns nothing outside development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    parents({ store: true });
    provider({ ownConnection: own() });
    expect(warn).not.toHaveBeenCalled();
  });

  it('resolves a provider inside the own connection of another one to the app case: one store, never two', () => {
    const outer = provider({ ownConnection: own() });
    const outerSettings = settingsOf(outer);
    unmount();
    const layer = render(OwnConnection, { ...ownOf(outer)!.props } as never);
    const store = (fixture.ofType(layer, SatelliteStoreContext)[0] as Element).props.value;
    unmount();

    // What the outer own layer gives the inner provider: its store, its Nova Connect and the outer settings
    parents({ store: store as object, novaConnect: true });
    contextValues.set(NovaPaymentsContext, outerSettings);
    const inner = provider({ ownConnection: own(), labels: { steps: { pay: 'Payment' } } });
    expect(settingsOf(inner).connection).toBe('app');
    expect(ownOf(inner)).toBeUndefined();
    expect(createSatelliteConnectStore).toHaveBeenCalledTimes(1);
    // It pays from that connection with the adapters on its wagmi config, and says nothing about missing ones
    expect(settingsOf(inner).adapters).toBe(ownAdapters);
    expect(warn).not.toHaveBeenCalled();
  });

  it('pays with the adapters of the provider above on the same connection when it has none of its own', () => {
    parents({ store: true, novaConnect: true });
    contextValues.set(NovaPaymentsContext, { connection: 'app', adapters: appAdapters });
    expect(settingsOf(provider({})).adapters).toBe(appAdapters);
    unmount();

    // Its own adapters win, and an empty list asks for QR codes only
    contextValues.set(NovaPaymentsContext, { connection: 'app', adapters: appAdapters });
    expect(settingsOf(provider({ adapters: ownAdapters })).adapters).toBe(ownAdapters);
    unmount();
    contextValues.set(NovaPaymentsContext, { connection: 'app', adapters: appAdapters });
    expect(settingsOf(provider({ adapters: [] })).adapters).toEqual([]);
  });

  it('takes no adapters from a provider above without a connection: the store between them is another one', () => {
    parents({ store: true, novaConnect: true });
    contextValues.set(NovaPaymentsContext, { connection: 'none', adapters: appAdapters });
    expect(settingsOf(provider({})).adapters).toBeUndefined();
  });
});

describe('OwnConnection', () => {
  const layer = (connection: unknown, children: ReactNode = 'checkout') =>
    render(OwnConnection, { own: connection, children } as never);

  const storeOf = (tree: unknown) => (fixture.ofType(tree, SatelliteStoreContext)[0] as Element).props.value;
  const connectModalOf = (tree: unknown) => {
    const props = (fixture.ofType(tree, NovaConnectProvider)[0] as Element).props as {
      customization?: { modals?: { connectModal?: Record<string, unknown> } };
    };
    return props.customization?.modals?.connectModal as
      { childComponents?: { rememberWallet?: Props }; classNames?: Props } | undefined;
  };

  it('creates one Satellite store that remembers no wallet, without the start-up disconnect', () => {
    const connection = own();
    const { adapter } = connection as unknown as { adapter: unknown };
    layer(connection);
    const tree = layer(connection);

    expect(createSatelliteConnectStore).toHaveBeenCalledTimes(1);
    expect(createSatelliteConnectStore).toHaveBeenCalledWith({ adapter, rememberWallet: false });
    const store = created[0];
    expect(storeOf(tree)).toBe(store);
    expect(store.state.updateParameters).toHaveBeenCalledWith({ adapter });
    expect(store.state.initializeAutoConnect).not.toHaveBeenCalled();
    expect(store.state.disconnectAll).not.toHaveBeenCalled();
    // Nothing to restore: the wallet watchers and Nova Connect do not wait for a reconnection
    expect(store.setState).toHaveBeenCalledWith({ isAutoConnectFinished: true });
  });

  it("renders the app's watchers and its own Nova Connect, never with SIWX", () => {
    const tree = layer(own({ novaConnect: { appChains: [{ id: 84532 }], siwx: { verifier: vi.fn() } } }), 'checkout');

    expect(fixture.ofType(tree, Watchers)).toHaveLength(1);
    const novaConnect = fixture.ofType(tree, NovaConnectProvider)[0] as Element;
    expect(novaConnect.props).toMatchObject({ appChains: [{ id: 84532 }], children: 'checkout' });
    expect(novaConnect.props.siwx).toBeUndefined();
  });

  it('reconnects the last wallet only with autoConnect, and remembers it with rememberWallet', () => {
    const connection = own({ autoConnect: true, rememberWallet: true });
    layer(connection);

    const store: FakeStore = created[0];
    expect(createSatelliteConnectStore).toHaveBeenCalledWith({
      adapter: (connection as unknown as { adapter: unknown }).adapter,
      rememberWallet: true,
    });
    expect(store.state.initializeAutoConnect).toHaveBeenCalledTimes(1);
    expect(store.state.initializeAutoConnect).toHaveBeenCalledWith(true);
    expect(store.setState).not.toHaveBeenCalled();
  });

  it('gives the store new Satellite adapters', () => {
    layer(own());
    const next = [{ key: 'evm' }];
    layer(own({ adapter: next }));
    expect(created[0].state.updateParameters).toHaveBeenLastCalledWith({ adapter: next });
    expect(createSatelliteConnectStore).toHaveBeenCalledTimes(1);
  });

  it('keeps its store for the life of the page: mounted again, it finds the wallet wagmi still holds', () => {
    const connection = own();
    const first = storeOf(layer(connection));
    unmount();
    // Mounted again (a checkout closed and opened again, another page), or a second provider on the same connection
    const second = storeOf(layer(connection));
    unmount();
    // A connection object written in the render, on the same module-level adapters
    const third = storeOf(layer(own({ adapter: (connection as unknown as { adapter: unknown }).adapter })));

    expect(createSatelliteConnectStore).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
    // Started once: a mount again does not restart it
    expect(created[0].setState).toHaveBeenCalledTimes(1);
  });

  it('reconnects the last wallet once per page load, not on every mount', () => {
    const connection = own({ autoConnect: true });
    layer(connection);
    unmount();
    layer(connection);

    expect(createSatelliteConnectStore).toHaveBeenCalledTimes(1);
    expect(created[0].state.initializeAutoConnect).toHaveBeenCalledTimes(1);
  });

  it('keeps no store between renders on the server', () => {
    vi.stubGlobal('window', undefined);
    const connection = own();
    layer(connection);
    unmount();
    layer(connection);

    expect(createSatelliteConnectStore).toHaveBeenCalledTimes(2);
  });

  it('hides "Remember this wallet" in its modal unless it reconnects the wallet after a load', () => {
    const classNames = { title: () => 'shop-title' };
    let tree = layer(
      own({ novaConnect: { appChains: [{ id: 1 }], customization: { modals: { connectModal: { classNames } } } } }),
    );
    expect(connectModalOf(tree)?.childComponents?.rememberWallet).toEqual({ hidden: true });
    expect(connectModalOf(tree)?.classNames).toBe(classNames);
    unmount();

    // With autoConnect the box keeps its promise: shown
    tree = layer(own({ autoConnect: true }));
    expect(connectModalOf(tree)?.childComponents?.rememberWallet?.hidden).toBeUndefined();
    unmount();

    // The app's own choice wins
    const rememberWallet = { hidden: false, classNames: { label: () => 'shop-label' } };
    tree = layer(
      own({
        novaConnect: {
          appChains: [{ id: 1 }],
          customization: { modals: { connectModal: { childComponents: { rememberWallet } } } },
        },
      }),
    );
    expect(connectModalOf(tree)?.childComponents?.rememberWallet).toBe(rememberWallet);
  });
});

describe('usePaymentsConnection', () => {
  const hook = () => render(usePaymentsConnection, {}) as string;

  it("reads the provider's choice", () => {
    contextValues.set(NovaPaymentsContext, { connection: 'own' });
    expect(hook()).toBe('own');
  });

  it("reads the app's providers without NovaPaymentsProvider", () => {
    parents({ store: true, novaConnect: true });
    expect(hook()).toBe('app');
    unmount();
    parents({ store: true });
    expect(hook()).toBe('appStore');
    unmount();
    parents({});
    expect(hook()).toBe('none');
  });
});
