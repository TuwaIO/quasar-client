# Quasar Client — Storybook

Source of **[payments.docs.tuwa.io](https://payments.docs.tuwa.io/)**: the short documentation of `@tuwaio/quasar-sdk`, `@tuwaio/nova-payments` and `@tuwaio/payments-sdk`, and the live checkout with a simulated invoice. The private package name is `@tuwaio/quasar-client-docs`. The guides and the API reference are in the docs hub, [docs.tuwa.io/quasar](https://docs.tuwa.io/quasar).

It follows the layout of the Nova UI Kit Storybook: a hand-written Introduction, the stories, and one page per npm package, where the package README is followed by a reference of every export generated from the source. `@tuwaio/payments-sdk` only re-exports the other two, so its page is the README alone.

---

## 🚀 Getting Started

From the **monorepo root**:

```bash
pnpm install
pnpm storybook
```

Run the stories in Chromium with axe (`a11y.test: 'error'` fails a story on a violation):

```bash
pnpm --filter @tuwaio/quasar-client-docs exec playwright install chromium
pnpm --filter @tuwaio/quasar-client-docs test:stories
```

The Introduction is translated in `i18n/uk` and `i18n/zh-CN`. `i18n/checkTranslations.mjs`, run by `pnpm docs:gen` and the build, fails when a translation loses a code block or a link of its English page.

---

## 📄 License

Licensed under the **Apache-2.0 License**. See the [LICENSE](https://github.com/TuwaIO/quasar-client/blob/main/apps/docs/LICENSE) file for details.
