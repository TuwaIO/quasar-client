# @tuwaio/nova-payments

[![NPM Version](https://img.shields.io/npm/v/@tuwaio/nova-payments.svg)](https://www.npmjs.com/package/@tuwaio/nova-payments)
[![License](https://img.shields.io/npm/l/@tuwaio/nova-payments.svg)](https://github.com/TuwaIO/nova-uikit/blob/main/packages/nova-payments/LICENSE)

`@tuwaio/nova-payments` is the payments Layer 7 (L7) package of **Nova UI Kit**, the user interface project of TUWA Stage 4 ("User Interface"). It renders the checkout of a [Quasar Payments](https://docs.tuwa.io/quasar) invoice from its checkout token: the order with its lines, tax and deadline, the steps of the payment and its outcome, in a modal (a sheet from the bottom on a phone), in the page, or on a page of its own. It keeps no payment state of its own: the checkout store of [`@tuwaio/quasar-sdk/checkout`](https://docs.tuwa.io/quasar) reads the invoice and follows it, and no secret key reaches the browser.

> [!NOTE]
> The package is in development: native speakers review the translations of the checkout before the stable release.

---

## 💾 Installation

```bash
pnpm add @tuwaio/nova-payments @tuwaio/quasar-sdk @tuwaio/nova-core @tuwaio/nova-connect @tuwaio/nova-transactions @tuwaio/satellite-react @tuwaio/pulsar-core @tuwaio/orbit-core zustand react framer-motion @heroicons/react @radix-ui/react-dialog @web3icons/react @web3icons/common clsx tailwind-merge
```

The checkout connects wallets through Nova Connect (`NovaConnectProvider` of `@tuwaio/nova-connect`, with its own peers) when the app sets it up; apps that connect wallets differently pass `onConnectWallet`, and without either the buyer pays with a QR code.

Import the stylesheets of `@tuwaio/nova-core` (theme variables), of `@tuwaio/nova-transactions` (the confirm and paid steps reuse its progress) and of this package (Tailwind CSS v4 utilities prefixed with `novapay:`):

```css
@import '@tuwaio/nova-core/dist/index.css';
@import '@tuwaio/nova-transactions/dist/index.css';
@import '@tuwaio/nova-payments/dist/index.css';
```

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

---

## 🌍 Languages and accessibility

The checkout speaks the six languages of Quasar invoices: English, Simplified Chinese, Spanish, Russian, Ukrainian and Italian. It follows the language of the invoice; the buyer changes it in the menu next to the close button, which also sets the language of the documents still to be issued. Each language but English is a file of its own that the page downloads the first time it shows that language, so a checkout in one language does not carry the other five; the first screen waits for it, so it never flashes in English. A language the package does not have can be added with `customization.labels.transform` of `NovaPaymentsProvider`. The checkout aims at WCAG 2.2 AA: the steps are an ordered list with the current one marked, the deadline is announced 10, 5 and 1 minutes before it ends, and animations follow `prefers-reduced-motion`. Everything works from the keyboard: Tab moves between groups, the arrow keys between options, Enter continues, and Escape closes (asking first while nothing is sent; Escape on that question stays). Each new step takes the focus on its heading, so screen readers read it; the focus stays in the modal and returns to the element that opened it. Every Storybook story of the checkout is checked with axe (WCAG 2.2 AA rules, also at 320 px wide) and the keyboard scenarios run as tests on every change; a screen reader pass with VoiceOver and NVDA comes before the first stable release.

---

## 🗄️ Browser Storage

The checkout saves nothing to `localStorage` or cookies. A payment it hands over to your Pulsar store is kept by that store (`createPulsarStore` persists its pool under its own name).

## 🌐 External Services

The checkout routes of the Quasar API (`baseUrl`, Quasar Cloud by default): `GET /v1/payments/checkout/{token}`, its event stream and logo, and the `POST` routes of the steps (`buyer`, `locale`, `quote`, `submit`, `relay`; the wallet calls the `paymaster` route for sponsored calls). The `permission` route takes the automatic payments of a subscription. The EVM adapter reads balances and fee estimates through the RPC transports of your wagmi config, the Solana adapter through its `rpcUrls` (else the public endpoint of the cluster); links to transactions open the chain's block explorer (the explorer of the wagmi chain, the Solana Explorer). The wallet asks the buyer before every signature, transaction or permission.

---

## 🤝 Contributing & Support

Contributions are welcome! Please read our main **[Contribution Guidelines](https://github.com/TuwaIO/workflows/blob/main/CONTRIBUTING.md)**.

## 📄 License

This project is licensed under the **Apache-2.0 License** - see the [LICENSE](https://github.com/TuwaIO/nova-uikit/blob/main/packages/nova-payments/LICENSE) file for details.
