import { cn } from '@tuwaio/nova-core';
import type { CheckoutError, CheckoutMethod, CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { type ReactNode, useState } from 'react';

import { useAsyncValue, useRereadValue } from '../hooks/useAsyncValue';
import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { usePayerProof } from '../hooks/usePayerProof';
import { usePayment } from '../hooks/usePayment';
import { useSolanaClusterSync } from '../hooks/useSolanaClusterSync';
import { useStepHeight } from '../hooks/useStepHeight';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { isQuoteEnding, QUOTE_WARNING_MS, screensPayingWallets } from '../utils/checkout';
import {
  baseUnitsToDecimal,
  formatCountdown,
  formatFeeAmount,
  formatFiat,
  formatTokenAmount,
  minorToDecimal,
  shortAddress,
} from '../utils/format';
import { methodFamily, methodToken, networkName, payerFor } from '../utils/methods';
import { leftTheWalletText, paymentFailedText, restRateText } from '../utils/outcome';
import { balanceShortfall, instructionsChainId, payPath, quoteAmounts, quoteRate } from '../utils/pay';
import {
  isConfirmationError,
  isPayerProofError,
  isSmartWallet,
  needsPayerProof,
  payerProofErrorText,
} from '../utils/payerProof';
import { solanaNetworkHint } from '../utils/solanaNetwork';
import type { PaymentWalletErrorKind } from '../utils/walletErrors';
import { AutoPayNote } from './AutoPayNote';
import { CapsLabel } from './CapsLabel';
import { focusRing, label, mono, pendingNote, screenHeading, smallAction, smallPrimaryAction } from './classes';
import { ClockIcon, ExclamationTriangleIcon, InformationCircleIcon } from './icons';
import {
  ChainLink,
  CheckoutWalletIcon,
  CopyButton,
  DetailRow,
  DetailsCard,
  FailedTransaction,
  FooterAction,
  FooterNote,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
  SecondaryButton,
} from './ScreenParts';
import { WalletPrompt } from './WalletPrompt';

/** A price shown with up to two decimals, or more significant digits under one unit of the currency. */
function formatRate(rate: number, locale: string): string {
  if (rate >= 1) return formatFiat(rate, locale);
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(rate);
}

/** The text of a refusal of the wallet or of Quasar, with the action that follows it. */
function problemText(
  labels: NovaPaymentsLabels,
  values: { wallet: string; network: string; merchant: string },
  problem: PaymentWalletErrorKind | null,
  error: CheckoutError | null | undefined,
): string | null {
  const errorCode = error?.code;
  if (problem === 'declined') return formatLabel(labels.pay.declined, values);
  if (problem === 'unsupported') return formatLabel(labels.pay.unsupported, values);
  if (problem === 'wrongNetwork') return formatLabel(labels.pay.wrongCluster, values);
  if (problem === 'switchFailed') return formatLabel(labels.pay.switchFailed, values);
  if (problem === 'notAuthorized') return formatLabel(labels.pay.notAuthorized, values);
  if (problem === 'alreadyPending') return formatLabel(labels.walletPrompt.stillWaiting, values);
  if (problem === 'sentUnconfirmed') return formatLabel(labels.pay.sentUnconfirmed, values);
  // The payment left the wallet, or may have (a transaction that does not pay the invoice or pays another one, closed
  // after 24 hours without a result, taken by another invoice, confirmed and not recorded yet): never "it failed" or
  // "only the fee"
  const leftTheWallet = problem ? null : leftTheWalletText(error, labels, values.merchant);
  if (leftTheWallet !== null) return leftTheWallet;
  // Only a transaction that reverted on the network spent a fee (`paymentFailedText`). A wallet that did not do what it
  // was asked sent nothing
  if (problem === 'failed') return formatLabel(labels.pay.walletFailed, values);
  if (error && errorCode === 'payment_failed') return paymentFailedText(error, labels, values.network);
  if (errorCode === 'screening_unavailable') return labels.pay.screeningUnavailable;
  if (errorCode === 'request_failed') return labels.pay.noAnswer;
  // A new price was refused: the feed or the network of the method cannot be read now, or the seller set up no RPC
  // for that network
  if (errorCode === 'price_unavailable' || errorCode === 'price_no_rpc') return labels.method.priceUnavailable;
  if (errorCode === 'rate_limited') return labels.method.rateLimited;
  if (errorCode === 'method_not_found' || errorCode === 'amount_out_of_range' || errorCode === 'testnet_required') {
    return labels.method.methodUnavailable;
  }
  // Refusals of the confirmation have their text under it. Anything else must not end as a press that does nothing
  return error && !isPayerProofError(error) ? labels.error.generic : null;
}

/** The sentences of one note: a space between them, none after a full-width stop (Chinese). */
const sentences = (...parts: string[]) =>
  parts.reduce((text, part) => (text && !/[。！？]$/.test(text) ? `${text} ${part}` : `${text}${part}`), '');

/** The methods of the wallet's family it holds a balance of, for "Pay from what this wallet has". */
function useAlternatives(methods: CheckoutMethod[], quote: CheckoutQuote | null, short: boolean) {
  const { wallet, adapterFor } = useCheckoutContext();
  const family = quote?.instructions.family;
  const adapter = family ? adapterFor(family) : undefined;
  const others = methods.filter((method) => method.id !== quote?.methodId && methodFamily(method) === family);
  const balances = useAsyncValue(
    short && adapter && wallet && others.length
      ? `${wallet.address}:${others.map((method) => method.id).join()}`
      : null,
    () =>
      Promise.all(
        others.map((method) =>
          adapter!
            .getBalance({ chainId: method.chainId, account: wallet!.address, token: methodToken(method) })
            .catch(() => 0n),
        ),
      ),
  );
  return balances
    ? others.map((method, i) => ({ method, balance: balances[i] })).filter((item) => item.balance > 0n)
    : [];
}

/**
 * The pay step: the connected wallet (with "Change"), the exact amount to send with its network and invoice value,
 * the price lock with "Keep this price" in its last minute, the rate, the network fee (the merchant's or an estimate),
 * the recipient, and the main action — "Sign to pay" when the merchant pays the gas, "Pay" otherwise, "Switch to …"
 * on the wrong network, "Confirm this wallet to pay" before a transfer or a paymaster payment of a method the gasless
 * relay could pay (the wallet signs Quasar's free confirmation of the invoice first; the relay's authorization needs
 * none). Before the prompt it reads the wallet's balance (unless `config.balanceCheck` is `false`)
 * and, when it is short, offers the methods the wallet can pay and the seller's top-up link. `handlers.onSubmit` wraps
 * the pay button. A Solana payment off mainnet reminds the buyer to switch the wallet to its cluster (Solana wallets
 * choose their network themselves), with the steps of Phantom and Solflare. The note under the buttons says that the
 * payment goes straight to the merchant and, when the merchant checks paying wallets (`amlScreening` of the
 * checkout), that it does.
 *
 * Side effects: balance, fee and wallet capability reads from the network through the chain adapter (no request to
 * Quasar); wallet prompts; checkout requests to Quasar; on a Solana payment, `switchNetwork` of the Satellite store
 * moves the app's Solana connection to the payment's cluster (no wallet request).
 *
 * @returns The pay step.
 */
export function PayScreen() {
  const {
    checkout,
    state,
    store,
    labels,
    locale,
    now,
    wallet,
    adapterFor,
    connectWallet,
    backToMethods,
    onPaymentSent,
    customization,
    lockPrice,
    display,
  } = useCheckoutContext();
  const balanceCheck = customization.config?.balanceCheck !== false;
  const quote = state.quote;
  const methods = checkout?.methods ?? [];
  const method = methods.find((item) => item.id === quote?.methodId);
  const family = quote?.instructions.family ?? 'eip155';
  const adapter = adapterFor(family);
  const chainId = quote ? instructionsChainId(quote.instructions) : '';
  const account = wallet?.address ?? '';
  const [withGas, setWithGas] = useState(false);

  const sponsorable = useAsyncValue(
    quote?.gasless?.paymaster && adapter?.canSponsorCalls && wallet ? `${chainId}:${account}` : null,
    () => adapter!.canSponsorCalls!({ chainId, account }),
  );
  const path = quote ? payPath(quote, { withGas, canSponsorCalls: sponsorable === true }) : 'transfer';
  // Read again when the buyer comes back: "Not enough" sends them to top up the wallet, and Pay must open on their return
  const balance = useRereadValue(
    balanceCheck && quote && adapter && wallet ? `${chainId}:${account}:${quote.instructions.token}` : null,
    () => adapter!.getBalance({ chainId, account, token: quote!.instructions.token }),
    quote?.expiresAt,
  );
  const fee = useAsyncValue(
    quote && path === 'transfer' && adapter?.estimateFee && wallet
      ? `${chainId}:${account}:${quote.amountToSend}`
      : null,
    () => adapter!.estimateFee!({ instructions: quote!.instructions, account }),
  );
  const payment = usePayment({
    adapter,
    store,
    quote,
    wallet,
    path,
    paymasterUrl: state.paymasterUrl,
    invoiceId: checkout?.invoice.id,
    onSent: onPaymentSent,
  });
  // A transfer or a paymaster payment of a method the gasless relay could pay: the wallet confirms the invoice first
  const proof = usePayerProof({ adapter, store, wallet, chainId });
  useSolanaClusterSync(chainId, wallet);
  const native = quote?.instructions.token === 'native';
  const shortfall =
    quote && typeof balance === 'bigint' ? balanceShortfall(balance, quote, native && fee ? fee.amount : 0n) : null;
  // Quasar takes the rest of an underpaid invoice only in the method that paid first: another one could only be refused
  const paysRest = (state.invoiceStatus ?? checkout?.invoice.status) === 'underpaid';
  const alternatives = useAlternatives(methods, quote, balanceCheck && Boolean(shortfall) && !paysRest);
  const [cannotConnect, setCannotConnect] = useState(false);
  // The wallet asks (the prompt below shows): on a phone the prompt keeps the height of the step
  const prompting =
    proof.step === 'switching' ||
    proof.step === 'signing' ||
    payment.status === 'switching' ||
    payment.status === 'submitting' ||
    payment.status === 'wallet' ||
    state.phase === 'submitting';
  const [stepRef, stepHeight] = useStepHeight(prompting);

  // The merchant turned the method of a locked price off: a page reloaded on it must not be an empty pane with no way on
  if (checkout && quote && !method) {
    return (
      <>
        <ScreenContent title={labels.method.methodUnavailable}>{null}</ScreenContent>
        <ScreenFooter>
          <SecondaryButton onClick={backToMethods}>{labels.pay.back}</SecondaryButton>
        </ScreenFooter>
      </>
    );
  }
  if (!checkout || !quote || !method) return null;

  const merchant = checkout.merchant.name;
  const network = networkName(chainId);
  const token = (amount: string) => `${formatTokenAmount(amount, quote.decimals, locale)} ${quote.instructions.symbol}`;
  const amounts = quoteAmounts(quote);
  // A request that waits in the wallet keeps its amount: under a new price the page must name what the wallet shows
  const inWallet = payment.askedInstructions;
  const askedAmount =
    inWallet && inWallet.amount !== quote.instructions.amount
      ? `${formatTokenAmount(inWallet.amount, inWallet.decimals, locale)} ${inWallet.symbol}`
      : token(amounts.send);
  const left = quote.expiresAt ? Date.parse(quote.expiresAt) - now : Number.POSITIVE_INFINITY;
  const expired = left <= 0;
  const ending = isQuoteEnding(left);
  const quoting = state.phase === 'quoting';
  const rate = checkout.invoice.amountPaid ? null : quoteRate(quote, checkout.invoice.totalMinor);
  // The rest of an underpaid invoice: what is sent is not the total of the invoice
  const rest = (state.invoiceStatus ?? checkout.invoice.status) === 'underpaid';
  const page = display === 'page';
  const feeAmount = fee ? formatFeeAmount(String(fee.amount), fee.decimals, locale) : null;
  const restRate = rest ? restRateText(quote, now, labels, merchant, locale) : null;
  const total = checkout.invoice.totalMinor ? formatFiat(minorToDecimal(checkout.invoice.totalMinor), locale) : null;
  const walletMatches = Boolean(wallet && quote.payer && payerFor(wallet, method) === quote.payer);
  const wrongNetwork = family === 'eip155' && wallet && wallet.chainId !== chainId && Boolean(adapter?.switchChain);
  const busy =
    payment.status !== 'idle' ||
    state.phase === 'submitting' ||
    quoting ||
    // Busy only while the wallet window of the confirmation is open: once closed, the buyer can ask again
    proof.step !== 'idle';
  const solanaNetwork = solanaNetworkHint(chainId, wallet, labels);
  const renew = () => void store.getState().requestQuote();
  // `payerProof` is newer than some `@tuwaio/quasar-sdk` alphas: read it as a string
  const payerProof: string | undefined = state.payerProof;
  const confirmFirst = needsPayerProof(payerProof, path);
  const proofError = confirmFirst
    ? payerProofErrorText(isConfirmationError(state.error) ? state.error : null, proof.problem, labels, {
        wallet: wallet?.name ?? '',
        network,
        merchant,
      })
    : null;
  // The confirmation's own failures show once, under it
  const shownError =
    state.phase === 'awaitingPayment' && !(confirmFirst && isConfirmationError(state.error)) ? state.error : undefined;
  const problem = problemText(labels, { wallet: wallet?.name ?? '', network, merchant }, payment.problem, shownError);
  // The last payment of this page ended without paying the invoice, and the screen says so: the button pays again
  const paysAgain =
    !payment.problem && (shownError?.code === 'payment_failed' || shownError?.code === 'payment_mismatch');

  // An app with neither Nova Connect nor a handler of its own: the control would do nothing, with no word why
  const connect = () => {
    if (!connectWallet(method)) setCannotConnect(true);
  };
  let action: { label: ReactNode; run: () => void; disabled?: boolean };
  if (expired) action = { label: rest ? labels.outcome.payRest : labels.pay.newPrice, run: renew };
  else if (!walletMatches) action = { label: labels.pay.connect, run: connect };
  else if (wrongNetwork)
    action = {
      label: <CapsLabel label={labels.pay.switchTo} values={{ network }} />,
      run: () => void payment.switchNetwork(),
    };
  else if (confirmFirst) action = { label: labels.payerProof.confirmToPay, run: () => void proof.confirm() };
  else {
    action = {
      // After a payment that ended without paying the invoice the button says what it does now; the amount is above it
      label: paysAgain ? (
        labels.pay.payAgain
      ) : (
        <CapsLabel
          label={path === 'transfer' ? labels.pay.payAmount : labels.pay.signToPay}
          values={{
            amount: token(amounts.send),
          }}
        />
      ),
      // `onSubmit` of the app wraps the wallet prompt
      run: () =>
        void (customization.handlers?.onSubmit
          ? customization.handlers.onSubmit({ quote, method, proceed: payment.pay })
          : payment.pay()),
      // Sent and not confirmed yet: another payment could pay the invoice twice
      disabled: Boolean(shortfall) || payment.problem === 'sentUnconfirmed',
    };
  }
  const prompt =
    proof.step === 'switching'
      ? 'switch'
      : proof.step === 'signing'
        ? 'proof'
        : payment.status === 'switching'
          ? 'switch'
          : payment.status === 'submitting' || state.phase === 'submitting'
            ? 'submitting'
            : payment.status === 'wallet'
              ? path === 'transfer'
                ? 'confirm'
                : 'sign'
              : null;
  const invoice = checkout.invoice.number ?? checkout.invoice.id;
  // The wallet that was asked, also once the buyer disconnected it while the request waits there
  const asked = wallet ?? payment.askedWallet;
  const proofValues = { wallet: asked?.name ?? '', invoice, merchant };

  return (
    <div className="novapay:relative novapay:flex novapay:flex-1 novapay:flex-col">
      {/* While the wallet asks, the step leaves the layout (keeping its state): the prompt takes its place */}
      <div
        ref={stepRef}
        inert={prompting}
        className={cn('novapay:flex novapay:flex-1 novapay:flex-col', prompting && 'novapay:hidden')}
      >
        <section
          className={cn(
            'novapay:flex novapay:flex-1 novapay:flex-col novapay:gap-3 novapay:px-5 novapay:py-4',
            page && 'novapay-page-screen novapay-page-pay',
          )}
        >
          <h2 {...screenHeading} className="novapay:sr-only">
            {labels.pay.title}
          </h2>

          {wallet && (
            <div className="novapay:flex novapay:items-center novapay:gap-2.5 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2">
              <span className="novapay:h-7 novapay:w-7 novapay:shrink-0">
                <CheckoutWalletIcon walletId={wallet.walletId} icon={wallet.icon} />
              </span>
              <span className="novapay:flex novapay:min-w-0 novapay:flex-1 novapay:flex-col">
                <span className="novapay:text-[13px] novapay:font-semibold">{wallet.name}</span>
                <span
                  className={cn(mono, 'novapay:truncate novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}
                >
                  {formatLabel(labels.pay.walletLine, {
                    address: shortAddress(wallet.address),
                    network: networkName(wallet.chainId),
                  })}
                </span>
              </span>
              <button type="button" aria-label={labels.pay.changeWallet} onClick={connect} className={smallAction}>
                {labels.pay.change}
              </button>
            </div>
          )}

          {wrongNetwork && walletMatches && !expired && (
            <div
              role="status"
              className={cn(pendingNote, 'novapay:flex novapay:gap-2 novapay:px-3 novapay:py-2 novapay:text-xs')}
            >
              <ExclamationTriangleIcon aria-hidden className="novapay:h-4 novapay:w-4 novapay:shrink-0" />
              <span>
                <strong className="novapay:block">{labels.pay.wrongNetwork}</strong>
                {formatLabel(labels.pay.wrongNetworkText, { current: networkName(wallet!.chainId), network })}{' '}
                {labels.pay.switchHint}
              </span>
            </div>
          )}

          {solanaNetwork && !expired && (
            <div className="novapay:flex novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2 novapay:text-xs">
              <InformationCircleIcon
                aria-hidden
                className="novapay:h-4 novapay:w-4 novapay:shrink-0 novapay:text-[var(--tuwa-text-secondary)]"
              />
              <span className="novapay:flex novapay:flex-col novapay:gap-0.5">
                <strong>{solanaNetwork.title}</strong>
                <span>{solanaNetwork.text}</span>
                {solanaNetwork.hint && (
                  <span className="novapay:text-[var(--tuwa-text-secondary)]">{solanaNetwork.hint}</span>
                )}
              </span>
            </div>
          )}

          <div>
            <span className={cn(label, 'novapay:block')}>{rest ? labels.pay.youSendRest : labels.pay.youSend}</span>
            <div className={cn('novapay:flex novapay:items-baseline novapay:gap-2', page && 'novapay-page-amount-row')}>
              <span
                className={cn(
                  mono,
                  'novapay:text-[28px] novapay:font-bold novapay:leading-tight',
                  page && 'novapay-page-amount',
                )}
              >
                {formatTokenAmount(amounts.send, quote.decimals, locale)}
              </span>
              <span className={cn(mono, 'novapay:text-sm novapay:font-semibold')}>{quote.instructions.symbol}</span>
              <CopyButton
                text={baseUnitsToDecimal(amounts.send, quote.decimals)}
                label={labels.pay.copyAmount}
                copiedLabel={labels.pay.copied}
              />
            </div>
            <span className="novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              {formatLabel(labels.pay.onNetwork, { network })}
              {total && !amounts.fee && !rest && (
                <> · {formatLabel(labels.pay.fiatValue, { amount: total, currency: checkout.invoice.currency })}</>
              )}
            </span>
          </div>

          {amounts.fee && (
            <div className="novapay:flex novapay:flex-col novapay:gap-1.5">
              <DetailsCard>
                <DetailRow name={rest ? labels.pay.invoiceRest : labels.pay.invoiceTotal}>
                  {formatTokenAmount(amounts.receives, quote.decimals, locale)}
                </DetailRow>
                <DetailRow name={formatLabel(labels.pay.transferFee, { percent: amounts.fee.percent })}>
                  {formatTokenAmount(amounts.fee.amount, quote.decimals, locale)}
                </DetailRow>
                <DetailRow name={formatLabel(labels.pay.merchantReceives, { merchant })}>
                  {token(amounts.receives)}
                </DetailRow>
              </DetailsCard>
              <p className="novapay:m-0 novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
                {labels.pay.transferFeeNote}
              </p>
            </div>
          )}

          {!expired && (
            <div className="novapay:flex novapay:items-center novapay:gap-2 novapay:text-xs">
              <ClockIcon aria-hidden className="novapay:h-4 novapay:w-4 novapay:text-[var(--tuwa-text-secondary)]" />
              <span role="timer" aria-live="off" className="novapay:flex-1">
                {formatLabel(restRate ? labels.pay.restTimeLeft : labels.pay.priceLocked, {
                  time: formatCountdown(left),
                })}
              </span>
              {!rest && (
                <FooterAction disabled={quoting} onClick={renew}>
                  {labels.pay.refreshPrice}
                </FooterAction>
              )}
            </div>
          )}

          {ending && !restRate && (
            <div className="novapay:flex novapay:flex-col novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-text-accent)] novapay:px-3 novapay:py-2">
              <span aria-hidden className="novapay:text-xs">
                {formatLabel(labels.pay.priceEnding, { time: formatCountdown(left) })}
              </span>
              {/* Announced once when the last minute starts, not every second */}
              <span role="status" className="novapay:sr-only">
                {formatLabel(labels.pay.priceEnding, { time: formatCountdown(QUOTE_WARNING_MS) })}
              </span>
              <button type="button" onClick={renew} disabled={quoting} className={smallPrimaryAction}>
                <CapsLabel
                  label={labels.pay.keepPrice}
                  values={{ minutes: Math.round(checkout.quoteTtlSeconds / 60) }}
                />
              </button>
            </div>
          )}

          {expired && <ScreenError>{labels.pay.priceExpired}</ScreenError>}
          {restRate && (
            <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">{restRate}</p>
          )}

          {shortfall && !expired && (
            <div className="novapay:flex novapay:flex-col novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2 novapay:text-xs">
              <div role="alert">
                <strong className="novapay:block">{labels.pay.notEnough}</strong>
                {formatLabel(labels.pay.walletHas, { amount: token(shortfall.have), network })}.{' '}
                {formatLabel(labels.pay.shortBy, { short: token(shortfall.short), need: token(shortfall.need) })}
              </div>
              {alternatives.length > 0 && (
                <div className="novapay:flex novapay:flex-col novapay:gap-1.5">
                  <span className="novapay:text-[var(--tuwa-text-secondary)]">{labels.pay.payFromBalance}</span>
                  {alternatives.map(({ method: other, balance: held }) => (
                    <button
                      key={other.id}
                      type="button"
                      onClick={() => {
                        const payer = wallet ? payerFor(wallet, other) : null;
                        store.getState().selectMethod(other.id);
                        store.getState().setPayer(payer);
                        // A smart wallet confirms the invoice again on another network, before the price
                        void lockPrice();
                      }}
                      className={cn(
                        'novapay:flex novapay:cursor-pointer novapay:items-center novapay:justify-between novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-transparent novapay:px-2.5 novapay:py-1.5 novapay:text-left novapay:text-xs novapay:text-[var(--tuwa-text-primary)] novapay:hover:bg-[var(--tuwa-bg-muted)]',
                        focusRing,
                      )}
                    >
                      <span className="novapay:font-semibold">
                        {other.symbol} · {networkName(other.chainId)}
                      </span>
                      <span className={cn(mono, 'novapay:text-[var(--tuwa-text-secondary)]')}>
                        {formatLabel(labels.pay.youHave, {
                          amount: `${formatTokenAmount(String(held), other.decimals, locale)} ${other.symbol}`,
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {checkout.merchant.fundingUrl && (
                <span>
                  {formatLabel(labels.pay.topUp, { symbol: quote.instructions.symbol })}{' '}
                  <a
                    href={checkout.merchant.fundingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn('novapay:text-[var(--tuwa-text-accent)] novapay:underline', focusRing)}
                  >
                    {formatLabel(labels.pay.getToken, { symbol: quote.instructions.symbol })} ↗
                  </a>
                </span>
              )}
            </div>
          )}

          <DetailsCard>
            {rate !== null && (
              <DetailRow name={labels.pay.rate}>
                {formatLabel(labels.pay.rateValue, {
                  symbol: quote.instructions.symbol,
                  price: formatRate(rate, locale),
                  currency: checkout.invoice.currency,
                })}
              </DetailRow>
            )}
            <DetailRow name={labels.pay.networkFee}>
              <span className="novapay:inline-flex novapay:flex-col novapay:items-end novapay:gap-0.5">
                {path !== 'transfer' ? (
                  <span className="novapay:text-[var(--tuwa-success-text)]">
                    {formatLabel(labels.pay.merchantPaysGas, { merchant })}
                  </span>
                ) : feeAmount ? (
                  formatLabel(labels.pay.gasEstimate, { amount: `${feeAmount} ${fee?.symbol}` })
                ) : (
                  labels.pay.gasFromWallet
                )}
                {/* Who pays the gas is chosen where the fee shows */}
                {quote.gasless && (
                  <FooterAction onClick={() => setWithGas(!withGas)}>
                    {withGas ? formatLabel(labels.pay.payGasless, { merchant }) : labels.pay.payWithGas}
                  </FooterAction>
                )}
              </span>
            </DetailRow>
            <DetailRow name={labels.pay.to}>
              <ChainLink hash={quote.instructions.to} chainId={chainId} />
              <span className="novapay:font-sans novapay:text-[var(--tuwa-text-secondary)]">{merchant}</span>
            </DetailRow>
          </DetailsCard>

          {confirmFirst && !expired && (
            <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              {labels.payerProof.payNote}
            </p>
          )}
          {proofError && <ScreenError>{proofError}</ScreenError>}
          {problem && <ScreenError>{problem}</ScreenError>}
          {/* What the wallet sent, to look at: the refusal of a payment names its transaction when the network has it */}
          {!payment.problem && <FailedTransaction error={shownError} />}
          {cannotConnect && <ScreenError>{labels.pay.connectUnavailable}</ScreenError>}
        </section>

        <ScreenFooter>
          <PrimaryButton busy={busy} disabled={action.disabled} onClick={action.run}>
            {action.label}
          </PrimaryButton>
          {/* A new price is on its way and would open this step again a moment later */}
          <SecondaryButton disabled={quoting} onClick={backToMethods}>
            {rest ? labels.pay.backFromRest : labels.pay.back}
          </SecondaryButton>
          <FooterNote>
            {sentences(
              formatLabel(labels.pay.disclaimer, { merchant }),
              // Only a merchant that checks paying wallets says so (an older Quasar always did)
              ...(screensPayingWallets(checkout) ? [formatLabel(labels.pay.disclaimerScreening, { merchant })] : []),
            )}
          </FooterNote>
          <AutoPayNote />
        </ScreenFooter>
      </div>

      {prompt === 'proof' && (
        <WalletPrompt
          kind="proof"
          walletName={asked?.name ?? ''}
          walletId={asked?.walletId ?? ''}
          walletIcon={asked?.icon}
          amount={askedAmount}
          merchant={merchant}
          network={network}
          to={shortAddress(quote.instructions.to)}
          priceTime={null}
          text={formatLabel(
            isSmartWallet(wallet) ? labels.payerProof.promptPasskey : labels.payerProof.promptText,
            proofValues,
          )}
          details={[
            ...(proof.request ? [{ name: labels.payerProof.site, value: proof.request.domain }] : []),
            { name: labels.payerProof.invoice, value: invoice },
            { name: labels.payerProof.merchant, value: merchant },
          ]}
          hint={
            proof.request
              ? formatLabel(labels.payerProof.signInRequest, { wallet: asked?.name ?? '', site: proof.request.domain })
              : undefined
          }
          onRetry={() => void proof.confirm()}
          onCancel={proof.dismiss}
          stepHeight={stepHeight}
        />
      )}
      {prompt && prompt !== 'proof' && (
        <WalletPrompt
          kind={prompt}
          walletName={asked?.name ?? ''}
          walletId={asked?.walletId ?? ''}
          walletIcon={asked?.icon}
          amount={askedAmount}
          merchant={merchant}
          network={network}
          to={shortAddress(quote.instructions.to)}
          priceTime={expired ? null : formatCountdown(left)}
          onRetry={path === 'relay' ? () => void payment.pay() : undefined}
          onCancel={proof.step === 'switching' ? proof.dismiss : payment.dismiss}
          stepHeight={stepHeight}
        />
      )}
    </div>
  );
}
