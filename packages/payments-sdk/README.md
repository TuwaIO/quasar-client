# @tuwaio/payments-sdk

[![NPM Version](https://img.shields.io/npm/v/@tuwaio/payments-sdk.svg)](https://www.npmjs.com/package/@tuwaio/payments-sdk)
[![License](https://img.shields.io/npm/l/@tuwaio/payments-sdk.svg)](https://github.com/TuwaIO/quasar-client/blob/main/packages/payments-sdk/LICENSE)

`@tuwaio/payments-sdk` is the Payments module of the [TUWA SDK](https://sdk.docs.tuwa.io/): the checkout and the refunds of [`@tuwaio/nova-payments`](https://payments.docs.tuwa.io/?path=/docs/packages-nova-payments-overview--docs) and the checkout store of [`@tuwaio/quasar-sdk`](https://payments.docs.tuwa.io/?path=/docs/packages-quasar-sdk-overview--docs), for an app that already uses `@tuwaio/sdk`. Apps without payments do not install any of it.

It goes on top of the SDK the way `@tuwaio/evm-sdk` and `@tuwaio/solana-sdk` do: Nova, Satellite, Pulsar and Orbit come from the entries of `@tuwaio/sdk`, so the app has one copy of each and the checkout sees the wallet connection and the transaction store of the app.

> [!IMPORTANT]
> Docs only, not live in production: Quasar Payments is still being built, so what this page describes is not available yet and may change.

---

## 💾 Installation

```bash
pnpm add @tuwaio/payments-sdk @tuwaio/sdk react
```

| Import path                       | Provides                                                                                    | Also needs                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `@tuwaio/payments-sdk`            | Everything from `@tuwaio/nova-payments`: `PaymentCheckout`, `NovaPaymentsProvider`, refunds |                                                                                        |
| `@tuwaio/payments-sdk/i18n`       | Everything from `@tuwaio/nova-payments/i18n`: the languages of the checkout                 |                                                                                        |
| `@tuwaio/payments-sdk/evm`        | Everything from `@tuwaio/nova-payments/evm`: the EVM payment adapter                        | `@wagmi/core`, `viem`                                                                  |
| `@tuwaio/payments-sdk/solana`     | Everything from `@tuwaio/nova-payments/solana`: the Solana payment adapter                  | `@tuwaio/solana-sdk`, `@solana/kit`, `@solana-program/system`, `@solana-program/token` |
| `@tuwaio/payments-sdk/checkout`   | Everything from `@tuwaio/quasar-sdk/checkout`: the headless checkout and refund stores      |                                                                                        |
| `@tuwaio/payments-sdk/styles.css` | The stylesheet of the checkout                                                              | The stylesheets of the SDK                                                             |

The API client for your server stays in `@tuwaio/quasar-sdk`: it runs without React, and an app that only issues invoices or verifies webhooks needs nothing else.

---

## 🚀 Usage

```css
@import '@tuwaio/sdk/styles/all.css';
@import '@tuwaio/payments-sdk/styles.css';
```

```tsx
'use client';

import { PaymentCheckout } from '@tuwaio/payments-sdk';
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

The props, the connection modes and the customization are described in [`@tuwaio/nova-payments`](https://payments.docs.tuwa.io/?path=/docs/packages-nova-payments-overview--docs): only the import paths differ.

---

## 🗄️ Browser Storage

The same as [`@tuwaio/nova-payments`](https://payments.docs.tuwa.io/?path=/docs/packages-nova-payments-overview--docs), which this package contains.

## 🌐 External Services

The same as [`@tuwaio/nova-payments`](https://payments.docs.tuwa.io/?path=/docs/packages-nova-payments-overview--docs): the routes of the Quasar API, Quasar Cloud by default.

---

## 🤝 Contributing & Support

Contributions are welcome! Please read our main **[Contribution Guidelines](https://github.com/TuwaIO/workflows/blob/main/CONTRIBUTING.md)**.

## 📄 License

This project is licensed under the **Apache-2.0 License** - see the [LICENSE](https://github.com/TuwaIO/quasar-client/blob/main/packages/payments-sdk/LICENSE) file for details.
