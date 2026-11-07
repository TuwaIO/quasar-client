# Changelog

## 0.0.1 (2026-11-07)


### Features

* **nova-payments:** the checkout moves as Nova 0.11 does — Quasar loader, status strip, marks that draw themselves ([eeb31f3](https://github.com/TuwaIO/quasar-client/commit/eeb31f36b28a6045a37c8c50aae4fb067318f0e7))
* **nova-payments:** the payment page is one centered sheet that grows with its step ([7bd94d7](https://github.com/TuwaIO/quasar-client/commit/7bd94d7b0c49578e56bb00c044c86e67df7f29d1))
* **payments-sdk:** Quasar Client, with the Payments module of the TUWA SDK and its short documentation ([79d5148](https://github.com/TuwaIO/quasar-client/commit/79d514852d22afd0b1a0c8f89f8c7e1c7a98b25c))
* **payments:** a smart wallet is told to choose a token; new reasons a transfer pays nothing ([acc0021](https://github.com/TuwaIO/quasar-client/commit/acc002185737e49469748109067a958c3fbaa582))
* **payments:** another wallet can take over a permission that holds nothing, the merchant can end one, and a refund key sends nothing twice ([2417847](https://github.com/TuwaIO/quasar-client/commit/241784770ad91d22ccd828d7eede60184b35b295))
* **payments:** take back a refund that waits, ask for one with an idempotency key, and say when one needs a check by hand ([4094077](https://github.com/TuwaIO/quasar-client/commit/409407721dbe4752960a94c04dad38a1f5817e9c))


### Bug Fixes

* **deps:** Nova alpha.43, TUWA SDK alpha.51 and Pulsar EVM 0.12 ([b89a9da](https://github.com/TuwaIO/quasar-client/commit/b89a9daaf092ce394cf42b014155337b74c6e9ab))
* **nova-payments:** a receipt says when the invoice was paid, not when the page was opened ([37eab2b](https://github.com/TuwaIO/quasar-client/commit/37eab2b45cfa3c47f52478df10ed8db5321952f7))
* **nova-payments:** a refund that arrived short is told in words ([bbf7718](https://github.com/TuwaIO/quasar-client/commit/bbf771815c0de82259f722cee8f14e72a72d06c8))
* **nova-payments:** a refund the merchant closed is headed by what the merchant did, not by a failure ([9ec35c7](https://github.com/TuwaIO/quasar-client/commit/9ec35c76c46e719af6d10dd217260139106ed716))
* **nova-payments:** a withdrawn refund sends nothing, a buyer names the real hash, and no plain Pay after 24 hours ([ee49d6a](https://github.com/TuwaIO/quasar-client/commit/ee49d6a5c1814c95be57e9cc7536e821f4b5d2a3))
* **nova-payments:** automatic payments offer the smart account themselves, and no wallet case ends in a wrong message ([3f8bd2b](https://github.com/TuwaIO/quasar-client/commit/3f8bd2b7e8ea8af3f2564b4be48fc34bf2907188))
* **nova-payments:** no second payment when money may have left in a transaction nothing found ([a1b88cd](https://github.com/TuwaIO/quasar-client/commit/a1b88cd30d74bfface568bff2961579ba2b6766b))
* **nova-payments:** Nova of 1.0.0-feat-payments-alpha.42.86c66a13, SDK alpha.50 ([8a85156](https://github.com/TuwaIO/quasar-client/commit/8a8515655c8b1a162cc70f8634cf9f6981136bfa))
* **nova-payments:** one screen at a time, no empty footer, a countdown that fits ([7cdb08f](https://github.com/TuwaIO/quasar-client/commit/7cdb08f229572b16c47cd46ecf06e3e47c61842c))
* **nova-payments:** refund failures in words, a way on from a held transfer, a fee that reads ([ea738ba](https://github.com/TuwaIO/quasar-client/commit/ea738ba0d71ef67ba9fca3033f80b358caa8bed9))
* **nova-payments:** the checkout promises the wait a payment can keep ([26b7889](https://github.com/TuwaIO/quasar-client/commit/26b78896ab0168f449b80ac16e28747706b1642e))
* **nova-payments:** the hand-over retry stays on "Confirming", and the wait and warning screens read right ([796ae3d](https://github.com/TuwaIO/quasar-client/commit/796ae3d5d334a756be7120d0db67d2282fe04fd8))
* **nova-payments:** the page stays shut live as on a reload, names the right transaction and says when Quasar still reads it ([10fa4cc](https://github.com/TuwaIO/quasar-client/commit/10fa4cc111c9a5f54b970c0ff49f439c755bb4e5))
* **nova-payments:** the page stays shut while a nonce is unexplained, whatever is named, and says what Quasar reads ([94722ef](https://github.com/TuwaIO/quasar-client/commit/94722efaf578198d5f47832cfd0cc5c74f096648))
* **nova-payments:** the wallet step follows the wallet, and automatic payments ask on their own network ([3d32abd](https://github.com/TuwaIO/quasar-client/commit/3d32abdcd340b473fad1c1df878452b8d995c5eb))
* **payments-sdk:** the root types work, a release of the checkout releases the module, and the peer floors are true ([0f2bdba](https://github.com/TuwaIO/quasar-client/commit/0f2bdba630da4020251a5d35b2c50fa535ccaa9e))
* **payments:** a refund window says why it was refused, and that a refund was cancelled in the wallet ([717b5f1](https://github.com/TuwaIO/quasar-client/commit/717b5f1e89106a759d055920bb5a684dfb51dece))
* **payments:** the checkout says what really happened to a payment, and a refund shows why it was refused ([a86ccdf](https://github.com/TuwaIO/quasar-client/commit/a86ccdf7d312b9156305502af40cf736401bf719))
* **quasar-sdk,nova-payments:** a transaction the invoice refused stays on the page and is offered again ([0862ae7](https://github.com/TuwaIO/quasar-client/commit/0862ae79a4a504bbd9a143ab3777fb5ad4d3fab3))
* **quasar-sdk,nova-payments:** another wallet can reach the take-over, and a full invoice never offers a second payment ([043c332](https://github.com/TuwaIO/quasar-client/commit/043c3322b54e67406a031be2786552071d886d16))
* **quasar-sdk,nova-payments:** the wallet confirms the invoice when it gives a permission ([64549c2](https://github.com/TuwaIO/quasar-client/commit/64549c24e19b2e722cb3f049fb906394f0a25d93))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.8.0
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.8.0 || >=1.0.0-0 to >=0.8.0
