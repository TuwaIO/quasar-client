/**
 * @file The payee of a quote: the merchant's receiving address, checked in the buyer's browser before the page shows
 * it or asks a wallet for anything. Every place the address appears (the instructions, the EIP-3009 authorization of a
 * gasless payment, the calls of a paymaster payment, the Solana Pay link) must name one address; the merchant's
 * pinned addresses, when given, must include it; and the payout record Quasar sends (`payee`) must be signed by that
 * address's own wallet. A signature alone does not stop a swap made in Quasar's database (an attacker's wallet signs
 * its own record): the pinned addresses do.
 */

import type { CheckoutQuote } from './types';

/**
 * A receiving wallet's signed word that it takes the payments of a Quasar app on the networks it names. Every field is
 * in one canonical form: the signature covers the text made of them ({@link payoutRecordText}).
 */
export interface PayoutRecord {
  /** Format version: 1. */
  version: 1;
  /** What the record names: `address`, the one wallet that receives the payments. */
  type: 'address';
  /** The Quasar app whose payments it receives. */
  app: string;
  /** The networks it receives on: CAIP-2, of one family, sorted and without repeats. */
  chains: string[];
  /** The wallet: an EVM address in its checksum form (EIP-55), or a Solana address. */
  address: string;
  /** When the record was made: ISO 8601 in UTC with milliseconds. */
  issuedAt: string;
}

/** The payout record of a quote's receiving address with its wallet's signature, as Quasar sends it (`quote.payee`). */
export interface CheckoutPayee {
  /** The record. */
  record: PayoutRecord;
  /** Of {@link payoutRecordText}: hex (EIP-191 `personal_sign`) on EVM, base58 (Ed25519) on Solana. */
  signature: string;
}

/**
 * Checks the signature of a payout record by its own address: the chain adapters of `@tuwaio/nova-payments` do it on
 * EVM (an EOA by recovery, a smart wallet through its contract on `chainId`, ERC-1271 or ERC-6492) and on Solana
 * (Ed25519).
 *
 * @param params - The record, its signature and the network (CAIP-2) of the quote.
 * @returns Whether the signature is the record's address's, or `null` when this page cannot check signatures of the
 *   network's family (no chain adapter for it): the record is matched, its signature not checked (`signed: false`).
 */
export type PayeeVerifier = (params: {
  record: PayoutRecord;
  signature: string;
  chainId: string;
}) => Promise<boolean | null>;

/** How a checkout store checks the payee of each quote (`payee` of `createCheckoutStore`). */
export interface PayeeOptions {
  /** Checks the signature of the payout record. Without it the signature is not checked (`signed: false`). */
  verify?: PayeeVerifier;
  /**
   * The merchant's own receiving addresses, from their integration rather than from Quasar: a quote paid to any other
   * address is refused, whatever Quasar's database says. EVM addresses in any letter case.
   */
  addresses?: readonly string[];
}

/**
 * Why a quote's payee was refused: `payee_unsigned` (Quasar has no payout record of the address), `payee_mismatch`
 * (the places of the address disagree, or the record names another address or network), `payee_not_pinned` (the
 * address is not among the merchant's pinned addresses) or `payee_unverified` (the record's signature is not its
 * address's, or could not be checked).
 */
export type PayeeRefusal = 'payee_unsigned' | 'payee_mismatch' | 'payee_not_pinned' | 'payee_unverified';

/** What the check of a quote's payee found ({@link checkQuotePayee}). */
export type PayeeCheckResult =
  | {
      status: 'verified';
      /**
       * Whether the record's signature was checked: `false` without a verifier, or for an engine that sends no
       * payout record (before payout records); the places of the address and the pinned addresses are checked anyway.
       */
      signed: boolean;
    }
  | { status: 'refused'; reason: PayeeRefusal };

/**
 * The check of a quote's payee as a checkout store keeps it (`payeeCheck`): the quote it is about, `checking` until
 * the check ends, then what it found.
 */
export type PayeeCheck = { quote: CheckoutQuote } & ({ status: 'checking' } | PayeeCheckResult);

/** The key of the merchant's pinned payout addresses in the fragment of a payment link (`#payout=<address>,<address>`). */
export const PAYOUT_LINK_KEY = 'payout';

/**
 * A payment link with the merchant's pinned payout addresses in its fragment (`#payout=`). Browsers send no fragment to
 * a server, so the addresses go from the merchant's integration to the payment page without passing through Quasar;
 * the page passes them to the checkout (`payoutAddresses` of `PaymentCheckout` in `@tuwaio/nova-payments`), which
 * refuses a payment to any other address.
 *
 * @param payUrl - The payment link, as Quasar returned it.
 * @param addresses - The merchant's own receiving addresses; none leaves the link as it is.
 * @returns The link with the addresses in its fragment.
 */
export function withPayoutAddresses(payUrl: string, addresses: readonly string[]): string {
  if (addresses.length === 0) return payUrl;
  const pins = `${PAYOUT_LINK_KEY}=${addresses.map((address) => encodeURIComponent(address)).join(',')}`;
  return payUrl.includes('#') ? `${payUrl}&${pins}` : `${payUrl}#${pins}`;
}

/**
 * The merchant's pinned payout addresses in the fragment of a payment link ({@link withPayoutAddresses}).
 *
 * @param hashOrUrl - The fragment (`location.hash`, with or without `#`) or the whole link.
 * @returns The addresses, or `undefined` when the link pins none.
 */
export function payoutAddressesOf(hashOrUrl: string): string[] | undefined {
  const at = hashOrUrl.indexOf('#');
  const fragment = at === -1 ? hashOrUrl : hashOrUrl.slice(at + 1);
  const addresses = new URLSearchParams(fragment)
    .get(PAYOUT_LINK_KEY)
    ?.split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  return addresses?.length ? addresses : undefined;
}

/** The first line of the signed text. */
const PAYOUT_RECORD_TITLE = 'Quasar payout address';

/**
 * The text a wallet signs for a payout record, made of the record's fields line by line: the same text Quasar builds
 * (`payoutRecordText` of `@tuwaio/shared/payments`), so a record anyone holds is checked against what was signed.
 *
 * @param record - The record.
 * @returns The text.
 */
export function payoutRecordText(record: PayoutRecord): string {
  return [
    PAYOUT_RECORD_TITLE,
    '',
    'This wallet receives the payments of a Quasar app on the networks below. Signing is free: it moves no funds and approves no transfer.',
    '',
    `Address: ${record.address}`,
    `Networks: ${record.chains.join(', ')}`,
    `App: ${record.app}`,
    `Issued At: ${record.issuedAt}`,
    `Record: ${record.type}, version ${record.version}`,
  ].join('\n');
}

/** Whether two addresses of a family are one: EVM addresses without regard to case, Solana addresses exactly. */
const sameAddress = (evm: boolean, a: string, b: string) => (evm ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The selector of ERC-20 `transfer(address,uint256)`. */
const ERC20_TRANSFER = '0xa9059cbb';

/** The recipient of a paymaster call: the address of an ERC-20 `transfer` of the token, else the target of a plain value transfer. */
function callRecipient(call: { to: string; value: string; data: string }, token: string): string | null {
  const data = call.data.toLowerCase();
  if (token === 'native') return data === '0x' || data === '' ? call.to : null;
  if (!sameAddress(true, call.to, token)) return null;
  if (!data.startsWith(ERC20_TRANSFER) || data.length !== 138) return null;
  return `0x${data.slice(34, 74)}`;
}

/** The recipient of a Solana Pay transfer request (`solana:<recipient>?…`). */
function solanaPayRecipient(url: string): string | null {
  if (!url.startsWith('solana:')) return null;
  const path = url.slice('solana:'.length).split('?')[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/** The places of a quote's receiving address other than its instructions, each read as an address. */
function otherPlaces(quote: CheckoutQuote): (string | null)[] {
  const { instructions } = quote;
  if (instructions.family === 'solana') return [solanaPayRecipient(instructions.solanaPayUrl)];
  const places: (string | null)[] = [];
  const authorization = quote.gasless?.relay?.typedData.message;
  if (authorization) places.push(typeof authorization.to === 'string' ? authorization.to : null);
  for (const call of quote.gasless?.paymaster?.calls ?? []) places.push(callRecipient(call, instructions.token));
  return places;
}

/**
 * Checks the payee of a quote before the page shows its address or asks a wallet for anything: every place of the
 * address names the address of the instructions (`payee_mismatch`), the merchant's pinned addresses include it
 * (`payee_not_pinned`), and the payout record covers its network and address and is signed by it (`verify`;
 * `payee_unverified`). A quote with `payee: null` has no record (`payee_unsigned`). A quote without the field comes
 * from an engine older than payout records: its places and the pinned addresses are still checked (`signed: false`).
 *
 * @param quote - The quote.
 * @param options - The verifier of the signature and the pinned addresses.
 * @returns What the check found. A verifier that throws counts as `payee_unverified`; one that answers `null` (it
 *   cannot check the network's family) leaves the signature unchecked (`signed: false`).
 */
export async function checkQuotePayee(quote: CheckoutQuote, options: PayeeOptions = {}): Promise<PayeeCheckResult> {
  const { instructions } = quote;
  const evm = instructions.family === 'eip155';
  const address = instructions.to;
  const chainId = evm ? `eip155:${instructions.chainId}` : instructions.chainId;
  if (otherPlaces(quote).some((place) => place === null || !sameAddress(evm, place, address))) {
    return { status: 'refused', reason: 'payee_mismatch' };
  }
  const pinned = options.addresses ?? [];
  if (pinned.length > 0 && !pinned.some((pin) => sameAddress(evm, pin, address))) {
    return { status: 'refused', reason: 'payee_not_pinned' };
  }
  const { payee } = quote;
  if (payee === undefined) return { status: 'verified', signed: false };
  if (payee === null) return { status: 'refused', reason: 'payee_unsigned' };
  const { record } = payee;
  if (record.type !== 'address' || !record.chains.includes(chainId) || !sameAddress(evm, record.address, address)) {
    return { status: 'refused', reason: 'payee_mismatch' };
  }
  if (!options.verify) return { status: 'verified', signed: false };
  let holds: boolean | null;
  try {
    holds = await options.verify({ record, signature: payee.signature, chainId });
  } catch {
    return { status: 'refused', reason: 'payee_unverified' };
  }
  if (holds === null) return { status: 'verified', signed: false };
  return holds ? { status: 'verified', signed: true } : { status: 'refused', reason: 'payee_unverified' };
}
