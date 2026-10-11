import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn, Dialog, DialogContent, DialogTitle } from '@tuwaio/nova-core';
import type { CheckoutApi, EventSourceConstructor } from '@tuwaio/quasar-sdk/checkout';
import { MotionConfig } from 'framer-motion';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { useCheckoutState, useCheckoutStore } from '../hooks/useCheckoutStore';
import { useConnectedWallet } from '../hooks/useConnectedWallet';
import { useNovaPayments } from '../hooks/useNovaPayments';
import { useNow } from '../hooks/useNow';
import { usePaymentHandOver } from '../hooks/usePaymentHandOver';
import { usePaymentsLabels } from '../hooks/usePaymentsLabels';
import { useWalletConnection } from '../hooks/useWalletConnection';
import { formatLabel } from '../i18n';
import { checkoutScreen, deadlineAnnouncement } from '../utils/checkout';
import { methodFamily, payerFor, type PaymentFamily } from '../utils/methods';
import { BuyerScreen } from './BuyerScreen';
import { CheckoutContextProvider, type CheckoutContextValue } from './checkoutContext';
import { CheckoutHeader, MobileSteps } from './CheckoutHeader';
import { CheckoutSummary, CompactSummary } from './CheckoutSummary';
import { focusRing, mono } from './classes';
import { MethodScreen } from './MethodScreen';
import { PayScreen } from './PayScreen';
import { QrScreen } from './QrScreen';

/** Where the checkout is shown. */
export type PaymentCheckoutDisplay = 'modal' | 'inline' | 'page';

/** Props of {@link PaymentCheckout}. */
export interface PaymentCheckoutProps {
  /** The checkout token of the invoice (its `checkoutToken`, or the end of its `payUrl`). */
  token: string;
  /**
   * `modal` (default): a dialog over the page, a sheet from the bottom under 640 px; `inline`: a block in the page;
   * `page`: the block centered on its own page, as the Quasar payment page shows it.
   */
  display?: PaymentCheckoutDisplay;
  /** Whether the modal is open (`display="modal"`; default `true`). */
  open?: boolean;
  /**
   * Called when the modal opens or closes.
   *
   * @param open - The new state.
   */
  onOpenChange?: (open: boolean) => void;
  /** Called when the buyer closes the checkout; without it an inline checkout has no close button. */
  onClose?: () => void;
  /** The Quasar API; overrides `baseUrl` of `NovaPaymentsProvider`. */
  baseUrl?: string;
  /** Calls to make instead of the HTTP ones, for tests and simulations (`CheckoutApi` of `@tuwaio/quasar-sdk/checkout`). */
  api?: CheckoutApi;
  /** The `EventSource` to follow the invoice with; `null` reads it every `pollMs` (default: the browser's). */
  EventSource?: EventSourceConstructor | null;
  /** How often to read the invoice without an event stream, in milliseconds (default `5000`). */
  pollMs?: number;
  /**
   * The payment page of the invoice (its `payUrl` from the Quasar API): with it, an EVM method can also be paid by
   * scanning a QR code that opens the page on a phone.
   */
  payUrl?: string;
  /**
   * Connects a wallet of a chain family, for apps without Nova Connect. Inside `NovaConnectProvider` the checkout opens
   * its connect modal instead.
   *
   * @param family - The family of the chosen method.
   */
  onConnectWallet?: (family: PaymentFamily) => void;
  /** Classes added to the checkout block. */
  className?: string;
}

/** The checkout while it loads. @internal */
function LoadingScreen() {
  const { labels } = useCheckoutContext();
  return (
    <div
      role="status"
      className="novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:justify-center novapay:gap-3 novapay:p-8 novapay:text-sm novapay:text-[var(--tuwa-text-secondary)]"
    >
      <ArrowPathIcon
        aria-hidden
        className="novapay:h-6 novapay:w-6 novapay:animate-spin novapay:motion-reduce:animate-none"
      />
      {labels.common.loading}
    </div>
  );
}

/** The checkout could not be read: a wrong or retired link, or a failure to retry. @internal */
function ErrorScreen() {
  const { labels, state, store } = useCheckoutContext();
  const notFound = state.error?.code === 'checkout_not_found';
  return (
    <div
      role="alert"
      className="novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:justify-center novapay:gap-3 novapay:p-8 novapay:text-center"
    >
      <ExclamationTriangleIcon aria-hidden className="novapay:h-7 novapay:w-7 novapay:text-[var(--tuwa-error-icon)]" />
      <h2 className={cn(mono, 'novapay:m-0 novapay:text-base novapay:font-bold')}>{labels.error.title}</h2>
      <p className="novapay:m-0 novapay:max-w-sm novapay:text-[13px] novapay:text-[var(--tuwa-text-secondary)]">
        {notFound ? labels.error.notFound : labels.error.generic}
      </p>
      {!notFound && (
        <button
          type="button"
          onClick={() => void store.getState().load()}
          className={cn(
            mono,
            'novapay:h-9 novapay:cursor-pointer novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border-0 novapay:bg-[var(--tuwa-standart-button-bg)] novapay:px-4 novapay:text-xs novapay:font-bold novapay:text-[var(--tuwa-text-primary)] novapay:hover:bg-[var(--tuwa-standart-button-hover)]',
            focusRing,
          )}
        >
          {labels.common.retry}
        </button>
      )}
    </div>
  );
}

/** The screen of the current step; the steps after loading arrive with the next parts of the package. @internal */
function ScreenBody() {
  const { screen } = useCheckoutContext();
  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'error') return <ErrorScreen />;
  if (screen === 'buyer') return <BuyerScreen />;
  if (screen === 'method') return <MethodScreen />;
  if (screen === 'pay') return <PayScreen />;
  if (screen === 'qr') return <QrScreen />;
  // Placeholder until the outcome screens are added (step 6c.4)
  return (
    <div className={cn(mono, 'novapay:flex-1 novapay:p-5 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]')}>
      {screen}
    </div>
  );
}

/**
 * The checkout block: the order on the left (from 640 px; on a phone a compact order above the steps), the header
 * with the steps, language and close, and the current screen. The language follows the invoice, its texts the labels
 * of that language, and `lang` is set on the block (WCAG 3.1.2). Screen readers hear the time left at 10, 5 and 1
 * minutes before the deadline.
 *
 * @internal
 */
function CheckoutFrame({ className, withDetails }: { className?: string; withDetails?: boolean }) {
  const { checkout, locale, labels, now } = useCheckoutContext();
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef<number | null>(null);
  const dueAt = checkout?.invoice.dueAt ? Date.parse(checkout.invoice.dueAt) : null;

  useEffect(() => {
    if (dueAt === null) return;
    const left = dueAt - now;
    const minutes = deadlineAnnouncement(previous.current, left);
    previous.current = left;
    if (minutes !== null) {
      setAnnouncement(
        minutes === 1 ? labels.summary.oneMinuteLeft : formatLabel(labels.summary.minutesLeft, { minutes }),
      );
    }
  }, [dueAt, now, labels]);

  return (
    <div
      lang={locale}
      className={cn(
        'novapay:relative novapay:flex novapay:w-full novapay:flex-col novapay:overflow-hidden novapay:bg-[var(--tuwa-bg-primary)] novapay:text-[var(--tuwa-text-primary)] novapay:sm:h-[600px] novapay:sm:w-[760px] novapay:sm:flex-row',
        className,
      )}
    >
      {checkout && (
        <aside className="novapay:hidden novapay:w-[286px] novapay:shrink-0 novapay:border-r novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:p-5 novapay:sm:block">
          <CheckoutSummary />
        </aside>
      )}
      <div className="novapay:flex novapay:min-h-0 novapay:min-w-0 novapay:flex-1 novapay:flex-col">
        <CheckoutHeader withDetails={withDetails} />
        <div className="novapay:sm:hidden">
          {checkout && <CompactSummary />}
          <MobileSteps withDetails={withDetails} />
        </div>
        <div className="novapay:flex novapay:min-h-0 novapay:flex-1 novapay:flex-col novapay:overflow-y-auto">
          <ScreenBody />
        </div>
      </div>
      <div role="status" aria-live="polite" className="novapay:sr-only">
        {announcement}
      </div>
    </div>
  );
}

/**
 * The checkout of a Quasar Payments invoice, opened by its checkout token: the order, the steps of the payment and
 * its outcome, in the language of the invoice. It reads the invoice with `createCheckoutStore` of
 * `@tuwaio/quasar-sdk/checkout` and follows it until it is final; no secret key reaches the browser.
 *
 * Side effects: requests to the checkout routes of the Quasar API (`baseUrl`) and an `EventSource` on the invoice
 * events while the invoice can change; changing the language saves it on the invoice (`POST locale`).
 *
 * @param props - See {@link PaymentCheckoutProps}.
 * @returns The checkout.
 *
 * @example
 * ```tsx
 * import { PaymentCheckout } from '@tuwaio/nova-payments';
 * import { useState } from 'react';
 *
 * export function PayButton({ token }: { token: string }) {
 *   const [open, setOpen] = useState(false);
 *   return (
 *     <>
 *       <button onClick={() => setOpen(true)}>Pay</button>
 *       <PaymentCheckout token={token} open={open} onOpenChange={setOpen} />
 *     </>
 *   );
 * }
 * ```
 */
export function PaymentCheckout({
  token,
  display = 'modal',
  open = true,
  onOpenChange,
  onClose,
  baseUrl,
  api,
  EventSource,
  pollMs,
  payUrl,
  onConnectWallet,
  className,
}: PaymentCheckoutProps) {
  const settings = useNovaPayments();
  const store = useCheckoutStore({ token, baseUrl: baseUrl ?? settings.baseUrl, api, EventSource, pollMs });
  const state = useCheckoutState(store, (value) => value);
  const checkout = state.checkout;
  const locale = state.locale ?? checkout?.invoice.locale ?? 'en';
  const labels = usePaymentsLabels(locale);
  const now = useNow(1000, Boolean(checkout?.invoice.dueAt));
  const wallet = useConnectedWallet();
  const connection = useWalletConnection(onConnectWallet);
  const adapters = settings.adapters;
  const [payWith, setPayWith] = useState<'wallet' | 'qr'>('wallet');
  const [handoff, setHandoff] = useState(false);
  // The method a wallet is being connected for: its price is locked once the wallet arrives
  const connectingFor = useRef<string | null>(null);
  const screen = checkoutScreen(state, { payWith, handoff });
  const adapterFor = (family: PaymentFamily) => adapters?.find((adapter) => adapter.family === family);
  const onPaymentSent = usePaymentHandOver({
    store,
    open: display !== 'modal' || open,
    adapterFor,
    pulsar: settings.pulsar,
    labels,
    locale,
  });

  const lockForWallet = useEffectEvent(() => {
    if (!wallet || !checkout) return;
    const { quote, phase } = store.getState();
    if (connectingFor.current) {
      const method = checkout.methods.find((item) => item.id === connectingFor.current);
      const payer = method ? payerFor(wallet, method) : null;
      if (!payer) return;
      connectingFor.current = null;
      store.getState().setPayer(payer);
      void store.getState().requestQuote();
      return;
    }
    // Another wallet became active over a locked price: lock it again for that wallet, or go back to the methods
    if (phase !== 'awaitingPayment' || !quote?.payer) return;
    const method = checkout.methods.find((item) => item.id === quote.methodId);
    const payer = method ? payerFor(wallet, method) : null;
    if (payer === quote.payer) return;
    if (!payer) return store.getState().releaseQuote();
    store.getState().setPayer(payer);
    void store.getState().requestQuote();
  });
  useEffect(() => lockForWallet(), [wallet?.address, wallet?.chainId, wallet?.connectorType]);
  // The connect modal closed without a wallet of that family
  useEffect(() => {
    if (!connection.connecting) connectingFor.current = null;
  }, [connection.connecting]);
  // The details step stays in the steps once the checkout asked for the buyer
  const [askedBuyer, setAskedBuyer] = useState(false);
  if (screen === 'buyer' && !askedBuyer) setAskedBuyer(true);

  const close = useMemo(() => {
    if (display === 'modal') return () => (onOpenChange ? onOpenChange(false) : onClose?.());
    return onClose;
  }, [display, onOpenChange, onClose]);

  const context: CheckoutContextValue = {
    store,
    state,
    checkout,
    screen,
    locale,
    labels,
    now,
    close,
    wallet,
    payWith,
    setPayWith,
    payUrl,
    connectWallet: (method) => {
      const family = methodFamily(method);
      connectingFor.current = method.id;
      const asked = family !== null && connection.connect(family);
      if (!asked) connectingFor.current = null;
      return asked;
    },
    adapterFor,
    handoff,
    setHandoff,
    backToMethods: () => {
      setHandoff(false);
      store.getState().releaseQuote();
    },
    onPaymentSent,
  };
  const frame = (
    <CheckoutContextProvider value={context}>
      <MotionConfig reducedMotion="user">
        <CheckoutFrame withDetails={askedBuyer} className={display === 'modal' ? className : undefined} />
      </MotionConfig>
    </CheckoutContextProvider>
  );

  if (display === 'modal') {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          if (!next) onClose?.();
        }}
      >
        <DialogContent className="novapay:w-full novapay:sm:w-auto">
          <DialogTitle className="novapay:sr-only">
            {formatLabel(labels.common.dialogTitle, { merchant: checkout?.merchant.name ?? '' })}
          </DialogTitle>
          {frame}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <section
      aria-label={formatLabel(labels.common.dialogTitle, { merchant: checkout?.merchant.name ?? '' })}
      className={cn(
        'novapay:w-full novapay:overflow-hidden novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:sm:w-[760px]',
        display === 'page' && 'novapay:mx-auto novapay:my-8',
        className,
      )}
    >
      {frame}
    </section>
  );
}
