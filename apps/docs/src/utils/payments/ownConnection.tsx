import { EVMConnectorsWatcher } from '@tuwaio/nova-connect/evm';
import { SolanaConnectorsWatcher } from '@tuwaio/nova-connect/solana';
import type { NovaPaymentsOwnConnection } from '@tuwaio/nova-payments';
import { paymentsEVMAdapter } from '@tuwaio/nova-payments/evm';
import { paymentsSolanaAdapter } from '@tuwaio/nova-payments/solana';
import { createDefaultTransports, satelliteEVMAdapter } from '@tuwaio/satellite-evm';
import { satelliteSolanaAdapter } from '@tuwaio/satellite-solana';
import { createConfig, createStorage, injected, noopStorage } from '@wagmi/core';
import { baseSepolia, type Chain, sepolia } from 'viem/chains';

/** The networks of Nova's own connection in the stories. */
const chains = [sepolia, baseSepolia] as readonly [Chain, ...Chain[]];
const solanaRPCUrls = { devnet: 'https://api.devnet.solana.com' };

// The wagmi config of Nova's own connection: wagmi keeps nothing in the browser (a storage that saves nothing, so the
// installed EIP-6963 wallets are still listed); Satellite keeps the wallet until the tab closes
const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports: createDefaultTransports(chains),
  ssr: true,
  storage: createStorage({ storage: noopStorage }),
});

/**
 * Nova's own wallet connection for the stories (`ownConnection` of `NovaPaymentsProvider`), created once: Sepolia and
 * Base Sepolia through the browser's wallet, and Solana devnet. "Connect wallet" opens the real Nova Connect modal.
 */
export const STORY_OWN_CONNECTION: NovaPaymentsOwnConnection = {
  adapter: [satelliteEVMAdapter(wagmiConfig, chains), satelliteSolanaAdapter({ rpcUrls: solanaRPCUrls })],
  watchers: (
    <>
      <EVMConnectorsWatcher wagmiConfig={wagmiConfig} />
      <SolanaConnectorsWatcher />
    </>
  ),
  adapters: [paymentsEVMAdapter(wagmiConfig), paymentsSolanaAdapter({ rpcUrls: solanaRPCUrls })],
  novaConnect: {
    appChains: chains,
    solanaRPCUrls,
    withBalance: true,
    withChain: true,
    legal: { termsUrl: 'https://example.com/terms', privacyUrl: 'https://example.com/privacy' },
  },
};
