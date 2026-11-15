import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak256, numberToHex } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import { describe, expect, it } from 'vitest';

import { invoiceAddressFrom } from './invoiceAddress';

/** Quasar's frozen vector: the meta-address of its test wallet, the one-time key of index 0 and its address. */
const FROZEN = {
  metaAddress:
    'st:eth:0x03730b233d71c2cacf3eafde565dcc253ecd7c9f8f0eb71b1537eba38b740f81bd039add8463fd9ad9411f6ff0457f599adb680dc701f6dd69a99e81d122457ddec9',
  ephemeralPrivateKey: '0xda798b43f121542887649d6397efa7663f2f6c124efd4684d799773ae1c5e928',
  address: '0x91e3d440bAD234d893C7eBbB7f0cd8DEE584E1Ae',
} as const;

/** The keys of ScopeLift's ERC-5564 SDK tests: a meta-address and the spending and viewing keys behind it. */
const SCOPELIFT = {
  metaAddress:
    'st:eth:0x033404e82cd2a92321d51e13064ec13a0fb0192a9fdaaca1cfb47b37bd27ec13970390ad5eca026c05ab5cf4d620a2ac65241b11df004ddca360e954db1b26e3846e',
  spendingPrivateKey: '0x0363721eb9e981558c748b824cb32a840da2b3e8957c2fc3bcb8d9c86cb87456',
  viewingPrivateKey: '0xb52a0555f6a8663d89f00365893b1ef9e38eaf2e8bc48a63319c9ea5cb4a27c5',
} as const;

describe('the address of an invoice of its own', () => {
  // The address Quasar derives is the address the page derives: the checkout shows it only then
  it('is the address Quasar derives from the meta-address and the one-time key', () => {
    expect(invoiceAddressFrom(FROZEN.metaAddress, FROZEN.ephemeralPrivateKey)).toBe(FROZEN.address);
  });

  // The merchant spends from the address with `k + s`: the page's address must be the one that key opens
  it("is the address of the key only the meta-address's owner derives, by an independent path", () => {
    for (const ephemeral of ['0x01', '0xda798b43f121542887649d6397efa7663f2f6c124efd4684d799773ae1c5e928']) {
      const r = ephemeral.length === 66 ? ephemeral : numberToHex(BigInt(ephemeral), { size: 32 });
      const R = secp256k1.getPublicKey(r.slice(2), true);
      const shared = secp256k1.getSharedSecret(SCOPELIFT.viewingPrivateKey.slice(2), R, true);
      const secret = BigInt(keccak256(shared));
      const spending = (BigInt(SCOPELIFT.spendingPrivateKey) + secret) % secp256k1.CURVE.n;
      const expected = privateKeyToAddress(numberToHex(spending, { size: 32 }));
      expect(invoiceAddressFrom(SCOPELIFT.metaAddress, r)).toBe(expected);
    }
  });

  // A server that swaps the address cannot find a one-time key that gives its own from the signed meta-address
  it('is another address for another key, and none for a meta-address or a key that cannot be one', () => {
    const other = '0xda798b43f121542887649d6397efa7663f2f6c124efd4684d799773ae1c5e929';
    expect(invoiceAddressFrom(FROZEN.metaAddress, other)).not.toBe(FROZEN.address);
    expect(invoiceAddressFrom(FROZEN.metaAddress.replace('st:eth:', 'st:sol:'), FROZEN.ephemeralPrivateKey)).toBeNull();
    expect(invoiceAddressFrom(FROZEN.metaAddress.slice(0, -2), FROZEN.ephemeralPrivateKey)).toBeNull();
    expect(invoiceAddressFrom(FROZEN.metaAddress, '0x1234')).toBeNull();
    expect(invoiceAddressFrom(FROZEN.metaAddress, `0x${'0'.repeat(64)}`)).toBeNull();
    // A viewing key that is no point of the curve
    const offCurve = `st:eth:0x${FROZEN.metaAddress.slice(9, 75)}02${'f'.repeat(64)}`;
    expect(invoiceAddressFrom(offCurve, FROZEN.ephemeralPrivateKey)).toBeNull();
  });
});
