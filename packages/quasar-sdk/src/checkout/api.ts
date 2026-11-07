/**
 * @file HTTP client of the checkout API: the buyer's browser calls it with the checkout token, never with a key.
 */

import { ofetch } from 'ofetch';

import { BASE_API_URL } from '../constants';
import { QuasarSDKError, toQuasarSDKError } from '../core/errors';
import type { Buyer, InvoiceLocale } from '../modules/payments/types';
import type {
  AutoChargeOffer,
  CheckoutApi,
  CheckoutQuote,
  CheckoutView,
  GrantPermissionParams,
  PayerProofConfirmation,
  PayerProofMessage,
} from './types';

// A request that hangs would never reach the retries: a hand-over with no answer is the case they are for
/** How long a checkout call may take: pricing and screening a wallet take seconds. */
const REQUEST_TIMEOUT_MS = 45_000;
/** How long a relay may take: Quasar waits up to 25 seconds for the receipt. */
const RELAY_TIMEOUT_MS = 90_000;

/** Path of a checkout route: `/v1/payments/checkout/:token` and below. */
export const checkoutPath = (token: string, route = '') =>
  `/v1/payments/checkout/${encodeURIComponent(token)}${route ? `/${route}` : ''}`;

/**
 * The checkout routes of one checkout token. Every call throws `QuasarSDKError` (with the Payments `code`) on a refusal.
 *
 * @param token - The checkout token.
 * @param baseUrl - The Quasar API.
 * @returns The calls.
 * @internal
 */
export function checkoutApi(token: string, baseUrl: string = BASE_API_URL): CheckoutApi {
  const call = async <T>(route: string, body?: object, timeout = REQUEST_TIMEOUT_MS): Promise<T> => {
    try {
      return await ofetch<T>(checkoutPath(token, route), {
        baseURL: baseUrl,
        method: body ? 'POST' : 'GET',
        timeout,
        ...(body ? { body } : {}),
      });
    } catch (error) {
      throw toQuasarSDKError(error);
    }
  };
  return {
    view: () => call<CheckoutView>(''),
    quote: (body: { methodId: string; payer?: string; consentGiven?: boolean }) => call<CheckoutQuote>('quote', body),
    payerProofMessage: (body: { payer: string }) => call<PayerProofMessage>('payer-proof/message', body),
    payerProof: (body: { payer: string; message: string; signature: string }) =>
      call<PayerProofConfirmation>('payer-proof', body),
    buyer: (body: { buyer: Buyer; company?: boolean }) => call<CheckoutView>('buyer', body),
    locale: (locale: InvoiceLocale) => call<{ locale: InvoiceLocale }>('locale', { locale }),
    submit: async ({
      methodId,
      ...body
    }: {
      txKey: string;
      from?: string;
      connectorType?: string;
      methodId?: string;
    }) => {
      if (!methodId) return call<{ txKey: string; status: string }>('submit', body);
      try {
        return await call<{ txKey: string; status: string }>('submit', { ...body, methodId });
      } catch (error) {
        // An engine older than the field refuses what it does not know. A real refusal comes again, with one more request
        if (!(error instanceof QuasarSDKError) || error.status !== 400) throw error;
        return call<{ txKey: string; status: string }>('submit', body);
      }
    },
    relay: (signature: string) =>
      call<{ status: 'submitted' | 'sending'; userOpHash?: string; txHash?: string }>(
        'relay',
        { signature },
        RELAY_TIMEOUT_MS,
      ),
    permission: (body: GrantPermissionParams) =>
      call<{ permission: unknown; autoCharge: AutoChargeOffer | null }>('permission', body),
    permissionRevoked: () => call<{ autoCharge: AutoChargeOffer | null }>('permission/revoked', {}),
    url: (route: string) => `${baseUrl.replace(/\/+$/, '')}${checkoutPath(token, route)}`,
  };
}
