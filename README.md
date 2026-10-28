# @tuwaio/nova-payments

[![NPM Version](https://img.shields.io/npm/v/@tuwaio/nova-payments.svg)](https://www.npmjs.com/package/@tuwaio/nova-payments)
[![License](https://img.shields.io/npm/l/@tuwaio/nova-payments.svg)](https://github.com/TuwaIO/nova-uikit/blob/main/packages/nova-payments/LICENSE)

`@tuwaio/nova-payments` is the payments Layer 7 (L7) package of **Nova UI Kit**, the user interface project of TUWA Stage 4 ("User Interface"). It renders the checkout of a [Quasar Payments](https://docs.tuwa.io/quasar) invoice from its checkout token: the order with its lines, tax and deadline, the steps of the payment and its outcome, in a modal (a sheet from the bottom on a phone), in the page, or on a page of its own. It keeps no payment state of its own: the checkout store of [`@tuwaio/quasar-sdk/checkout`](https://docs.tuwa.io/quasar) reads the invoice and follows it, and no secret key reaches the browser.

> [!NOTE]
> The package is in development: native speakers review the translations of the checkout before the stable release.

---

## 💾 Installation

```bash
pnpm add @tuwaio/nova-payments @tuwaio/quasar-sdk @tuwaio/nova-core @tuwaio/nova-connect @tuwaio/nova-transactions @tuwaio/satellite-react @tuwaio/satellite-core @tuwaio/pulsar-core @tuwaio/orbit-core zustand react framer-motion @heroicons/react @radix-ui/react-dialog @web3icons/react @web3icons/common clsx tailwind-merge
```

The checkout connects wallets through Nova Connect (`NovaConnectProvider` of `@tuwaio/nova-connect`, with its own peers): the app's, or Nova's own when the app has no wallet connection (see "Wallet connection" below). Apps that connect wallets differently pass `onConnectWallet`, and without either the buyer pays with a QR code.

Import the stylesheets of `@tuwaio/nova-core` (theme variables), of `@tuwaio/nova-transactions` (the confirm and paid steps reuse its progress) and of this package (Tailwind CSS v4 utilities prefixed with `novapay:`):

```css
@import '@tuwaio/nova-core/dist/index.css';
@import '@tuwaio/nova-transactions/dist/index.css';
@import '@tuwaio/nova-payments/dist/index.css';
```

With Nova's own connection, also import `@tuwaio/nova-connect/dist/index.css` for its connect modal.

---

## 🚀 Usage

Issue the invoice on your server with `@tuwaio/quasar-sdk` and pass its `checkoutToken` to the checkout:

```tsx
'use client';

import { PaymentCheckout } from '@tuwaio/nova-payments';
import { useState } from 'react';

export function Checkout({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Pay
      </button>
      <PaymentCheckout token={token} open={open} onOpenChange={setOpen} />
    </>
  );
}
```

`display="inline"` renders it in the page and `display="page"` centers it, as the Quasar payment page does. `NovaPaymentsProvider` sets the Quasar API for a Community Edition node (`baseUrl`) and replaces labels.

To pay from a wallet in the browser, give the provider the chain adapters of your app (`@tuwaio/nova-payments/evm` needs `@wagmi/core` and `viem`; `@tuwaio/nova-payments/solana` needs `@solana/kit`, `@solana-program/system`, `@solana-program/token` and `@tuwaio/orbit-solana`) and, optionally, your Pulsar store: a payment the wallet sends after the buyer closed the checkout goes to it, and Nova Transactions shows its toast.

```tsx
'use client';

import { NovaPaymentsProvider } from '@tuwaio/nova-payments';
import { paymentsEVMAdapter } from '@tuwaio/nova-payments/evm';
import { paymentsSolanaAdapter } from '@tuwaio/nova-payments/solana';
import type { Transaction } from '@tuwaio/pulsar-core';
import type { Config } from '@wagmi/core';
import type { ReactNode } from 'react';

export function Payments({
  wagmiConfig,
  injectExternalPendingTxs,
  children,
}: {
  wagmiConfig: Config;
  injectExternalPendingTxs: (transactions: Transaction[]) => Promise<void>;
  children: ReactNode;
}) {
  return (
    <NovaPaymentsProvider
      adapters={[
        paymentsEVMAdapter(wagmiConfig),
        paymentsSolanaAdapter({ rpcUrls: { devnet: 'https://api.devnet.solana.com' } }),
      ]}
      pulsar={{ injectExternalPendingTxs }}
    >
      {children}
    </NovaPaymentsProvider>
  );
}
```

### Wallet connection: the app's or Nova's own

Nova Payments brings its own wallet connection only when the app has none. `NovaPaymentsProvider` decides once, on its first render, and `usePaymentsConnection` tells which:

| Above `NovaPaymentsProvider`                                   | Wallet, network and connect modal                                                             | Payment adapters         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------ |
| The app's `SatelliteConnectProvider` and `NovaConnectProvider` | The app's (`app`), with its SIWX; Nova mounts nothing of its own                              | `adapters`               |
| The app's `SatelliteConnectProvider` only                      | The app's wallet (`appStore`); "Connect wallet" calls `onConnectWallet`; never a second store | `adapters`               |
| Nothing, and `ownConnection` is given                          | Nova's own (`own`): a Satellite store, the watchers and a Nova Connect modal, never with SIWX | `ownConnection.adapters` |
| Nothing                                                        | None (`none`): QR codes, and `onConnectWallet`                                                | `adapters`               |

Inside an app with Satellite Connect and Nova Connect, add only `NovaPaymentsProvider` with `adapters` on the wagmi config of the app's Satellite EVM adapter (as above): the checkout and the refunds show the app's wallet, "Connect wallet" opens the app's modal, and a payment on another network switches that wallet. If the app signs in with SIWX through Nova Connect, set `siwx.sessionScope: 'account'` there when its server binds a session to the address only, so a network switch made by the checkout does not ask the wallet to sign in again (see [`@tuwaio/nova-connect`](https://stories.tuwa.io/?path=/docs/packages-nova-connect-overview--docs)). A `NovaPaymentsProvider` inside another one's own connection uses that connection, so two stores never stack, and without `adapters` it pays with those of the provider above.

A page without a wallet connection (a payment page, an admin page) gives `ownConnection`, created once at module level. Nova's store runs Satellite's start-up only with `autoConnect`, so it never drops the wallet of another tab or of the host page. It lives as long as the page, one per Satellite adapter, as the wagmi config does: a checkout closed and opened again, another page or a second provider on the same adapters shows the wallet still connected. `autoConnect: true` reconnects the last wallet once per page load, with Satellite's start-up (with `@tuwaio/satellite-core` 0.11.1 or later, without a permission prompt and without disconnecting wallets this page did not connect; earlier versions disconnect every wallet of the adapters first); without it, the connect modal hides "Remember this wallet", since nothing would reconnect the wallet. Nova's own connection and its Nova Connect modal load on demand, so an app that does not use them does not download them.

```tsx
'use client';

import { EVMConnectorsWatcher } from '@tuwaio/nova-connect/evm';
import { SolanaConnectorsWatcher } from '@tuwaio/nova-connect/solana';
import { type NovaPaymentsOwnConnection, NovaPaymentsProvider, PaymentCheckout } from '@tuwaio/nova-payments';
import { paymentsEVMAdapter } from '@tuwaio/nova-payments/evm';
import { paymentsSolanaAdapter } from '@tuwaio/nova-payments/solana';
import { createDefaultTransports, satelliteEVMAdapter } from '@tuwaio/satellite-evm';
import { satelliteSolanaAdapter } from '@tuwaio/satellite-solana';
import { createConfig, createStorage, injected, noopStorage } from '@wagmi/core';
import { base, type Chain, mainnet } from 'viem/chains';

const chains = [mainnet, base] as readonly [Chain, ...Chain[]];
const solanaRPCUrls = { mainnet: 'https://api.mainnet-beta.solana.com' };
const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports: createDefaultTransports(chains),
  ssr: true,
  storage: createStorage({ storage: noopStorage }),
});

const ownConnection: NovaPaymentsOwnConnection = {
  adapter: [satelliteEVMAdapter(wagmiConfig, chains), satelliteSolanaAdapter({ rpcUrls: solanaRPCUrls })],
  watchers: (
    <>
      <EVMConnectorsWatcher wagmiConfig={wagmiConfig} />
      <SolanaConnectorsWatcher />
    </>
  ),
  adapters: [paymentsEVMAdapter(wagmiConfig), paymentsSolanaAdapter({ rpcUrls: solanaRPCUrls })],
  novaConnect: { appChains: chains, solanaRPCUrls, withBalance: true, withChain: true },
};

export function PayPage({ token }: { token: string }) {
  return (
    <NovaPaymentsProvider ownConnection={ownConnection}>
      <PaymentCheckout token={token} display="page" />
    </NovaPaymentsProvider>
  );
}
```

The full integration with Satellite Connect, SIWX and Pulsar is in the **[Full-Stack React guide](https://docs.tuwa.io/guides/full-stack-react)**.

After the payment the checkout shows its outcome: confirming, paid with the receipt and the way back to the invoice's `successUrl` (a visible countdown with "Stay here"; `autoReturnSeconds`, `0` for none), and for a subscription the optional automatic payments (ERC-7715). Underpaid, held, refunded, expired, cancelled and corrected invoices get their own outcome with a "Contact" link to the seller (`onContact` replaces it). `onPaid` tells the page once the invoice is paid; fulfil orders from the `invoice.paid` webhook on your server. Closing the checkout before anything is sent asks first.

### Customization

Besides the `--tuwa-*` theme variables of `@tuwaio/nova-core` and the labels, `customization` of `PaymentCheckout` adds classes to its parts from the state of the checkout (`classNames`) and replaces parts (`components`): the header, the order, the steps, the token and network options, the main button, the QR code, the outcome icon, or whole screens by name. A replacement reads the checkout with `useCheckoutContext`. Classes are added after the default ones; change a color a part already sets with the theme variables or by replacing the part. `handlers` wrap the actions of the buyer (`onMethodSelect`, `onQuote`, `onSubmit`, `onLocaleChange`: call `proceed()` to go on, or do something else) and tell what happened (`onStatusChange`, `onError`, `onExpire`); `config` turns off animations, the steps or the balance check and sets the minutes of the deadline announcements; `childCustomizations` styles the Nova Transactions parts of the confirm and paid steps.

```tsx
'use client';

import { type CheckoutPrimaryButtonProps, PaymentCheckout } from '@tuwaio/nova-payments';

function ShopButton({ busy, children, className, ...props }: CheckoutPrimaryButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`shop-button ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function BrandedCheckout({ token }: { token: string }) {
  return (
    <PaymentCheckout
      token={token}
      display="inline"
      customization={{
        classNames: { tokenOption: ({ selected }) => (selected ? 'shop-selected' : undefined) },
        components: { PrimaryButton: ShopButton },
      }}
    />
  );
}
```

### Refunds

`RefundButton` refunds a paid invoice from the merchant's connected wallet: what to refund (an amount of the invoice currency or everything received), a wallet of the payment's network, the confirmation with the wallet's balance and the network fee, the wallet's prompt, then Quasar follows the transaction and issues the credit note. It takes a refund store of `@tuwaio/quasar-sdk/checkout` whose three calls run on your server with the secret key (Server Actions calling `quasar.payments.refund`, `submitRefund` and `getRefund`). Put it inside `NovaPaymentsProvider`: it uses the provider's wallet connection (the app's, or Nova's own) and its adapters; without Nova Connect, `onConnectWallet` connects the wallet. A wallet on another network is asked to switch first; one that holds too little is asked nothing; a refund the wallet sent but Quasar did not take is handed over again, never sent twice. `RefundDialog` is the same window opened by your own button, `params` skips the amount step, and `onRecord` offers your form for a refund sent another way.

```tsx
'use client';

import { RefundButton } from '@tuwaio/nova-payments';
import { createRefundStore, type RefundStoreOptions } from '@tuwaio/quasar-sdk/checkout';
import { useState } from 'react';

export function Refund({ invoiceId, number, calls }: { invoiceId: string; number: string; calls: RefundStoreOptions }) {
  // One store per invoice: the refund goes on while the window is closed
  const [store] = useState(() => createRefundStore(calls));
  return <RefundButton store={store} invoiceId={invoiceId} invoice={number} currency="USD" />;
}
```

---

## 🌍 Languages and accessibility

The checkout speaks the six languages of Quasar invoices: English, Simplified Chinese, Spanish, Russian, Ukrainian and Italian. It follows the language of the invoice; the buyer changes it in the menu next to the close button, which also sets the language of the documents still to be issued. Each language but English is a file of its own that the page downloads the first time it shows that language, so a checkout in one language does not carry the other five; the first screen waits for it, so it never flashes in English. A language the package does not have can be added with `customization.labels.transform` of `NovaPaymentsProvider`. The checkout aims at WCAG 2.2 AA: the steps are an ordered list with the current one marked, the deadline is announced 10, 5 and 1 minutes before it ends, and animations follow `prefers-reduced-motion`. Everything works from the keyboard: Tab moves between groups, the arrow keys between options, Enter continues, and Escape closes (asking first while nothing is sent; Escape on that question stays). Each new step takes the focus on its heading, so screen readers read it; the focus stays in the modal and returns to the element that opened it. Every Storybook story of the checkout is checked with axe (WCAG 2.2 AA rules, also at 320 px wide) and the keyboard scenarios run as tests on every change; a screen reader pass with VoiceOver and NVDA comes before the first stable release.

---

## 🗄️ Browser Storage

The checkout and the refund window save nothing to `localStorage` or cookies; a refund transaction the wallet sent is kept in memory until Quasar takes it. A payment it hands over to your Pulsar store is kept by that store (`createPulsarStore` persists its pool under its own name).

Nova's own connection (`ownConnection`) keeps the connected wallet in `sessionStorage` until the tab closes (`orbit-core:lastConnectedConnector` and `orbit-core:recentlyConnectedConnectorsListHelpers`, see [`@tuwaio/satellite-core`](https://satellite.docs.tuwa.io/packages/satellite-core)), and in `localStorage` with `rememberWallet: true` or, with `autoConnect`, when the buyer ticks "Remember this wallet" in its connect modal. Every Satellite store of the site shares these keys: connecting a wallet there that is not remembered moves `orbit-core:lastConnectedConnector` and that wallet's entry of the list out of `localStorage`, and disconnecting removes the last connection, so another Satellite app on the same origin forgets the wallet it remembered. wagmi keeps its own `wagmi.*` keys in `localStorage` unless the wagmi config uses `createStorage({ storage: noopStorage })`, as in the example above. Inside the app's connection, the app's stores keep them.

## 🌐 External Services

The checkout routes of the Quasar API (`baseUrl`, Quasar Cloud by default): `GET /v1/payments/checkout/{token}`, its event stream and logo, and the `POST` routes of the steps (`buyer`, `locale`, `quote`, `submit`, `relay`; the wallet calls the `paymaster` route for sponsored calls). The `permission` route takes the automatic payments of a subscription. The EVM adapter reads balances and fee estimates through the RPC transports of your wagmi config, the Solana adapter through its `rpcUrls` (else the public endpoint of the cluster); links to transactions open the chain's block explorer (the explorer of the wagmi chain, the Solana Explorer). A refund calls only your server (the calls of its store); the adapters read the merchant wallet's balance and the fee the same way. Nova's own connection loads what its Satellite adapters and its Nova Connect modal load (see [`@tuwaio/nova-connect`](https://stories.tuwa.io/?path=/docs/packages-nova-connect-overview--docs)) through the RPC of its wagmi config and `rpcUrls`. The wallet asks the buyer, or the merchant for a refund, before every signature, transaction or permission.

---

## 🤝 Contributing & Support

Contributions are welcome! Please read our main **[Contribution Guidelines](https://github.com/TuwaIO/workflows/blob/main/CONTRIBUTING.md)**.

## 📄 License

This project is licensed under the **Apache-2.0 License** - see the [LICENSE](https://github.com/TuwaIO/nova-uikit/blob/main/packages/nova-payments/LICENSE) file for details.
