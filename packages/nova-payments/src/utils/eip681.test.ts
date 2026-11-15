import { describe, expect, it } from 'vitest';

import { eip681Of } from './eip681';

const ADDRESS = '0x91e3d440bAD234d893C7eBbB7f0cd8DEE584E1Ae';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

describe('the EIP-681 link of a quote', () => {
  // A phone wallet fills in what to send from the link: one digit off and the invoice is underpaid
  it("transfers the token's exact amount in base units to the invoice's address, on the quote's network", () => {
    expect(
      eip681Of(
        { family: 'eip155', chainId: 8453, to: ADDRESS, token: USDC, amount: '49000000', decimals: 6, symbol: 'USDC' },
        '49000000',
      ),
    ).toBe(`ethereum:${USDC}@8453/transfer?address=${ADDRESS}&uint256=49000000`);
  });

  it("sends the chain's coin as a value in wei", () => {
    expect(
      eip681Of(
        { family: 'eip155', chainId: 1, to: ADDRESS, token: 'native', amount: '1', decimals: 18, symbol: 'ETH' },
        '16000000000000000',
      ),
    ).toBe(`ethereum:${ADDRESS}@1?value=16000000000000000`);
  });
});
