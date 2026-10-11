# @tuwaio/nova-payments

[![NPM Version](https://img.shields.io/npm/v/@tuwaio/nova-payments.svg)](https://www.npmjs.com/package/@tuwaio/nova-payments)
[![License](https://img.shields.io/npm/l/@tuwaio/nova-payments.svg)](https://github.com/TuwaIO/nova-uikit/blob/main/packages/nova-payments/LICENSE)

`@tuwaio/nova-payments` is the payments Layer 7 (L7) package of **Nova UI Kit**, the user interface project of TUWA Stage 4 ("User Interface"). It renders the checkout of a [Quasar Payments](https://docs.tuwa.io/quasar) invoice from its checkout token: the order with its lines, tax and deadline, the steps of the payment and its outcome, in a modal (a sheet from the bottom on a phone), in the page, or on a page of its own. It keeps no payment state of its own: the checkout store of [`@tuwaio/quasar-sdk/checkout`](https://docs.tuwa.io/quasar) reads the invoice and follows it, and no secret key reaches the browser.

> [!NOTE]
> The package is in development: the Solana adapter (`/solana`) and the outcome screens arrive in the next releases.

---

## 💾 Installation

```bash
pnpm add @tuwaio/nova-payments @tuwaio/quasar-sdk @tuwaio/nova-core @tuwaio/nova-connect @tuwaio/satellite-react @tuwaio/pulsar-core @tuwaio/orbit-core zustand react framer-motion @heroicons/react @radix-ui/react-dialog @web3icons/react @web3icons/common clsx tailwind-merge
```

The checkout connects wallets through Nova Connect (`NovaConnectProvider` of `@tuwaio/nova-connect`, with its own peers) when the app sets it up; apps that connect wallets differently pass `onConnectWallet`, and without either the buyer pays with a QR code.

Import the stylesheets of `@tuwaio/nova-core` (theme variables) and of this package (Tailwind CSS v4 utilities prefixed with `novapay:`):

```css
@import '@tuwaio/nova-core/dist/index.css';
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

To pay from a wallet in the browser, give the provider the chain adapters of your app (`@tuwaio/nova-payments/evm` needs `@wagmi/core` and `viem`) and, optionally, your Pulsar store: a payment the wallet sends after the buyer closed the checkout goes to it, and Nova Transactions shows its toast.

```tsx
'use client';

import { NovaPaymentsProvider } from '@tuwaio/nova-payments';
import { paymentsEVMAdapter } from '@tuwaio/nova-payments/evm';
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
    <NovaPaymentsProvider adapters={[paymentsEVMAdapter(wagmiConfig)]} pulsar={{ injectExternalPendingTxs }}>
      {children}
    </NovaPaymentsProvider>
  );
}
```

---

## 🌍 Languages and accessibility

The checkout follows the language of the invoice; the buyer changes it in the menu next to the close button, which also sets the language of the documents still to be issued. The checkout aims at WCAG 2.2 AA: the steps are an ordered list with the current one marked, the deadline is announced 10, 5 and 1 minutes before it ends, focus stays in the modal, and animations follow `prefers-reduced-motion`.

---

## 🗄️ Browser Storage

The checkout saves nothing to `localStorage` or cookies. A payment it hands over to your Pulsar store is kept by that store (`createPulsarStore` persists its pool under its own name).

## 🌐 External Services

The checkout routes of the Quasar API (`baseUrl`, Quasar Cloud by default): `GET /v1/payments/checkout/{token}`, its event stream and logo, and the `POST` routes of the steps (`buyer`, `locale`, `quote`, `submit`, `relay`; the wallet calls the `paymaster` route for sponsored calls). The chain adapters read balances and fee estimates through the RPC transports of your wagmi config, and the wallet asks the buyer before every signature or transaction.

---

## 🤝 Contributing & Support

Contributions are welcome! Please read our main **[Contribution Guidelines](https://github.com/TuwaIO/workflows/blob/main/CONTRIBUTING.md)**.

## 📄 License

This project is licensed under the **Apache-2.0 License** - see the [LICENSE](https://github.com/TuwaIO/nova-uikit/blob/main/packages/nova-payments/LICENSE) file for details.
