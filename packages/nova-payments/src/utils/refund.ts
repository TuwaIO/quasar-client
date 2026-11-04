/**
 * @file A refund as the merchant's wallet sends it: the transfer Quasar asks for, in the shape of a payment.
 */

import { parseCaip19AssetId, toEvmChainId } from '@tuwaio/orbit-core';
import type { PaymentInstructions, RefundState } from '@tuwaio/quasar-sdk/checkout';

import { familyOf } from './methods';

/** What Quasar asks the merchant to send for a refund (`instructions` of the refund store). */
export type RefundInstructions = NonNullable<RefundState['instructions']>;

/**
 * The transfer of a refund as a payments adapter sends it (`sendTransfer`): the asset of the payment to the payer, on
 * the chain of the payment. The token is the contract or mint of the CAIP-19 asset, `native` for the coin of the chain.
 *
 * @param instructions - What Quasar asks to send.
 * @returns The transfer, or `null` without a recipient or on a chain no adapter pays on.
 */
export function refundTransfer(instructions: RefundInstructions): PaymentInstructions | null {
  if (!instructions.to) return null;
  const asset = parseCaip19AssetId(instructions.assetId);
  const transfer = {
    to: instructions.to,
    token: !asset || asset.assetNamespace === 'slip44' ? 'native' : asset.assetReference,
    amount: instructions.amount,
    decimals: instructions.decimals,
    symbol: instructions.symbol,
  };
  const family = familyOf(instructions.chainId);
  // A refund needs no Solana Pay reference: Quasar takes its signature
  if (family === 'solana')
    return { family, chainId: instructions.chainId, ...transfer, reference: '', solanaPayUrl: '' };
  const chainId = family === 'eip155' ? toEvmChainId(instructions.chainId) : undefined;
  return chainId === undefined ? null : { family: 'eip155', chainId, ...transfer };
}
