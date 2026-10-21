import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn, Dialog, DialogContent, DialogTitle } from '@tuwaio/nova-core';
import type { CheckoutApi, CheckoutView, EventSourceConstructor } from '@tuwaio/quasar-sdk/checkout';
import { MotionConfig } from 'framer-motion';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { useCheckoutState, useCheckoutStore } from '../hooks/useCheckoutStore';
import { useConnectedWallet } from '../hooks/useConnectedWallet';
import { useNovaPayments } from '../hooks/useNovaPayments';
import { useNow } from '../hooks/useNow';
import { usePaidCallback } from '../hooks/useOutcomeEffects';
import { usePaymentHandOver } from '../hooks/usePaymentHandOver';
import { usePaymentsLabels } from '../hooks/usePaymentsLabels';
import { useWalletConnection } from '../hooks/useWalletConnection';
import { formatLabel, hasLabels } from '../i18n';
import { checkoutScreen, deadlineAnnouncement } from '../utils/checkout';
import { methodFamily, payerFor, type PaymentFamily } from '../utils/methods';
import { needsLeaveConfirm } from '../utils/outcome';
import { AutoPayScreen } from './AutoPayScreen';
import { BuyerScreen } from './BuyerScreen';
import { CheckoutContextProvider, type CheckoutContextValue } from './checkoutContext';
import { CheckoutHeader, MobileSteps } from './CheckoutHeader';
import { CheckoutSummary, CompactSummary } from './CheckoutSummary';
import { focusRing, mono } from './classes';
import { ConfirmScreen } from './ConfirmScreen';
import { checkoutClassName, type PaymentCheckoutCustomization } from './customization';
import { LeaveDialog } from './LeaveDialog';
import { MethodScreen } from './MethodScreen';
import { OutcomeScreen } from './OutcomeScreen';
import { PaidScreen } from './PaidScreen';
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
   * The payment page of the invoice (its `payUrl` from the Quasar API, passed as it comes): with it, an EVM method can
   * also be paid by scanning a QR code that opens the page on a phone. `null` (a node without a dashboard URL) or
   * leaving it out offers the QR code for Solana methods only.
   */
  payUrl?: string | null;
  /**
   * Connects a wallet of a chain family, for apps without Nova Connect. Inside `NovaConnectProvider` the checkout opens
   * its connect modal instead.
   *
   * @param family - The family of the chosen method.
   */
  onConnectWallet?: (family: PaymentFamily) => void;
  /**
   * Called once when the invoice is paid (Quasar confirmed the payment). Fulfil orders from the `invoice.paid` webhook
   * on your server: this callback is for the page only.
   *
   * @param invoice - The paid invoice.
   */
  onPaid?: (invoice: CheckoutView['invoice']) => void;
  /**
   * Seconds before the paid outcome sends the buyer back to the invoice's `successUrl`, with a visible countdown and
   * "Stay here" (default `5`; `0` for no automatic return).
   */
  autoReturnSeconds?: number;
  /** Replaces the link of "Contact <seller>" (the seller's support email, else site) with the app's own handler. */
  onContact?: () => void;
  /** Classes added to the checkout block. */
  className?: string;
  /**
   * Class name functions of the parts, from the state of the checkout, and components that replace parts (the
   * header, the order, the steps, the options of the method step, the main button, the QR code, the outcome icon or
   * whole screens).
   */
  customization?: PaymentCheckoutCustomization;
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

/** The screen of the current step or outcome, or its replacement (`customization.components.screens`). @internal */
export function ScreenBody() {
  const { screen, customization } = useCheckoutContext();
  const Custom = customization.components?.screens?.[screen];
  if (Custom) return <Custom screen={screen} />;
  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'error') return <ErrorScreen />;
  if (screen === 'buyer') return <BuyerScreen />;
  if (screen === 'method') return <MethodScreen />;
  if (screen === 'pay') return <PayScreen />;
  if (screen === 'qr') return <QrScreen />;
  if (screen === 'confirm') return <ConfirmScreen />;
  if (screen === 'paid') return <PaidScreen />;
  if (screen === 'autoPay') return <AutoPayScreen />;
  return <OutcomeScreen kind={screen} />;
}

/**
 * The checkout block: the order on the left (from 640 px; on a phone a compact order above the steps), the header
 * with the steps, language and close, and the current screen. The language follows the invoice, its texts the labels
 * of that language, and `lang` is set on the block (WCAG 3.1.2). Screen readers hear the time left at 10, 5 and 1
 * minutes before the deadline. `customization` adds classes to the order and the screen area, and can replace the
 * header and the order.
 *
 * @internal
 */
export function CheckoutFrame({
  className,
  withDetails,
  leave,
}: {
  className?: string;
  withDetails?: boolean;
  leave: { onStay: () => void; onLeave: () => void } | null;
}) {
  const context = useCheckoutContext();
  const { checkout, locale, labels, now, customization } = context;
  const {
    Header = CheckoutHeader,
    Summary = CheckoutSummary,
    CompactSummary: Compact = CompactSummary,
  } = customization.components ?? {};
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
        <aside
          className={cn(
            'novapay:hidden novapay:w-[286px] novapay:shrink-0 novapay:border-r novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:p-5 novapay:sm:block',
            checkoutClassName(context, 'summary'),
          )}
        >
          <Summary />
        </aside>
      )}
      <div className="novapay:flex novapay:min-h-0 novapay:min-w-0 novapay:flex-1 novapay:flex-col">
        <Header withDetails={withDetails} />
        <div className="novapay:sm:hidden">
          {checkout && <Compact className={checkoutClassName(context, 'compactSummary')} />}
          <MobileSteps withDetails={withDetails} />
        </div>
        <div
          className={cn(
            'novapay:flex novapay:min-h-0 novapay:flex-1 novapay:flex-col novapay:overflow-y-auto',
            checkoutClassName(context, 'body'),
          )}
        >
          <ScreenBody />
        </div>
      </div>
      <div role="status" aria-live="polite" className="novapay:sr-only">
        {announcement}
      </div>
      {leave && <LeaveDialog onStay={leave.onStay} onLeave={leave.onLeave} />}
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
  onPaid,
  autoReturnSeconds = 5,
  onContact,
  className,
  customization,
}: PaymentCheckoutProps) {
  const settings = useNovaPayments();
  // The invoice shown: the token's, or the one that replaced it after the buyer opened it ("Open <number>")
  const [opened, setOpened] = useState({ from: token, token });
  const activeToken = opened.from === token ? opened.token : token;
  const store = useCheckoutStore({
    token: activeToken,
    baseUrl: baseUrl ?? settings.baseUrl,
    api,
    EventSource,
    pollMs,
  });
  const state = useCheckoutState(store, (value) => value);
  const checkout = state.checkout;
  const locale = state.locale ?? checkout?.invoice.locale ?? 'en';
  const labels = usePaymentsLabels(locale);
  // Ticks while the checkout shows: the deadline, the price lock and the return countdown count down
  const now = useNow(1000, Boolean(checkout));
  const wallet = useConnectedWallet();
  const connection = useWalletConnection(onConnectWallet);
  const adapters = settings.adapters;
  const [payWith, setPayWith] = useState<'wallet' | 'qr'>('wallet');
  const [handoff, setHandoff] = useState(false);
  const [autoPay, setAutoPay] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  // Another invoice opened: the choices made for the previous one no longer apply
  const [shownToken, setShownToken] = useState(activeToken);
  if (shownToken !== activeToken) {
    setShownToken(activeToken);
    setHandoff(false);
    setAutoPay(false);
    setPayWith('wallet');
  }
  // The method a wallet is being connected for: its price is locked once the wallet arrives
  const connectingFor = useRef<string | null>(null);
  // The first screen waits for the labels of the invoice's language (a file of their own), so it never flashes in
  // English; a language switched to later shows once its labels arrive, without leaving the screen
  const [labelsShown, setLabelsShown] = useState(false);
  if (!labelsShown && checkout && hasLabels(locale)) setLabelsShown(true);
  const screen = checkoutScreen(state, { payWith, handoff, autoPay, labelsReady: labelsShown || !checkout });
  usePaidCallback(state.phase, checkout?.invoice, onPaid);
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

  const closeNow = useMemo(() => {
    if (display === 'modal') return () => (onOpenChange ? onOpenChange(false) : onClose?.());
    return onClose;
  }, [display, onOpenChange, onClose]);
  // Before anything is sent the checkout asks first; once a transaction is on its way it closes at once
  const close = closeNow && (() => (needsLeaveConfirm(store.getState().phase) ? setAskLeave(true) : closeNow()));
  const leave = askLeave
    ? {
        onStay: () => setAskLeave(false),
        onLeave: () => {
          setAskLeave(false);
          store.getState().releaseQuote();
          closeNow?.();
        },
      }
    : null;

  const parts = customization ?? {};
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
    autoPay,
    setAutoPay,
    openInvoice: (next) => setOpened({ from: token, token: next }),
    onContact,
    autoReturnSeconds,
    customization: parts,
  };
  // The classes of the block go where it shows: the frame in the dialog, the section in the page
  const blockClassName = cn(
    className,
    checkoutClassName({ customization: parts, screen, state, checkout }, 'container'),
  );
  const frame = (
    <CheckoutContextProvider value={context}>
      <MotionConfig reducedMotion="user">
        <CheckoutFrame
          withDetails={askedBuyer}
          leave={leave}
          className={display === 'modal' ? blockClassName : undefined}
        />
      </MotionConfig>
    </CheckoutContextProvider>
  );

  if (display === 'modal') {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Escape and a click outside ask first too, while nothing is sent
          if (!next && needsLeaveConfirm(store.getState().phase)) return setAskLeave(true);
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
        blockClassName,
      )}
    >
      {frame}
    </section>
  );
}
