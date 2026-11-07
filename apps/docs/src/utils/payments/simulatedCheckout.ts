import { QuasarSDKError } from '@tuwaio/quasar-sdk';
import type { CheckoutApi, CheckoutQuote, CheckoutView } from '@tuwaio/quasar-sdk/checkout';

/** A logo for the stories: the letter A on the TUWA blue. */
export const STORY_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><rect width="36" height="36" rx="4" fill="#111827"/><path d="M18 8l8 20h-4l-1.6-4h-4.8L14 28h-4l8-20zm0 7l-1.6 5h3.2L18 15z" fill="#fff"/></svg>',
  );

/** The invoice of the sketch: three lines with VAT 21 %, due in about a day, on test networks. */
export function sampleCheckout(
  overrides: Partial<CheckoutView> = {},
  invoice: Partial<CheckoutView['invoice']> = {},
): CheckoutView {
  return {
    object: 'checkout',
    merchant: {
      name: 'Acme Labs',
      website: 'https://acme.example',
      supportEmail: 'support@acme.example',
      logo: false,
      seller: {
        legalName: 'Acme Labs B.V.',
        tradingName: 'Acme Labs',
        address: 'Main 1, 1011 AB Amsterdam',
        country: 'NL',
        registrationNumber: 'KvK 12345678',
        taxId: 'NL123456789B01',
      },
      links: {
        terms: 'https://acme.example/terms',
        refundPolicy: 'https://acme.example/refunds',
        privacy: 'https://acme.example/privacy',
      },
      fundingUrl: 'https://acme.example/get-usdc',
    },
    theme: { mode: 'system', accentColor: null },
    invoice: {
      id: 'inv_story',
      number: 'INV-2026-42',
      status: 'open',
      environment: 'test',
      currency: 'USD',
      total: '89.54',
      totalMinor: '8954',
      lineItems: [
        {
          name: 'Pro plan, October',
          quantity: '1',
          unitPrice: '49.00',
          taxCategory: 'S',
          taxRate: '21',
          netMinor: '4900',
        },
        { name: 'Extra seats', quantity: '3', unitPrice: '5.00', taxCategory: 'S', taxRate: '21', netMinor: '1500' },
        {
          name: 'Onboarding call',
          quantity: '1',
          unitPrice: '10.00',
          taxCategory: 'S',
          taxRate: '21',
          netMinor: '1000',
        },
      ],
      locale: 'en',
      dueAt: new Date(Date.now() + 23 * 3_600_000 + 41 * 60_000).toISOString(),
      successUrl: null,
      cancelUrl: null,
      amountPaid: null,
      restPayable: false,
      originWallet: null,
      review: null,
      refundedTotalMinor: null,
      replacedBy: null,
      subscription: null,
      ...invoice,
    },
    buyer: { collect: 'off', required: false, companyInvoice: false },
    consent: null,
    methods: [
      {
        id: 'ap_usdc_base',
        name: 'USDC on Base',
        symbol: 'USDC',
        chainId: 'eip155:84532',
        assetId: null,
        decimals: 6,
        gasless: 'auto',
        featured: true,
        markupBps: 0,
        discountBps: 0,
      },
      {
        id: 'ap_usdc_sol',
        name: 'USDC on Solana',
        symbol: 'USDC',
        chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        assetId: null,
        decimals: 6,
        gasless: 'off',
        featured: false,
        markupBps: 0,
        discountBps: 0,
      },
      {
        id: 'ap_sol',
        name: 'SOL',
        symbol: 'SOL',
        chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        assetId: null,
        decimals: 9,
        gasless: 'off',
        featured: false,
        markupBps: 0,
        discountBps: 200,
      },
    ],
    quoteTtlSeconds: 900,
    quote: null,
    autoCharge: null,
    amlScreening: true,
    ...overrides,
  };
}

/** What the simulated checkout answers. */
export interface SimulationOptions {
  /** The checkout to show. */
  view?: CheckoutView;
  /** `loading`: never answers; `notFound`: a retired link; `failure`: the API is down. */
  mode?: 'ok' | 'loading' | 'notFound' | 'failure';
  /** Serve a logo. */
  logo?: boolean;
  /** The merchant sponsors the gas of the methods that allow it (an EIP-3009 signature; default `true`). */
  gasless?: boolean;
  /** The token keeps this fee on every transfer, in basis points. */
  transferFeeBps?: number;
  /** Quasar refuses the price with this code (`payer_blocked`, `screening_unavailable`…). */
  quoteError?: string;
  /** The checkout read after the first one: the invoice that replaced a corrected one, opened from it. */
  afterReplace?: CheckoutView;
  /**
   * Quasar refuses the signature that confirms the paying wallet with this code (`payer_proof_invalid`,
   * `payer_proof_unavailable`…); without it the signature is taken.
   */
  payerProofError?: string;
}

/** The merchant's Solana wallet and the devnet USDC mint of the stories. */
const MERCHANT_SOLANA = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const USDC_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const REFERENCE = '9yYb9dhzyFZGnJgUqt9uZaCvYEJcVwd8xTbgaiVtVb8Y';
/** What the invoice costs in each token: 89.54 USD, SOL at 150 USD with the 2 % discount. */
const EXPECTED: Record<string, string> = { USDC: '89540000', SOL: '584994667', ETH: '37308333333333334' };

/**
 * A checkout API without a network, for the stories (`api` of `PaymentCheckout`): it answers from memory, keeps the
 * language the buyer picks and refuses as the engine would.
 */
export function simulatedCheckoutApi({
  view = sampleCheckout(),
  mode = 'ok',
  logo = false,
  gasless = true,
  transferFeeBps = 0,
  quoteError,
  afterReplace,
  payerProofError,
}: SimulationOptions = {}): CheckoutApi {
  let reads = 0;
  let current: CheckoutView = { ...view, merchant: { ...view.merchant, logo } };
  const never = <T>() => new Promise<T>(() => undefined);
  const refuse = (code: string, status: number, details?: Record<string, unknown>) => {
    const message =
      code === 'checkout_not_found'
        ? 'No such checkout'
        : code === 'payer_blocked'
          ? 'This wallet cannot pay'
          : code === 'consent_required'
            ? 'The buyer must accept the consent of the checkout first'
            : code === 'payer_mismatch'
              ? 'Pay the rest from the wallet that paid first'
              : 'Service unavailable';
    return Promise.reject(new QuasarSDKError(message, status, new Error(message), { code, details }));
  };
  // The wallets that confirmed the invoice, as Quasar records them
  const confirmed = new Set<string>();
  return {
    view: () => {
      if (mode === 'loading') return never();
      if (mode === 'notFound') return refuse('checkout_not_found', 404);
      if (mode === 'failure') return refuse('request_failed', 503);
      reads += 1;
      if (afterReplace && reads > 1) current = afterReplace;
      return Promise.resolve(current);
    },
    // A price locked after a moment, for the next step: a transfer of the method's token to the merchant
    quote: async ({ methodId, payer, consentGiven }) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (quoteError) return refuse(quoteError, quoteError === 'payer_blocked' ? 403 : 503);
      // The rest of an underpaid invoice: only the wallet and the method that paid first, what is left at its rate
      const underpaid = current.invoice.status === 'underpaid' ? current.quote : null;
      if (!underpaid && current.consent?.required && !consentGiven) return refuse('consent_required', 409);
      const method = current.methods.find((item) => item.id === methodId) ?? current.methods[0];
      const firstWallet = underpaid?.payer ?? null;
      if (firstWallet && payer && payer.split(':')[2]?.toLowerCase() !== firstWallet.split(':')[2]?.toLowerCase()) {
        return refuse('payer_mismatch', 409, { originWallet: firstWallet });
      }
      if (underpaid && method.id !== underpaid.methodId) {
        return refuse('rest_method_mismatch', 409, { methodId: underpaid.methodId });
      }
      if (underpaid && !current.invoice.restPayable) return refuse('method_not_found', 404);
      // An EVM method the buyer's wallet pays itself takes a price only for a wallet that confirmed the invoice
      const proven = Boolean(payer && confirmed.has(payer.toLowerCase()));
      if (method.payerProof === 'before_quote' && !proven) return refuse('payer_proof_required', 409);
      const full = underpaid ? BigInt(underpaid.cryptoAmountExpected) : BigInt(EXPECTED[method.symbol] ?? '89540000');
      const due = underpaid ? full - BigInt(current.invoice.amountPaid ?? '0') : full;
      const send = due + (due * BigInt(transferFeeBps) + 9_999n) / 10_000n;
      const amount = String(send);
      const solana = method.chainId.startsWith('solana:');
      const decimal = `${send / 10n ** BigInt(method.decimals)}.${String(send % 10n ** BigInt(method.decimals)).padStart(method.decimals, '0')}`;
      const mint = method.symbol === 'SOL' ? 'native' : USDC_DEVNET;
      const instructions = solana
        ? {
            family: 'solana' as const,
            chainId: method.chainId,
            to: MERCHANT_SOLANA,
            token: mint,
            amount,
            decimals: method.decimals,
            symbol: method.symbol,
            reference: REFERENCE,
            solanaPayUrl: `solana:${MERCHANT_SOLANA}?amount=${decimal}${mint === 'native' ? '' : `&spl-token=${mint}`}&reference=${REFERENCE}&label=Acme%20Labs`,
          }
        : {
            family: 'eip155' as const,
            chainId: Number(method.chainId.split(':')[1]),
            to: '0x2222222222222222222222222222222222222222',
            token: method.symbol === 'ETH' ? 'native' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            amount,
            decimals: method.decimals,
            symbol: method.symbol,
          };
      const quote: CheckoutQuote = {
        object: 'checkout_quote',
        methodId: method.id,
        payer: payer ?? null,
        cryptoAmountExpected: String(full),
        amountDue: String(due),
        amountToSend: amount,
        rateHeldUntil: underpaid?.rateHeldUntil ?? null,
        transferFee: transferFeeBps ? { bps: transferFeeBps, maxFee: null, source: 'contract' } : null,
        decimals: method.decimals,
        symbol: method.symbol,
        lockedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + current.quoteTtlSeconds * 1000).toISOString(),
        reference: solana ? REFERENCE : null,
        rates: [],
        markupBps: method.markupBps,
        discountBps: method.discountBps,
        ...(method.payerProof && method.payerProof !== 'none'
          ? { payerProof: { required: true, proven, kind: proven ? ('eoa' as const) : null } }
          : {}),
        instructions,
        gasless:
          !solana && gasless && method.gasless === 'auto' && !underpaid
            ? {
                relay: {
                  typedData: { domain: {}, types: {}, primaryType: 'TransferWithAuthorization', message: {} },
                },
                paymaster: { calls: [{ to: instructions.token, value: '0', data: '0xa9059cbb' }] },
              }
            : null,
      };
      current = { ...current, quote };
      return quote;
    },
    buyer: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      current = { ...current, buyer: { ...current.buyer, required: false } };
      return current;
    },
    locale: (locale) => {
      current = { ...current, invoice: { ...current.invoice, locale } };
      return Promise.resolve({ locale });
    },
    // The engine takes the payment after a moment; the outcome screens follow in the next step
    submit: async ({ txKey }) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return { txKey, status: 'submitted' };
    },
    relay: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return { status: 'submitted' };
    },
    // The engine takes the ERC-7715 permission: automatic payments are on
    permission: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const autoCharge = { status: 'active' as const, permission: null, revocation: null };
      current = { ...current, autoCharge };
      return { permission: null, autoCharge };
    },
    // The engine asks the chain: the permission has ended, and the offer is open again
    permissionRevoked: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      current = { ...current, autoCharge: { status: 'unavailable', reason: 'subscription_not_active' } };
      return { autoCharge: current.autoCharge };
    },
    // The EIP-4361 message the wallet signs to confirm the invoice, as Quasar writes it
    payerProofMessage: async ({ payer }) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const [namespace, reference, address] = payer.split(':');
      const issuedAt = new Date(Date.now() - 3_600_000).toISOString();
      const message = [
        `${location.host} wants you to sign in with your Ethereum account:`,
        address,
        '',
        `Pay invoice ${current.invoice.number} of ${current.merchant.name} (${current.invoice.total} ${current.invoice.currency}) from this wallet. Quasar credits this invoice with transfers from this wallet once it has signed this message. Signing moves no funds.`,
        '',
        `URI: ${location.origin}`,
        'Version: 1',
        `Chain ID: ${reference}`,
        'Nonce: 3f1c2a9b7d6e5f40a1b2c3d4e5f60718',
        `Issued At: ${issuedAt}`,
        `Resources:`,
        `- urn:quasar:invoice:${current.invoice.id}`,
      ].join('\n');
      return {
        object: 'payer_proof_message',
        payer,
        proven: confirmed.has(payer.toLowerCase()),
        message,
        domain: location.host,
        chainId: `${namespace}:${reference}`,
        nonce: '3f1c2a9b7d6e5f40a1b2c3d4e5f60718',
        issuedAt,
        expiresAt: current.invoice.dueAt,
      };
    },
    // Quasar checks the signature and records the confirmation
    payerProof: async ({ payer }) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (payerProofError) return refuse(payerProofError, payerProofError === 'payer_proof_unavailable' ? 503 : 400);
      confirmed.add(payer.toLowerCase());
      const chainId = payer.split(':').slice(0, 2).join(':');
      const confirmedAt = new Date().toISOString();
      current = {
        ...current,
        payerProofs: [...(current.payerProofs ?? []), { payer, kind: 'eoa', chainId, confirmedAt }],
      };
      return { object: 'payer_proof', payer, proven: true, kind: 'eoa', chainId, confirmedAt };
    },
    url: (route) => (route === 'logo' ? STORY_LOGO : `sim://checkout/${route}`),
  };
}
