/**
 * @file Payments module of the Quasar client: invoices, refunds, documents, quotes and payment methods of a Payments
 * app.
 */

import { withPayoutAddresses } from '../../checkout/payee';
import { PAYMENTS_ENDPOINT } from '../../constants';
import type { QuasarClient } from '../../core/client';
import type {
  CorrectInvoiceParams,
  CreateInvoiceParams,
  CreateOptions,
  GetEventsParams,
  Invoice,
  InvoiceCorrection,
  InvoiceDetails,
  InvoiceDocumentRef,
  InvoiceLedger,
  InvoiceWithCheckout,
  ListInvoiceItemsParams,
  ListInvoicesParams,
  ListUnmatchedTransfersPageParams,
  ListUnmatchedTransfersParams,
  PaymentDocument,
  PaymentDocumentKind,
  PaymentMethod,
  PaymentQuote,
  PaymentsList,
  QuoteParams,
  Refund,
  RefundParams,
  RefundPreview,
  RefundStart,
  SubmitRefundParams,
  UnmatchedTransfer,
  UnmatchedTransferPage,
} from './types';

/** A path segment: IDs are encoded, so one never names another path. */
const segment = (id: string) => encodeURIComponent(id);

/** A date as the API takes it: ISO 8601. */
const iso = (value: Date | string | undefined) => (value instanceof Date ? value.toISOString() : value);

/** The `Idempotency-Key` header of a create call, when given. */
const idempotency = (options: CreateOptions | undefined): Record<string, string> =>
  options?.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {};

/** A list filter of one value or several, as the API takes it: comma-separated. */
const several = <T extends string>(value: T | T[] | undefined) => (Array.isArray(value) ? value.join(',') : value);

/** An EVM address. */
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/** A Solana address: 32 bytes in base58. */
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * What {@link PaymentsModule} takes besides the HTTP client.
 *
 * @internal
 */
export interface PaymentsModuleOptions {
  /** The merchant's own receiving addresses, pinned in the payment links (`payoutAddresses` of `QuasarConfig`). */
  payoutAddresses?: readonly string[];
}

/** A query without the parameters left out. */
const query = (values: Record<string, string | number | undefined>) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));

/**
 * The Payments API (`/v1/payments`) of a Payments app, available as `quasar.payments` on a {@link Quasar} client.
 * Quasar issues numbered invoices with PDF (and, when on, e-invoice) documents, checks the on-chain payment, records
 * every step in a hash-chained ledger and sends `payments.v1` webhooks; money goes straight to your wallets. The app
 * must be a Payments app, and the Quasar node must run Payments.
 *
 * Every method sends one request with the secret key in the `x-tuwa-secret-key` header.
 *
 * @example
 * ```ts
 * import { Quasar } from '@tuwaio/quasar-sdk';
 *
 * const quasar = new Quasar({ secretKey: process.env.QUASAR_SECRET_KEY ?? '' });
 * const { invoice, payUrl } = await quasar.payments.createInvoice(
 *   {
 *     currency: 'EUR',
 *     lineItems: [{ name: 'Pro plan, October', quantity: '1', unitPrice: '49.00', taxRate: '21' }],
 *     buyer: { email: 'buyer@example.com', externalId: 'user_42' },
 *   },
 *   { idempotencyKey: 'order_42' },
 * );
 * ```
 */
export class PaymentsModule {
  /** The merchant's pinned payout addresses, put in the fragment of every payment link the module returns. */
  private readonly payoutAddresses: readonly string[];

  /**
   * Creates the module. The {@link Quasar} client creates it for you.
   *
   * @param client - The HTTP client of the Quasar client.
   * @param options - The merchant's pinned payout addresses (`payoutAddresses` of `QuasarConfig`).
   * @throws {Error} When a pinned address is neither an EVM nor a Solana address.
   * @internal
   */
  constructor(
    private readonly client: QuasarClient,
    options: PaymentsModuleOptions = {},
  ) {
    const addresses = options.payoutAddresses ?? [];
    const wrong = addresses.find((address) => !EVM_ADDRESS.test(address) && !SOLANA_ADDRESS.test(address));
    if (wrong !== undefined) {
      throw new Error(`[Quasar SDK] payoutAddresses: "${wrong}" is neither an EVM nor a Solana address.`);
    }
    this.payoutAddresses = [...new Set(addresses)];
  }

  /** An invoice or a checkout whose payment link carries the pinned payout addresses (`#payout=`). */
  private pinned<T extends { payUrl: string | null }>(value: T): T {
    if (this.payoutAddresses.length === 0 || !value.payUrl) return value;
    return { ...value, payUrl: withPayoutAddresses(value.payUrl, this.payoutAddresses) };
  }

  /** An invoice with its checkout, both payment links pinned. */
  private pinnedCheckout<T extends InvoiceWithCheckout>(value: T): T {
    return { ...this.pinned(value), invoice: this.pinned(value.invoice) };
  }

  /**
   * Issues an invoice (`POST /v1/payments/invoices`): numbered, with its PDF and, when the app has e-invoices on and
   * the buyer details allow, its UBL, which follow within a second or two; the `invoice.issued` webhook follows.
   *
   * @param params - The lines (or a bare `amount`), the buyer and the terms. Dates go as ISO 8601.
   * @param options - `idempotencyKey`: a retry with the same key returns the invoice issued first, with the same link.
   * @returns The invoice, its checkout token and its payment page (also in the invoice view while it can be paid), with
   *   your pinned payout addresses in its fragment when the client has them (`payoutAddresses`).
   * @throws {QuasarSDKError} `invalid_request` with `issues` (400), `seller_details_missing` and other issuer
   *   refusals (400), an app that is not a Payments app or a node without Payments (403), `documents_busy` (503: another
   *   document of the series is being numbered; retry with the same `idempotencyKey`), a timeout or a network error.
   */
  async createInvoice(params: CreateInvoiceParams, options?: CreateOptions): Promise<InvoiceWithCheckout> {
    const created = await this.client.request<InvoiceWithCheckout>(`${PAYMENTS_ENDPOINT}/invoices`, {
      method: 'POST',
      body: { ...params, dueAt: iso(params.dueAt), supplyDate: iso(params.supplyDate) },
      headers: idempotency(options),
    });
    return this.pinnedCheckout(created);
  }

  /**
   * Reads an invoice with its five newest refunds, every refund still under way, and how many refunds and credit
   * notes it has (`GET /v1/payments/invoices/:id`). The full lists are {@link PaymentsModule.listInvoiceRefunds} and
   * {@link PaymentsModule.listInvoiceDocuments}. It also names every transfer credited to it (`payments`: an invoice
   * paid in parts has several), the newest transactions that did not pay it (`attempts`, `attemptsTotal`) and what the
   * wallets that confirmed it signed (`walletConfirmations`).
   *
   * @param invoiceId - The invoice.
   * @returns The invoice.
   * @throws {QuasarSDKError} `invoice_not_found` (404), a timeout or a network error.
   */
  async getInvoice(invoiceId: string): Promise<InvoiceDetails> {
    return this.pinned(
      await this.client.request<InvoiceDetails>(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}`, {
        method: 'GET',
      }),
    );
  }

  /**
   * Lists the refunds of an invoice, newest first (`GET /v1/payments/invoices/:id/refunds`).
   *
   * @param invoiceId - The invoice.
   * @param params - Paging.
   * @returns One page; pass `nextCursor` as `cursor` for the next.
   * @throws {QuasarSDKError} `invoice_not_found` (404), `invalid_request` or `invalid_cursor` (400), a timeout or a
   *   network error.
   */
  async listInvoiceRefunds(invoiceId: string, params: ListInvoiceItemsParams = {}): Promise<PaymentsList<Refund>> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/refunds`, {
      method: 'GET',
      query: query({ limit: params.limit, cursor: params.cursor }),
    });
  }

  /**
   * Lists the documents issued for an invoice, newest first (`GET /v1/payments/invoices/:id/documents`): the invoice,
   * its receipt and its credit notes, as PDF and UBL. Download them with {@link PaymentsModule.getDocument} and
   * {@link PaymentsModule.getCreditNote}.
   *
   * @param invoiceId - The invoice.
   * @param params - Paging.
   * @returns One page; pass `nextCursor` as `cursor` for the next.
   * @throws {QuasarSDKError} `invoice_not_found` (404), `invalid_request` or `invalid_cursor` (400), a timeout or a
   *   network error.
   */
  async listInvoiceDocuments(
    invoiceId: string,
    params: ListInvoiceItemsParams = {},
  ): Promise<PaymentsList<InvoiceDocumentRef>> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/documents`, {
      method: 'GET',
      query: query({ limit: params.limit, cursor: params.cursor }),
    });
  }

  /**
   * Lists invoices, newest first (`GET /v1/payments/invoices`).
   *
   * @param params - Filters and paging.
   * @returns One page; pass `nextCursor` as `cursor` for the next.
   * @throws {QuasarSDKError} `invalid_request` or `invalid_cursor` (400), a timeout or a network error.
   */
  async listInvoices(params: ListInvoicesParams = {}): Promise<PaymentsList<Invoice>> {
    const page = await this.client.request<PaymentsList<Invoice>>(`${PAYMENTS_ENDPOINT}/invoices`, {
      method: 'GET',
      query: query({
        status: several(params.status),
        environment: params.environment,
        externalId: params.externalId,
        createdAfter: iso(params.createdAfter),
        createdBefore: iso(params.createdBefore),
        limit: params.limit,
        cursor: params.cursor,
      }),
    });
    return { ...page, data: page.data.map((invoice) => this.pinned(invoice)) };
  }

  /**
   * Cancels an open invoice (`POST /v1/payments/invoices/:id/cancel`): it stops being payable; its number stays
   * taken. A payment that arrives later needs your review. An underpaid invoice is closed as expired: refund what
   * arrived.
   *
   * @param invoiceId - The invoice.
   * @param params - `reason`, recorded in the ledger.
   * @returns The invoice.
   * @throws {QuasarSDKError} `invoice_not_found` (404), an invoice that is not open (409), a timeout or a network
   *   error.
   */
  async cancelInvoice(invoiceId: string, params: { reason?: string } = {}): Promise<Invoice> {
    return this.pinned(
      await this.client.request<Invoice>(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/cancel`, {
        method: 'POST',
        body: params,
      }),
    );
  }

  /**
   * Accepts the payment of an invoice that needs review (`POST /v1/payments/invoices/:id/accept`): the invoice becomes
   * paid and the buyer gets a receipt. The money is already in your wallet: accepting moves none. A transfer Quasar
   * could tie to no invoice never puts an invoice under review: it is an {@link UnmatchedTransfer} of its own, refunded
   * with {@link PaymentsModule.refundUnmatchedTransfer}.
   *
   * @param invoiceId - The invoice.
   * @param params - `reason`, required, recorded in the ledger; `acceptShortfall: true` for a payment that is less
   *   than the invoice asks, whose shortfall you accept.
   * @returns The invoice.
   * @throws {QuasarSDKError} `invoice_not_found` (404); `invoice_not_in_review`, `invoice_partly_refunded` (refund
   *   the rest), `payment_short` (the payment is less than the invoice asks, past the app's underpayment tolerance, and
   *   `acceptShortfall` is not set: `details.amountPaid`, `amountExpected` and `shortfall` in base units; the invoice
   *   stays under review) or `refund_may_have_landed` (an earlier refund's transaction may have reached the payer; check
   *   it) (409); a timeout or a network error.
   */
  async acceptPayment(invoiceId: string, params: { reason: string; acceptShortfall?: boolean }): Promise<Invoice> {
    return this.pinned(
      await this.client.request<Invoice>(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/accept`, {
        method: 'POST',
        body: params,
      }),
    );
  }

  /**
   * Corrects the buyer details of an open or paid invoice (`POST /v1/payments/invoices/:id/correct`): a credit note
   * for it and a new invoice with the corrected details. A paid invoice's payment carries over to the new one.
   *
   * @param invoiceId - The invoice.
   * @param params - The corrected buyer and the reason the credit note gives.
   * @returns The new invoice (with its checkout while it is open) and the one it replaces.
   * @throws {QuasarSDKError} `invalid_request` (400), `invoice_not_found` (404), an invoice that cannot be corrected
   *   (409), `document_pending` (503: its document is still being issued) or `documents_busy` (503: another document of
   *   the series is being numbered), a timeout or a network error.
   */
  async correctInvoice(invoiceId: string, params: CorrectInvoiceParams): Promise<InvoiceCorrection> {
    const correction = await this.client.request<InvoiceCorrection>(
      `${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/correct`,
      { method: 'POST', body: params },
    );
    return { ...this.pinnedCheckout(correction), replaced: this.pinned(correction.replaced) };
  }

  /**
   * Gives an invoice, in any status, a new checkout token and payment page (`POST /v1/payments/invoices/:id/checkout`),
   * for example when its link leaked. The earlier link stops working, also in the emails already sent, and so does the
   * link of an invoice this one replaced; the current link needs no call: the invoice shows it (`payUrl`). The link of a
   * settled invoice stops opening 90 days after it settled.
   *
   * @param invoiceId - The invoice.
   * @returns The invoice with its new token and page.
   * @throws {QuasarSDKError} `invoice_not_found` (404), a timeout or a network error.
   */
  async replacePayLink(invoiceId: string): Promise<InvoiceWithCheckout> {
    return this.pinnedCheckout(
      await this.client.request<InvoiceWithCheckout>(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/checkout`, {
        method: 'POST',
        body: {},
      }),
    );
  }

  /**
   * Reads a page of an invoice ledger, oldest first (`GET /v1/payments/invoices/:id/events`): up to 100 steps, with
   * how many the ledger has, who created the invoice and when its quote was locked and its receipt issued. Every
   * payment page a buyer opens locks a quote, so a ledger can be long.
   *
   * @param invoiceId - The invoice.
   * @param params - `verify: true` adds the check of the whole hash chain; `limit` and `cursor` page it.
   * @returns One page; pass `nextCursor` as `cursor` for the next.
   * @throws {QuasarSDKError} `invoice_not_found` (404), `invalid_request` or `invalid_cursor` (400), a timeout or a
   *   network error.
   */
  async getEvents(invoiceId: string, params: GetEventsParams = {}): Promise<InvoiceLedger> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/events`, {
      method: 'GET',
      query: query({ verify: params.verify ? 'true' : undefined, limit: params.limit, cursor: params.cursor }),
    });
  }

  /**
   * Shows what a refund would send, without asking for it (`POST /v1/payments/invoices/:id/refunds/preview`).
   *
   * @param invoiceId - The invoice.
   * @param params - Amount (everything left when omitted), mode and reason, as for {@link PaymentsModule.refund}.
   * @returns What it would send now, what the payment brought, and this amount at the rate of the payment.
   * @throws {QuasarSDKError} What {@link PaymentsModule.refund} would be refused with, a timeout or a network error.
   */
  async previewRefund(invoiceId: string, params: RefundParams = {}): Promise<RefundPreview> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/refunds/preview`, {
      method: 'POST',
      body: params,
    });
  }

  /**
   * Asks for a refund of a paid invoice or one that needs review (`POST /v1/payments/invoices/:id/refunds`). Send the
   * returned amount from your wallet to the payer, then pass the transaction to {@link PaymentsModule.submitRefund}.
   *
   * @param invoiceId - The invoice.
   * @param params - Amount (everything left when omitted), mode (`excess`: the overpaid excess alone), reason, and `to`
   *   when the payment came from a contract.
   * @param options - `idempotencyKey`: a retry with the same key answers the refund asked for first while it waits for
   *   its transaction. Once it was sent, finished, failed or taken back the same key answers `refund_not_waiting` (409,
   *   the refund in `details.refund`), so nothing is sent twice: a new refund needs a new key. `idempotency_key_reused`
   *   (409): the key was used for another invoice, mode or amount.
   * @returns The refund and what to send where.
   * @throws {QuasarSDKError} `invalid_request` (an amount with `exact_received` or `excess`, among others),
   *   `amount_exceeds_refundable` (an amount above what is left: `details.refundable`) or `review_refund_must_be_whole`
   *   (a payment that needs review is refunded whole) (400), `invoice_not_found` (404), an invoice that cannot be
   *   refunded (`invoice_not_refundable`, `exact_refund_needs_whole_invoice`, `payment_unknown`) (409),
   *   `refund_destination_required` (409: the payment came from a contract; give `to`), `nothing_overpaid`,
   *   `excess_refunded` or `excess_refund_under_way` (409, `details.refundId`) for the excess, `refund_may_have_landed`
   *   (409: an earlier refund's transaction may have reached the buyer; check it), a timeout or a network error.
   */
  async refund(invoiceId: string, params: RefundParams = {}, options?: CreateOptions): Promise<RefundStart> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/refunds`, {
      method: 'POST',
      body: params,
      headers: idempotency(options),
    });
  }

  /**
   * Takes back a refund still waiting for its transaction (`POST /v1/payments/refunds/:id/withdraw`): it keeps its
   * amount until it goes out, and nothing else ends it. A refund continued later is priced again at the rate of then. Call
   * `reset()` on a refund store that holds it (`createRefundStore`): it would still offer to send it, and Quasar would
   * refuse to record what was sent.
   *
   * @param refundId - The refund.
   * @returns The refund, `withdrawn` (`failed` with `failureReason` `withdrawn` from an engine without that status).
   * @throws {QuasarSDKError} `refund_not_found` (404), `refund_not_waiting` or `refund_operation_open` (a refund sent
   *   from the invoice's own address is under way) (409), a timeout or a network error.
   */
  async withdrawRefund(refundId: string): Promise<Refund> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/refunds/${segment(refundId)}/withdraw`, {
      method: 'POST',
      body: {},
    });
  }

  /**
   * Reads a refund (`GET /v1/payments/refunds/:id`).
   *
   * @param refundId - The refund.
   * @returns The refund.
   * @throws {QuasarSDKError} `refund_not_found` (404), a timeout or a network error.
   */
  async getRefund(refundId: string): Promise<Refund> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/refunds/${segment(refundId)}`, { method: 'GET' });
  }

  /**
   * Hands Quasar the refund transaction (`POST /v1/payments/refunds/:id/submit`); once it is final, the refund is
   * confirmed, a credit note issued and `refund.confirmed` sent.
   *
   * @param refundId - The refund.
   * @param params - The transaction and your wallet it was sent from.
   * @returns The refund, `submitted`.
   * @throws {QuasarSDKError} `invalid_request`, `invalid_transaction` or `invalid_sender` (400), `refund_not_found`
   *   (404), `refund_not_submittable`, `refund_from_buyer` (a wallet that paid the invoice cannot send its refund),
   *   `refund_operation_open` or `transaction_already_used` (409: a transaction an invoice credited as a payment, or
   *   another refund's; one handed over as a payment that paid nothing becomes the refund's), a timeout or a network
   *   error.
   */
  async submitRefund(refundId: string, params: SubmitRefundParams): Promise<Refund> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/refunds/${segment(refundId)}/submit`, {
      method: 'POST',
      body: params,
    });
  }

  /**
   * Lists unmatched transfers, newest first (`GET /v1/payments/unmatched-transfers`, or
   * `GET /v1/payments/invoices/:id/unmatched-transfers` with `invoice`): transfers that reached your invoices without
   * being tied to them by proof, to refund to their senders.
   *
   * @param params - One invoice, one state (`awaiting_refund` for those still to refund), or neither.
   * @returns The unmatched transfers, at most 100.
   * @throws {QuasarSDKError} a timeout or a network error.
   */
  async listUnmatchedTransfers(params: ListUnmatchedTransfersParams = {}): Promise<UnmatchedTransfer[]> {
    const path = params.invoice
      ? `${PAYMENTS_ENDPOINT}/invoices/${segment(params.invoice)}/unmatched-transfers`
      : `${PAYMENTS_ENDPOINT}/unmatched-transfers`;
    const answer = await this.client.request<{ unmatchedTransfers: UnmatchedTransfer[] }>(path, {
      method: 'GET',
      query: params.invoice ? {} : query({ status: params.status }),
    });
    return params.invoice && params.status
      ? answer.unmatchedTransfers.filter((transfer) => transfer.status === params.status)
      : answer.unmatchedTransfers;
  }

  /**
   * Lists the app's unmatched transfers a page at a time, newest first (`GET /v1/payments/unmatched-transfers`).
   *
   * @param params - One state (`awaiting_refund` for those still to refund), the page size (1 to 100, default 100) and
   *   the `nextCursor` of the previous page.
   * @returns The page and the cursor of the next one (`null` on the last).
   * @throws {QuasarSDKError} `invalid_request` or `invalid_cursor` (400), a timeout or a network error.
   */
  async listUnmatchedTransfersPage(params: ListUnmatchedTransfersPageParams = {}): Promise<UnmatchedTransferPage> {
    const answer = await this.client.request<{ unmatchedTransfers: UnmatchedTransfer[]; nextCursor?: string | null }>(
      `${PAYMENTS_ENDPOINT}/unmatched-transfers`,
      { method: 'GET', query: query({ status: params.status, limit: params.limit, cursor: params.cursor }) },
    );
    return { unmatchedTransfers: answer.unmatchedTransfers, nextCursor: answer.nextCursor ?? null };
  }

  /**
   * Asks for the refund of an unmatched transfer, the whole of it to the wallet that sent it
   * (`POST /v1/payments/unmatched-transfers/:id/refund`): send it from your wallet, then hand the transaction over with
   * {@link PaymentsModule.submitRefund}. The refund's `unmatchedTransfer` names the transfer, which becomes
   * `refunding`, then `refunded` once the refund is confirmed.
   *
   * @param unmatchedTransferId - The unmatched transfer.
   * @param params - `to`: where it goes instead of its sender, needed when a contract sent it.
   * @returns The refund and what to send where.
   * @throws {QuasarSDKError} `unmatched_transfer_not_found` (404); `unmatched_transfer_not_refundable` (it is not
   *   `awaiting_refund`), `sender_blocked` (AML blocked the wallet that sent it) or `refund_destination_required` (a
   *   contract sent it; give `to`) (409); a timeout or a network error.
   */
  async refundUnmatchedTransfer(unmatchedTransferId: string, params: { to?: string } = {}): Promise<RefundStart> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/unmatched-transfers/${segment(unmatchedTransferId)}/refund`, {
      method: 'POST',
      body: params.to === undefined ? {} : { to: params.to },
    });
  }

  /**
   * Downloads a stored document of an invoice byte for byte as issued
   * (`GET /v1/payments/invoices/:id/documents/:kind`).
   *
   * @param invoiceId - The invoice.
   * @param kind - `invoice` or `receipt` (PDF), or `invoice.xml` (UBL).
   * @returns The bytes, media type and file name.
   * @throws {QuasarSDKError} `invoice_not_found` or `document_not_found` (404), `document_pending` (503: the document
   *   is still being issued; ask again in a few seconds), a timeout or a network error.
   */
  async getDocument(invoiceId: string, kind: PaymentDocumentKind): Promise<PaymentDocument> {
    return this.client.requestFile(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/documents/${kind}`);
  }

  /**
   * Downloads a credit note of an invoice (`GET /v1/payments/invoices/:id/documents/credit-note/:ref`).
   *
   * @param invoiceId - The invoice.
   * @param ref - The refund it credits, or its number.
   * @param format - `pdf` (default) or `ubl`.
   * @returns The bytes, media type and file name.
   * @throws {QuasarSDKError} `invoice_not_found` or `document_not_found` (404), a timeout or a network error.
   */
  async getCreditNote(invoiceId: string, ref: string, format: 'pdf' | 'ubl' = 'pdf'): Promise<PaymentDocument> {
    const name = `${segment(ref)}${format === 'ubl' ? '.xml' : ''}`;
    return this.client.requestFile(`${PAYMENTS_ENDPOINT}/invoices/${segment(invoiceId)}/documents/credit-note/${name}`);
  }

  /**
   * Prices an amount in a payment method now (`POST /v1/payments/quotes`); nothing is locked.
   *
   * @param params - Amount, currency and method.
   * @returns The price.
   * @throws {QuasarSDKError} `invalid_request` (400), `method_not_found` (404), no fresh price (503), a timeout or a
   *   network error.
   */
  async quote(params: QuoteParams): Promise<PaymentQuote> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/quotes`, { method: 'POST', body: params });
  }

  /**
   * Lists the app's active payment methods, in their order (`GET /v1/payments/methods`).
   *
   * @returns The methods.
   * @throws {QuasarSDKError} A timeout or a network error.
   */
  async listMethods(): Promise<{ object: 'list'; data: PaymentMethod[] }> {
    return this.client.request(`${PAYMENTS_ENDPOINT}/methods`, { method: 'GET' });
  }
}
