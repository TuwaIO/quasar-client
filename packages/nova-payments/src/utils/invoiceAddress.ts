/**
 * @file The address of an invoice of its own (ERC-5564, scheme 1, secp256k1), derived in the buyer's browser from the
 * payout wallet's meta-address and the address's one-time key, so the checkout shows Quasar's address only when the two
 * agree: `S = r·V`, `s = keccak256(S)` of the compressed point, the address of `K + s·G`. Quasar derives it the same way
 * (`invoiceAddressOf` of `@tuwaio/shared/payments`); every curve operation is `@noble/curves`, which `viem` uses too.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { type Address, bytesToHex, hexToBytes, isHex, keccak256 } from 'viem';
import { publicKeyToAddress } from 'viem/accounts';

/** A meta-address: `st:eth:0x`, then the spending and the viewing public key, compressed (33 bytes each). */
const META_ADDRESS = /^st:eth:0x([0-9a-fA-F]{66})([0-9a-fA-F]{66})$/;
const Point = secp256k1.ProjectivePoint;

/**
 * The address a one-time key gives under a meta-address.
 *
 * @param metaAddress - The meta-address of the payout wallet's signed record.
 * @param ephemeralPrivateKey - The address's one-time private key `r`, 32 bytes in `0x` hex, as the quote carries it.
 * @returns The address in its checksum form, or `null` for a meta-address or a key that cannot be one.
 */
export function invoiceAddressFrom(metaAddress: string, ephemeralPrivateKey: string): Address | null {
  const match = META_ADDRESS.exec(metaAddress);
  if (!match || !isHex(ephemeralPrivateKey) || ephemeralPrivateKey.length !== 66) return null;
  try {
    const shared = secp256k1.getSharedSecret(hexToBytes(ephemeralPrivateKey), hexToBytes(`0x${match[2]}`), true);
    const secret = BigInt(keccak256(shared));
    // Out of range with a chance below 2^-127: such a one-time key gives no address
    if (secret === 0n || secret >= secp256k1.CURVE.n) return null;
    const stealth = Point.fromHex(match[1]).add(Point.BASE.multiply(secret));
    return publicKeyToAddress(bytesToHex(stealth.toRawBytes(false)));
  } catch {
    return null;
  }
}
