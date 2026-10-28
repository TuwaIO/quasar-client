import type { ReactElement } from 'react';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Nova's own connection on a real wagmi config and a real Satellite store, mounted, unmounted and mounted again
vi.mock('react', async () => ({
  ...(await vi.importActual<object>('react')),
  ...(await import('../testing/hookHarness')).hooks,
}));
// Nova Connect's provider is only looked for in the tree
vi.mock('@tuwaio/nova-connect', () => ({ NovaConnectProvider: () => null }));

/** A storage that keeps its items in memory. */
const memoryStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
  };
};
vi.stubGlobal('window', {
  localStorage: memoryStorage(),
  sessionStorage: memoryStorage(),
  location: { protocol: 'http:', href: 'http://localhost/' },
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
});

const { connect, createConfig, createStorage, getConnection, getConnectors, http, injected, noopStorage } =
  await import('@wagmi/core');
const { sepolia } = await import('viem/chains');
const { render, unmount } = await import('../testing/hookHarness');
const fixture = await import('../testing/checkoutFixture');
const { SatelliteStoreContext } = await import('@tuwaio/satellite-react');
const { OwnConnection } = await import('./OwnConnection');

const ACCOUNT = '0x1111111111111111111111111111111111111111';

/** An injected wallet: one account, which it gives once the site asks for it. */
const wallet = { permitted: false };
const provider = {
  async request({ method }: { method: string }) {
    switch (method) {
      case 'eth_accounts':
        return wallet.permitted ? [ACCOUNT] : [];
      case 'eth_requestAccounts':
      case 'wallet_requestPermissions':
        wallet.permitted = true;
        return method === 'eth_requestAccounts' ? [ACCOUNT] : [{ parentCapability: 'eth_accounts' }];
      case 'eth_chainId':
        return `0x${sepolia.id.toString(16)}`;
      case 'wallet_revokePermissions':
        wallet.permitted = false;
        return null;
      default:
        throw Object.assign(new Error(`unsupported ${method}`), { code: 4200 });
    }
  },
  on: () => undefined,
  removeListener: () => undefined,
};

// The app's wagmi config, created once at module level, as the README shows
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected({ target: () => ({ id: 'io.metamask', name: 'MetaMask', provider: provider as never }) })],
  transports: { [sepolia.id]: http() },
  ssr: true,
  storage: createStorage({ storage: noopStorage }),
  multiInjectedProviderDiscovery: false,
});

/** The part of a Satellite EVM adapter the store's `connect` uses, on wagmi's `connect`. */
const evmAdapter = {
  key: 'evm',
  connect: async ({ connectorType }: { connectorType: string }) => {
    await connect(wagmiConfig, { connector: getConnectors(wagmiConfig)[0], chainId: sepolia.id });
    const { address, chainId: connectedChainId } = getConnection(wagmiConfig);
    return { connectorType, address, chainId: connectedChainId, isConnected: true, isContractAddress: false };
  },
  disconnect: async () => undefined,
  getConnectors: () => ({ adapter: 'evm', connectors: getConnectors(wagmiConfig) }),
};
const ownConnection = {
  adapter: [evmAdapter],
  watchers: null,
  adapters: [],
  novaConnect: { appChains: [sepolia] },
} as never;

type Store = {
  getState: () => {
    connect: (params: { connectorType: string; chainId: number }) => Promise<void>;
    activeConnection?: { address?: string };
    connectionError?: unknown;
  };
};
const mount = () => {
  const tree = render(OwnConnection, { own: ownConnection, children: null });
  return (fixture.ofType(tree, SatelliteStoreContext)[0] as ReactElement<{ value: Store }>).props.value;
};

afterAll(() => {
  unmount();
  vi.unstubAllGlobals();
});

describe('OwnConnection on a real wagmi config', () => {
  it('connects the same wallet again after it is mounted again', async () => {
    const first = mount();
    await first.getState().connect({ connectorType: 'evm:metamask', chainId: sepolia.id });
    expect(first.getState().connectionError).toBeUndefined();
    expect(first.getState().activeConnection?.address).toBe(ACCOUNT);

    // The checkout closes (nothing disconnects: wagmi keeps the wallet) and opens again
    unmount();
    const second = mount();
    expect(getConnection(wagmiConfig).status).toBe('connected');
    expect(second.getState().activeConnection?.address).toBe(ACCOUNT);

    await second.getState().connect({ connectorType: 'evm:metamask', chainId: sepolia.id });
    expect(second.getState().connectionError).toBeUndefined();
    expect(second.getState().activeConnection?.address).toBe(ACCOUNT);
  });
});
