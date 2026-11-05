import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn, Dialog, DialogContent, DialogTitle, QuasarLoader, StatusEdge } from '@tuwaio/nova-core';
import type { CheckoutApi, CheckoutStore, CheckoutView, EventSourceConstructor } from '@tuwaio/quasar-sdk/checkout';
import { MotionConfig } from 'framer-motion';
import { type ReactNode, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { useCheckoutEvents } from '../hooks/useCheckoutEvents';
import { useCheckoutState, useCheckoutStore } from '../hooks/useCheckoutStore';
import { useConnectedWallet } from '../hooks/useConnectedWallet';
import { useHandOverTime } from '../hooks/useHandOverTime';
import { useNovaPayments } from '../hooks/useNovaPayments';
import { useNow } from '../hooks/useNow';
import { usePaidCallback } from '../hooks/useOutcomeEffects';
import { usePaymentHandOver } from '../hooks/usePaymentHandOver';
import { usePaymentSent } from '../hooks/usePaymentSent';
import { usePaymentsLabels } from '../hooks/usePaymentsLabels';
import { useQrShown } from '../hooks/useQrShown';
import { useWalletConnection } from '../hooks/useWalletConnection';
import { formatLabel, hasLabels } from '../i18n';
import {
  checkoutScreen,
  deadlineAnnouncement,
  deadlineState,
  lockedPriceOnWallet,
  walletOnConfirmStep,
} from '../utils/checkout';
import type { SentPayment } from '../utils/handOver';
import { methodFamily, payerFor, type PaymentFamily } from '../utils/methods';
import { isSameWallet, needsLeaveConfirm } from '../utils/outcome';
import { lockPrice } from '../utils/payerProof';
import { AutoPayOffScreen } from './AutoPayOffScreen';
import { AutoPayScreen } from './AutoPayScreen';
import { BuyerScreen } from './BuyerScreen';
import { CheckoutContextProvider, type CheckoutContextValue } from './checkoutContext';
import { CheckoutHeader, MobileSteps } from './CheckoutHeader';
import { CheckoutSummary, CompactSummary } from './CheckoutSummary';
import { checkoutLayout, checkoutWidthClasses, screenHeading, screenTitle } from './classes';
import { ConfirmScreen } from './ConfirmScreen';
import { ConfirmWalletScreen } from './ConfirmWalletScreen';
import { checkoutClassName, type PaymentCheckoutCustomization } from './customization';
import { LeaveDialog } from './LeaveDialog';
import { MethodScreen } from './MethodScreen';
import { OutcomeScreen } from './OutcomeScreen';
import { PaidScreen } from './PaidScreen';
import { PayScreen } from './PayScreen';
import { QrScreen } from './QrScreen';
import { SecondaryButton } from './ScreenParts';
import { statusToneOf } from './statusTone';

/** Where the checkout is shown. */
export type PaymentCheckoutDisplay = 'modal' | 'inline' | 'page';

/** Props of {@link PaymentCheckout}. */
export interface PaymentCheckoutProps {
  /** The checkout token of the invoice (its `checkoutToken`, or the end of its `payUrl`). */
  token: string;
  /**
   * `modal` (default): a dialog over the page, 760 px wide (less on a narrower window), a sheet from the bottom under
   * 640 px; `inline`: a block in the page, as wide as its place up to 760 px; `page`: the whole page, as the Quasar
   * payment page shows it: a sheet 880 px wide, centered in the window (`min-height: 100svh`; set `--novapay-page-height`
   * on an ancestor for a page with a header of its own), that grows downward with its step and scrolls nothing inside,
   * full-bleed under 640 px.
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
   * Connects a wallet of a chain family, for apps without Nova Connect; overrides the `onConnectWallet` of
   * `NovaPaymentsProvider`. Inside `NovaConnectProvider` (the app's, or Nova's own connection of `NovaPaymentsProvider`)
   * the checkout opens its connect modal instead.
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
   * "Stay here" (`0` for no automatic return). Default `5` on a page; `0` in a modal, whose paid outcome offers Close
   * instead, since the page under it is the seller's (handle the payment there with `onPaid`).
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
      <QuasarLoader size={48} />
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
      <h2 {...screenHeading} className={screenTitle}>
        {labels.error.title}
      </h2>
      <p className="novapay:m-0 novapay:max-w-sm novapay:text-[13px] novapay:text-[var(--tuwa-text-secondary)]">
        {notFound ? labels.error.notFound : labels.error.generic}
      </p>
      {!notFound && (
        <SecondaryButton onClick={() => void store.getState().load()} className="novapay:w-auto novapay:px-6">
          {labels.common.retry}
        </SecondaryButton>
      )}
    </div>
  );
}

/** The statuses of an invoice already paid when its page opens. */
const PAID_ON_OPEN: ReadonlySet<string> = new Set(['paid', 'partially_refunded', 'refunded']);

/** The screen of the current step or outcome, or its replacement (`customization.components.screens`). @internal */
export function ScreenBody() {
  const { screen, customization } = useCheckoutContext();
  const Custom = customization.components?.screens?.[screen];
  if (Custom) return <Custom screen={screen} />;
  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'error') return <ErrorScreen />;
  if (screen === 'buyer') return <BuyerScreen />;
  if (screen === 'method') return <MethodScreen />;
  if (screen === 'confirmWallet') return <ConfirmWalletScreen />;
  if (screen === 'pay') return <PayScreen />;
  if (screen === 'qr') return <QrScreen />;
  if (screen === 'confirm') return <ConfirmScreen />;
  if (screen === 'paid') return <PaidScreen />;
  if (screen === 'autoPay') return <AutoPayScreen />;
  if (screen === 'autoPayOff') return <AutoPayOffScreen />;
  return <OutcomeScreen kind={screen} />;
}

/**
 * The checkout block: the order on the left (from 640 px; on a phone a compact order above the steps), the header
 * with the steps, language and close, and the current screen. The language follows the invoice, its texts the labels
 * of that language, and `lang` is set on the block (WCAG 3.1.2). Screen readers hear the time left at 10, 5 and 1
 * minutes before the deadline while the buyer can still pay. `customization` adds classes to the order and the screen area, and can replace the
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
  const { checkout, locale, labels, now, customization, display } = context;
  const {
    Header = CheckoutHeader,
    Summary = CheckoutSummary,
    CompactSummary: Compact = CompactSummary,
  } = customization.components ?? {};
  const announcements = customization.config?.deadlineAnnouncements;
  const { screen } = context;
  const frame = useRef<HTMLDivElement>(null);
  // A new step takes the focus on its heading, so a keyboard user does not lose it with the button that led there and a
  // screen reader reads the step (WCAG 2.4.3). Not for the first screen after loading, and never when the focus is in
  // another part of the page.
  const shownScreen = useRef(screen);
  useEffect(() => {
    const previous = shownScreen.current;
    shownScreen.current = screen;
    const block = frame.current;
    if (!block || previous === screen || previous === 'loading') return;
    const active = block.ownerDocument.activeElement;
    if (active && active !== block.ownerDocument.body && !block.contains(active)) return;
    const heading = block.querySelector<HTMLElement>('[data-novapay-scroll] [data-novapay-heading]');
    if (display !== 'page') return heading?.focus();
    // The page itself scrolls: a new step starts from the top of the sheet, and the focus moves nothing more
    if (block.getBoundingClientRect().top < 0) block.scrollIntoView({ block: 'start' });
    heading?.focus({ preventScroll: true });
  }, [screen, display]);
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef<number | null>(null);
  const dueAt = checkout?.invoice.dueAt ? Date.parse(checkout.invoice.dueAt) : null;
  // The minutes left to pay are heard only while the buyer can still pay: not once the payment is on its way or done
  const paying = checkout
    ? deadlineState(checkout.invoice.status, screen, checkout.invoice.restPayable) === 'paying'
    : false;

  useEffect(() => {
    if (dueAt === null) return;
    const left = dueAt - now;
    const minutes = deadlineAnnouncement(previous.current, left, announcements);
    previous.current = left;
    if (minutes !== null && paying) {
      setAnnouncement(
        minutes === 1 ? labels.summary.oneMinuteLeft : formatLabel(labels.summary.minutesLeft, { minutes }),
      );
    }
  }, [dueAt, now, labels, announcements, paying]);

  const page = display === 'page';
  const layout = checkoutLayout[page ? 'page' : 'default'];
  const statusTone = statusToneOf(screen);
  const CStatusEdge = customization.components?.StatusEdge ?? StatusEdge;
  return (
    <div ref={frame} lang={locale} className={cn(layout.frame, checkoutWidthClasses(display).frame, className)}>
      {checkout && (
        <aside inert={Boolean(leave)} className={cn(layout.aside, checkoutClassName(context, 'summary'))}>
          <Summary />
        </aside>
      )}
      {/* While the question to leave shows, the rest is out of reach: Tab stays in the question */}
      <div inert={Boolean(leave)} className={cn('novapay:relative', layout.main)}>
        {/* One strip for all the status screens, above the header: its color goes on from one to the next */}
        {statusTone && (
          <CStatusEdge
            tone={statusTone}
            className={cn('novapay:z-20', checkoutClassName(context, 'statusEdge', { tone: statusTone }))}
          />
        )}
        <Header withDetails={withDetails} />
        <div className="novapay:sm:hidden">
          {checkout && <Compact className={checkoutClassName(context, 'compactSummary')} />}
          <MobileSteps withDetails={withDetails} />
        </div>
        {/* A container: a screen lays itself out by the width of this area, 320 px in two panes on a 640 px window */}
        <div data-novapay-scroll="" className={cn(layout.area, checkoutClassName(context, 'body'))}>
          {page ? (
            <div
              // Not between status screens: "Confirming" goes on into "Paid", and a fade would take that away
              key={statusTone ? 'status' : screen}
              className={cn(
                'novapay:flex novapay:flex-1 novapay:flex-col',
                !customization.config?.animation?.disabled && 'novapay-page-fade',
              )}
            >
              <ScreenBody />
            </div>
          ) : (
            <ScreenBody />
          )}
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
  autoReturnSeconds,
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
  const [autoPayOff, setAutoPayOff] = useState<'open' | 'done' | null>(null);
  const [revokeSent, setRevokeSent] = useState(false);
  // What the invoice was when the page first read it: a link opened on a paid invoice shows its receipt, it just was not
  // paid. Per store: another invoice has its own first read
  const [firstRead, setFirstRead] = useState<{ store: typeof store; paid: boolean } | null>(null);
  if (checkout && firstRead?.store !== store) {
    setFirstRead({ store, paid: PAID_ON_OPEN.has(checkout.invoice.status) });
  }
  const [askLeave, setAskLeave] = useState(false);
  // The buyer continued with a wallet that confirms the invoice before the price
  const [confirmWallet, setConfirmWallet] = useState(false);
  // Another invoice opened: the choices made for the previous one no longer apply
  const [shownToken, setShownToken] = useState(activeToken);
  if (shownToken !== activeToken) {
    setShownToken(activeToken);
    setHandoff(false);
    setAutoPay(false);
    setAutoPayOff(null);
    setRevokeSent(false);
    setPayWith('wallet');
    setConfirmWallet(false);
  }
  // The price is locked, or refused after the signature: the step that confirms the wallet is done
  const priceRefused = (state.payerProof as string | undefined) === 'confirmed' && Boolean(state.error);
  // So is it when Quasar refuses the wallet: the rest of an underpaid invoice comes from the wallet that paid first
  const walletRefused = state.error?.code === 'payer_mismatch';
  if (confirmWallet && (state.phase === 'awaitingPayment' || priceRefused || walletRefused)) setConfirmWallet(false);
  // Only the wallet that paid an underpaid invoice first pays the rest: another one is not asked for anything, and the
  // outcome names the first one
  const firstWallet =
    (state.invoiceStatus ?? checkout?.invoice.status) === 'underpaid' ? (checkout?.invoice.originWallet ?? null) : null;
  const paysInvoice = (payer: string) => !firstWallet || isSameWallet(payer, firstWallet);
  // The wallet the step that confirms the wallet asks: the one connected, for the chosen method
  const methodOfStep = checkout?.methods.find((item) => item.id === state.methodId);
  const payerOfStep = methodOfStep ? payerFor(wallet, methodOfStep) : null;
  const walletStep = walletOnConfirmStep({
    open: confirmWallet,
    storePayer: state.payer,
    payer: payerOfStep,
    paysRest: !payerOfStep || paysInvoice(payerOfStep),
  });
  // Nobody is left to ask: the wallet is gone, or it may not pay this invoice
  if (walletStep === 'leave') setConfirmWallet(false);
  // The method a wallet is being connected for: its price is locked once the wallet arrives
  const connectingFor = useRef<string | null>(null);
  // The first screen waits for the labels of the invoice's language (a file of their own), so it never flashes in
  // English; a language switched to later shows once its labels arrive, without leaving the screen
  const [labelsShown, setLabelsShown] = useState(false);
  if (!labelsShown && checkout && hasLabels(locale)) setLabelsShown(true);
  const screen = checkoutScreen(state, {
    payWith,
    handoff,
    autoPay,
    autoPayOff: autoPayOff === 'open',
    confirmWallet,
    labelsReady: labelsShown || !checkout,
  });
  // The price for the wallet set on the store, or the step that confirms the wallet first
  const lockStorePrice = async () => {
    await lockPrice(store, setConfirmWallet);
  };
  const handedOverAt = useHandOverTime(store);
  const qrShown = useQrShown({ store, screen });
  // The transaction the wallet last returned, by invoice store: a payment counts as sent from then on, before the store
  // says anything of it (an invoice the seller cancelled meanwhile keeps its outcome while Quasar records the payment)
  const [walletSent, setWalletSent] = useState<{ store: CheckoutStore; txKey: string } | null>(null);
  const paymentSent = usePaymentSent({
    store,
    state,
    walletTxKey: walletSent?.store === store ? walletSent.txKey : null,
  });
  usePaidCallback(state.phase, checkout?.invoice, onPaid);
  useCheckoutEvents({ state, screen, now, handlers: customization?.handlers });
  const adapterFor = (family: PaymentFamily) => adapters?.find((adapter) => adapter.family === family);
  const handOverOnClose = usePaymentHandOver({
    store,
    open: display !== 'modal' || open,
    adapterFor,
    pulsar: settings.pulsar,
    labels,
    locale,
  });
  const onPaymentSent = useCallback(
    (payment: SentPayment) => {
      setWalletSent({ store, txKey: payment.txKey });
      handOverOnClose(payment);
    },
    [store, handOverOnClose],
  );

  const lockForWallet = useEffectEvent(() => {
    if (!checkout) return;
    const { quote, phase } = store.getState();
    if (wallet && connectingFor.current) {
      const method = checkout.methods.find((item) => item.id === connectingFor.current);
      const payer = method ? payerFor(wallet, method) : null;
      if (!payer) return;
      connectingFor.current = null;
      store.getState().setPayer(payer);
      if (paysInvoice(payer)) void lockStorePrice();
      return;
    }
    // No price is locked: the store still follows the wallet, or the step that confirms the wallet would ask this wallet
    // to sign the last one's message, which Quasar refuses again and again until the buyer reconnects
    if (phase === 'selectMethod' || phase === 'underpaid' || phase === 'blocked') {
      if (state.payer === null || payerOfStep === state.payer) return;
      // Out of a refused wallet too: the refusal is about the last one, whose name the screen would go on showing
      store.getState().setPayer(payerOfStep);
      // It signs, or goes on to the price if it confirmed already
      if (walletStep === 'follow') void lockStorePrice();
      return;
    }
    if (!wallet) return;
    const method = checkout.methods.find((item) => item.id === quote?.methodId);
    const payer = method ? payerFor(wallet, method) : null;
    const next = lockedPriceOnWallet({
      autoPayOffOpen: autoPayOff === 'open',
      phase,
      quotePayer: quote?.payer,
      payer,
    });
    if (next === 'release') return store.getState().releaseQuote();
    if (next === 'keep' || !payer) return;
    store.getState().setPayer(payer);
    if (paysInvoice(payer)) void lockStorePrice();
  });
  // Also when the page settles on a price: a wallet changed while the price was on its way, or while a held transfer was
  // shown, or one connected before the invoice was read. The pay step then showed another wallet than the price's, and
  // "Connect a wallet" could not change anything for the wallet already connected
  const quotePayer = state.quote?.payer;
  const loaded = Boolean(checkout);
  useEffect(
    () => lockForWallet(),
    [wallet?.address, wallet?.chainId, wallet?.connectorType, autoPayOff, state.phase, quotePayer, loaded],
  );
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
  const close =
    closeNow &&
    (() =>
      needsLeaveConfirm(store.getState().phase, store.getState().error, store.getState().invoiceStatus)
        ? setAskLeave(true)
        : closeNow());
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
    handedOverAt,
    qrShown,
    paymentSent,
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
    connectFamily: (family) => connection.connect(family),
    openedPaid: firstRead?.store === store && firstRead.paid,
    revokeSent,
    setRevokeSent,
    adapterFor,
    handoff,
    setHandoff,
    backToMethods: () => {
      setHandoff(false);
      setConfirmWallet(false);
      store.getState().releaseQuote();
    },
    confirmWallet,
    setConfirmWallet,
    lockPrice: lockStorePrice,
    onPaymentSent,
    autoPay,
    setAutoPay,
    autoPayOff,
    setAutoPayOff,
    openInvoice: (next) => setOpened({ from: token, token: next }),
    onContact,
    autoReturnSeconds: autoReturnSeconds ?? (display === 'modal' ? 0 : 5),
    display,
    customization: parts,
  };
  // The classes of the block go where it shows: the frame in the dialog, the section in the page
  const blockClassName = cn(
    className,
    checkoutClassName({ customization: parts, screen, state, checkout }, 'container'),
  );
  const frame = (
    <CheckoutContextProvider value={context}>
      <MotionConfig reducedMotion={customization?.config?.animation?.disabled ? 'always' : 'user'}>
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
          // Escape on the question to leave answers "Stay"
          if (!next && askLeave) return setAskLeave(false);
          if (
            !next &&
            needsLeaveConfirm(store.getState().phase, store.getState().error, store.getState().invoiceStatus)
          ) {
            return setAskLeave(true);
          }
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
  const label = formatLabel(labels.common.dialogTitle, { merchant: checkout?.merchant.name ?? '' });
  if (display === 'page') {
    return (
      <CheckoutPageRoot label={label} className={blockClassName}>
        {frame}
      </CheckoutPageRoot>
    );
  }
  return (
    <section
      aria-label={label}
      className={cn(
        'novapay:overflow-hidden novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)]',
        checkoutWidthClasses(display).section,
        blockClassName,
      )}
    >
      {frame}
    </section>
  );
}

/**
 * The checkout as a whole page: the block, centered from a floor (`styles/app.css`) and not from its own height, so that
 * no step can move its top.
 *
 * @internal
 */
export function CheckoutPageRoot({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="novapay-page">
      <section aria-label={label} className={cn(checkoutWidthClasses('page').section, 'novapay-page-block', className)}>
        {children}
      </section>
    </div>
  );
}
