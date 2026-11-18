# Changelog

## [0.7.1](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.7.0...nova-payments-v0.7.1) (2026-11-18)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.16.0
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.15.0 to >=0.16.0

## [0.7.0](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.6.1...nova-payments-v0.7.0) (2026-11-18)


### Features

* **payments:** a refund taken back has a status of its own, withdrawn ([#30](https://github.com/TuwaIO/quasar-client/issues/30)) ([9d3582f](https://github.com/TuwaIO/quasar-client/commit/9d3582f627f0a8a9055445303e90a20bda07d644))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.15.0

## [0.6.1](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.6.0...nova-payments-v0.6.1) (2026-11-17)


### Bug Fixes

* **deps:** update Next.js to 16.4.6, @tuwaio/nova-* to 0.16.0, @tuwaio/sdk to 0.9.5, and share pixel flight helpers ([#27](https://github.com/TuwaIO/quasar-client/issues/27)) ([9e5e2e5](https://github.com/TuwaIO/quasar-client/commit/9e5e2e5da643e24dfc685189717d7a9e5145a45a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.14.1
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.13.0 to >=0.14.1

## [0.6.0](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.5.1...nova-payments-v0.6.0) (2026-11-15)


### Features

* **nova-payments:** an invoice's own address, checked in the buyer's browser ([#25](https://github.com/TuwaIO/quasar-client/issues/25)) ([cfe0d16](https://github.com/TuwaIO/quasar-client/commit/cfe0d162f30ebd3ee261851c835b163b8a6ea853))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.14.0
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.13.0 to >=0.14.0

## [0.5.1](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.5.0...nova-payments-v0.5.1) (2026-11-15)


### Bug Fixes

* **nova-payments:** the step heading takes the focus once the payee is checked, and the phone hand-off link keeps the pins ([#23](https://github.com/TuwaIO/quasar-client/issues/23)) ([5d3279d](https://github.com/TuwaIO/quasar-client/commit/5d3279d15c9ba0895191802458fe057004b773f8))

## [0.5.0](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.4.0...nova-payments-v0.5.0) (2026-11-15)


### Features

* **payments:** check the payee of every quote before the checkout shows or pays it, and pin payout addresses ([#21](https://github.com/TuwaIO/quasar-client/issues/21)) ([c5bfa00](https://github.com/TuwaIO/quasar-client/commit/c5bfa009d8e7e5c7257ae9dad9b01f6e28cf112b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.13.0

## [0.4.0](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.3.0...nova-payments-v0.4.0) (2026-11-15)


### Features

* **payments:** names that never read as escrow: needs review, accept payment, unmatched transfers ([#19](https://github.com/TuwaIO/quasar-client/issues/19)) ([a0897fd](https://github.com/TuwaIO/quasar-client/commit/a0897fd77f0289dbf3835d811b73f642371121db))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.12.0
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.8.0 to >=0.12.0

## [0.3.0](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.2.0...nova-payments-v0.3.0) (2026-11-14)


### Features

* **payments:** a gasless payment sent from the page's one-time account ([#17](https://github.com/TuwaIO/quasar-client/issues/17)) ([afdfcab](https://github.com/TuwaIO/quasar-client/commit/afdfcabab5a09da90496f44a32c22f6cdd140e3c))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.11.0
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.8.0 to >=0.11.0

## [0.2.0](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.1.0...nova-payments-v0.2.0) (2026-11-14)


### Features

* **payments:** the checkout names a payer that receives the payment ([35a8d6a](https://github.com/TuwaIO/quasar-client/commit/35a8d6a979f88fe0e7d20142986d1c6c9f135a50))
* **payments:** the SDK and the checkout without subscriptions ([35a8d6a](https://github.com/TuwaIO/quasar-client/commit/35a8d6a979f88fe0e7d20142986d1c6c9f135a50))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.10.0
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.8.0 to >=0.10.0

## [0.1.0](https://github.com/TuwaIO/quasar-client/compare/nova-payments-v0.0.1...nova-payments-v0.1.0) (2026-11-13)


### Features

* **nova-payments:** the checkout in paper and ink, with a status that changes in place ([#12](https://github.com/TuwaIO/quasar-client/issues/12)) ([b9cda06](https://github.com/TuwaIO/quasar-client/commit/b9cda060ec2abbd2995b4f32fa51a0735b07ee5b))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.9.0
  * peerDependencies
    * @tuwaio/quasar-sdk bumped from >=0.8.0 to >=0.9.0

## 0.0.1 (2026-11-07)


### Features

* stable TUWA packages and the audit fixes of the checkout and refunds ([6bfb6aa](https://github.com/TuwaIO/quasar-client/commit/6bfb6aadb80460d573522eec1dc35e05ba320d6f))
* stable TUWA packages and the audit fixes of the checkout and refunds ([6bfb6aa](https://github.com/TuwaIO/quasar-client/commit/6bfb6aadb80460d573522eec1dc35e05ba320d6f))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @tuwaio/quasar-sdk bumped to 0.8.0
