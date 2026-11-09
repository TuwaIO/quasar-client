# Quasar Client

<p align="center">
  <img src="https://tuwa.io/brand/quasar_client.png" alt="Quasar Client" width="450" style="border-radius: 12px; margin: 24px auto;" />
</p>

[![License](https://img.shields.io/npm/l/@tuwaio/payments-sdk.svg)](https://github.com/TuwaIO/quasar-client/blob/main/LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/TuwaIO/quasar-client/release.yml?branch=main)](https://github.com/TuwaIO/quasar-client/actions)

**Quasar Client** is the client side of [Quasar](https://docs.tuwa.io/quasar): the API client for your server, the Nova Payments checkout for React, and the Payments module of the TUWA SDK. A change to the checkout is one commit and one release here.

📖 **Short documentation and the live checkout:** [payments.docs.tuwa.io](https://payments.docs.tuwa.io/). The guides and the API reference are in the docs hub, [docs.tuwa.io/quasar](https://docs.tuwa.io/quasar).

---

## 🧩 Packages

| Package                                                 | Install it when                          | What it is                                                                                       |
| ------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **[`@tuwaio/payments-sdk`](./packages/payments-sdk)**   | Your app uses `@tuwaio/sdk`              | The checkout and the refunds, with Nova, Satellite, Pulsar and Orbit from the entries of the SDK |
| **[`@tuwaio/nova-payments`](./packages/nova-payments)** | You install the Nova packages one by one | React components of the checkout and the refunds                                                 |
| **[`@tuwaio/quasar-sdk`](./packages/quasar-sdk)**       | Your server calls the Quasar API         | The API client, webhook verification, the headless checkout stores and the webhook relay CLI     |

Dependencies go one way: Orbit, Pulsar, Satellite and SIWX, then Nova UI Kit, then the TUWA SDK, then this repository, then Quasar. Nothing below depends on it.

---

## 🔧 Monorepo Structure

```
quasar-client/
├── apps/
│   └── docs/                # payments.docs.tuwa.io (Storybook 10 + Vite)
│       ├── src/             # Introduction, the stories and the generated `packages/` reference
│       ├── i18n/            # Translations of the Introduction, and the translation check
│       └── typedoc/         # TypeDoc plugins and the Packages overview page
├── packages/
│   ├── quasar-sdk/          # API client (entry points ., ./checkout, ./react) and the `quasar-sdk` CLI
│   ├── nova-payments/       # Checkout and refunds for React (entry points ., ./i18n, ./evm, ./solana)
│   └── payments-sdk/        # Payments module of the TUWA SDK (entry points ., ./i18n, ./evm, ./solana, ./checkout)
├── scripts/                 # OpenAPI description of the Quasar API, written to the docs hub
└── typedoc.json             # Reference generation (TypeDoc "packages" strategy)
```

---

## 🛠️ Development

```bash
pnpm install       # installs dependencies and builds all packages
pnpm build         # builds the packages with tsup (ESM, CJS, types)
pnpm test          # runs vitest in every package
pnpm lint          # runs ESLint
pnpm docs:gen      # regenerates the Packages reference in apps/docs/src/packages
pnpm storybook     # regenerates the reference and runs Storybook on port 6006
pnpm openapi:gen   # writes the OpenAPI description of the Quasar API to ../docs (the docs hub)
```

---

## 🤝 Contribution & Auditing

Please review our ecosystem **[Contribution Guidelines](https://github.com/TuwaIO/workflows/blob/main/CONTRIBUTING.md)**.

## 📄 License

Licensed under the **Apache-2.0 License**. See the [LICENSE](https://github.com/TuwaIO/quasar-client/blob/main/LICENSE) file for details.
