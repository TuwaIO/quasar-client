/**
 * @file The payment request of a quote to an invoice's own address as an EIP-681 link (`ethereum:`), which the QR code of
 * the checkout holds: a phone wallet that scans it fills in the token, the network, the address and the exact amount.
 */

import type { PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';

/**
 * The EIP-681 link that pays an EVM quote: `ethereum:<address>@<chain>?value=<wei>` for the chain's coin, else the
 * `transfer` of the token, `ethereum:<token>@<chain>/transfer?address=<address>&uint256=<amount>`. Amounts in base units.
 *
 * @param instructions - The EVM instructions of the quote.
 * @param amount - What the wallet sends, in base units (`quote.amountToSend`).
 * @returns The link.
 */
export function eip681Of(instructions: Extract<PaymentInstructions, { family: 'eip155' }>, amount: string): string {
  const { to, token, chainId } = instructions;
  if (token === 'native') return `ethereum:${to}@${chainId}?value=${amount}`;
  return `ethereum:${token}@${chainId}/transfer?address=${to}&uint256=${amount}`;
}
