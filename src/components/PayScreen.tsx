import { ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn, WalletIcon } from '@tuwaio/nova-core';
import type { CheckoutMethod, CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import { useState } from 'react';

import { useAsyncValue } from '../hooks/useAsyncValue';
import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { usePayment } from '../hooks/usePayment';
import { formatLabel, type NovaPaymentsLabels } from '../i18n';
import { isQuoteEnding, QUOTE_WARNING_MS } from '../utils/checkout';
import {
  baseUnitsToDecimal,
  formatCountdown,
  formatFiat,
  formatTokenAmount,
  minorToDecimal,
  shortAddress,
} from '../utils/format';
import { methodFamily, methodToken, networkName, payerFor } from '../utils/methods';
import { balanceShortfall, instructionsChainId, payPath, quoteAmounts, quoteRate } from '../utils/pay';
import type { PaymentWalletErrorKind } from '../utils/walletErrors';
import { focusRing, mono } from './classes';
import { CopyButton, DetailRow, FooterAction, PrimaryButton, ScreenError, ScreenFooter } from './ScreenParts';
import { WalletPrompt } from './WalletPrompt';

/** A price shown with up to two decimals, or more significant digits under one unit of the currency. */
function formatRate(rate: number, locale: string): string {
  if (rate >= 1) return formatFiat(rate, locale);
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(rate);
}

/** The text of a refusal of the wallet or of Quasar, with the action that follows it. */
function problemText(
  labels: NovaPaymentsLabels,
  values: { wallet: string; network: string },
  problem: PaymentWalletErrorKind | null,
  errorCode: string | undefined,
): string | null {
  if (problem === 'declined') return formatLabel(labels.pay.declined, values);
  if (problem === 'unsupported') return formatLabel(labels.pay.unsupported, values);
  if (problem === 'failed' || errorCode === 'payment_failed') return formatLabel(labels.pay.failed, values);
  if (errorCode === 'screening_unavailable') return labels.pay.screeningUnavailable;
  if (errorCode === 'request_failed') return labels.pay.noAnswer;
  return null;
}

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
 * on the wrong network. Before the prompt it reads the wallet's balance and, when it is short, offers the methods
 * the wallet can pay and the seller's top-up link.
 *
 * Side effects: balance, fee and wallet capability reads from the network through the chain adapter (no request to
 * Quasar); wallet prompts; checkout requests to Quasar.
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
  } = useCheckoutContext();
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
  const balance = useAsyncValue(
    quote && adapter && wallet ? `${chainId}:${account}:${quote.instructions.token}` : null,
    () => adapter!.getBalance({ chainId, account, token: quote!.instructions.token }),
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
    onSent: onPaymentSent,
  });
  const native = quote?.instructions.token === 'native';
  const shortfall =
    quote && typeof balance === 'bigint' ? balanceShortfall(balance, quote, native && fee ? fee.amount : 0n) : null;
  const alternatives = useAlternatives(methods, quote, Boolean(shortfall));

  if (!checkout || !quote || !method) return null;

  const merchant = checkout.merchant.name;
  const network = networkName(chainId);
  const token = (amount: string) => `${formatTokenAmount(amount, quote.decimals, locale)} ${quote.instructions.symbol}`;
  const amounts = quoteAmounts(quote);
  const left = quote.expiresAt ? Date.parse(quote.expiresAt) - now : Number.POSITIVE_INFINITY;
  const expired = left <= 0;
  const ending = isQuoteEnding(left);
  const quoting = state.phase === 'quoting';
  const rate = checkout.invoice.amountPaid ? null : quoteRate(quote, checkout.invoice.totalMinor);
  const total = checkout.invoice.totalMinor ? formatFiat(minorToDecimal(checkout.invoice.totalMinor), locale) : null;
  const walletMatches = Boolean(wallet && quote.payer && payerFor(wallet, method) === quote.payer);
  const wrongNetwork = family === 'eip155' && wallet && wallet.chainId !== chainId && Boolean(adapter?.switchChain);
  const busy = payment.status !== 'idle' || state.phase === 'submitting' || quoting;
  const problem = problemText(
    labels,
    { wallet: wallet?.name ?? '', network },
    payment.problem,
    state.phase === 'awaitingPayment' ? state.error?.code : undefined,
  );
  const renew = () => void store.getState().requestQuote();

  let action: { label: string; run: () => void; disabled?: boolean };
  if (expired) action = { label: labels.pay.newPrice, run: renew };
  else if (!walletMatches) action = { label: labels.pay.connect, run: () => void connectWallet(method) };
  else if (wrongNetwork)
    action = { label: formatLabel(labels.pay.switchTo, { network }), run: () => void payment.switchNetwork() };
  else {
    action = {
      label: formatLabel(path === 'transfer' ? labels.pay.payAmount : labels.pay.signToPay, {
        amount: token(amounts.send),
      }),
      run: () => void payment.pay(),
      disabled: Boolean(shortfall),
    };
  }
  const prompt =
    payment.status === 'switching'
      ? 'switch'
      : payment.status === 'submitting' || state.phase === 'submitting'
        ? 'submitting'
        : payment.status === 'wallet'
          ? path === 'transfer'
            ? 'confirm'
            : 'sign'
          : null;

  return (
    <div className="novapay:relative novapay:flex novapay:flex-1 novapay:flex-col">
      <div inert={prompt !== null} className="novapay:flex novapay:flex-1 novapay:flex-col">
        <section className="novapay:flex novapay:flex-1 novapay:flex-col novapay:gap-3 novapay:px-5 novapay:py-4">
          <h2 className="novapay:sr-only">{labels.pay.title}</h2>

          {wallet && (
            <div className="novapay:flex novapay:items-center novapay:gap-2.5 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2">
              <span className="novapay:h-7 novapay:w-7 novapay:shrink-0">
                <WalletIcon walletName={wallet.walletId} />
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
              <button
                type="button"
                aria-label={labels.pay.changeWallet}
                onClick={() => connectWallet(method)}
                className={cn(
                  'novapay:min-h-6 novapay:cursor-pointer novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-transparent novapay:px-2.5 novapay:py-1 novapay:text-xs novapay:font-semibold novapay:text-[var(--tuwa-text-primary)] novapay:hover:bg-[var(--tuwa-bg-muted)]',
                  focusRing,
                )}
              >
                {labels.pay.change}
              </button>
            </div>
          )}

          {wrongNetwork && walletMatches && !expired && (
            <div
              role="status"
              className="novapay:flex novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:bg-[var(--tuwa-pending-bg)] novapay:px-3 novapay:py-2 novapay:text-xs novapay:text-[var(--tuwa-pending-text)]"
            >
              <ExclamationTriangleIcon aria-hidden className="novapay:h-4 novapay:w-4 novapay:shrink-0" />
              <span>
                <strong className="novapay:block">{labels.pay.wrongNetwork}</strong>
                {formatLabel(labels.pay.wrongNetworkText, { current: networkName(wallet!.chainId), network })}{' '}
                {labels.pay.switchHint}
              </span>
            </div>
          )}

          <div>
            <span className="novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">{labels.pay.youSend}</span>
            <div className="novapay:flex novapay:items-baseline novapay:gap-2">
              <span className={cn(mono, 'novapay:text-[28px] novapay:font-bold novapay:leading-tight')}>
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
              {total && !amounts.fee && (
                <> · {formatLabel(labels.pay.fiatValue, { amount: total, currency: checkout.invoice.currency })}</>
              )}
            </span>
          </div>

          {amounts.fee && (
            <div className="novapay:flex novapay:flex-col novapay:gap-1 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:px-3 novapay:py-2">
              <dl className="novapay:m-0 novapay:flex novapay:flex-col novapay:gap-1">
                <DetailRow name={labels.pay.invoiceTotal}>
                  {formatTokenAmount(amounts.receives, quote.decimals, locale)}
                </DetailRow>
                <DetailRow name={formatLabel(labels.pay.transferFee, { percent: amounts.fee.percent })}>
                  {formatTokenAmount(amounts.fee.amount, quote.decimals, locale)}
                </DetailRow>
                <DetailRow name={formatLabel(labels.pay.merchantReceives, { merchant })}>
                  {token(amounts.receives)}
                </DetailRow>
              </dl>
              <p className="novapay:m-0 novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
                {labels.pay.transferFeeNote}
              </p>
            </div>
          )}

          {!expired && (
            <div className="novapay:flex novapay:items-center novapay:gap-2 novapay:text-xs">
              <ClockIcon aria-hidden className="novapay:h-4 novapay:w-4 novapay:text-[var(--tuwa-text-secondary)]" />
              <span role="timer" aria-live="off" className="novapay:flex-1">
                {formatLabel(labels.pay.priceLocked, { time: formatCountdown(left) })}
              </span>
              <FooterAction onClick={renew}>{labels.pay.refreshPrice}</FooterAction>
            </div>
          )}

          {ending && (
            <div className="novapay:flex novapay:flex-col novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-text-accent)] novapay:px-3 novapay:py-2">
              <span aria-hidden className="novapay:text-xs">
                {formatLabel(labels.pay.priceEnding, { time: formatCountdown(left) })}
              </span>
              {/* Announced once when the last minute starts, not every second */}
              <span role="status" className="novapay:sr-only">
                {formatLabel(labels.pay.priceEnding, { time: formatCountdown(QUOTE_WARNING_MS) })}
              </span>
              <button
                type="button"
                onClick={renew}
                disabled={quoting}
                className={cn(
                  mono,
                  'novapay:min-h-8 novapay:cursor-pointer novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border-0 novapay:bg-[var(--tuwa-button-primary-bg)] novapay:px-3 novapay:text-xs novapay:font-bold novapay:text-[var(--tuwa-text-on-accent)] novapay:disabled:opacity-70',
                  focusRing,
                )}
              >
                {formatLabel(labels.pay.keepPrice, { minutes: Math.round(checkout.quoteTtlSeconds / 60) })}
              </button>
            </div>
          )}

          {expired && <ScreenError>{labels.pay.priceExpired}</ScreenError>}

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
                        void store.getState().requestQuote();
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

          <dl className="novapay:m-0 novapay:flex novapay:flex-col novapay:gap-1.5 novapay:border-t novapay:border-[var(--tuwa-border-primary)] novapay:pt-3">
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
              {path !== 'transfer' ? (
                <span className="novapay:text-[var(--tuwa-success-text)]">
                  {formatLabel(labels.pay.merchantPaysGas, { merchant })}
                </span>
              ) : fee ? (
                formatLabel(labels.pay.gasEstimate, {
                  amount: `${formatTokenAmount(String(fee.amount), fee.decimals, locale)} ${fee.symbol}`,
                })
              ) : (
                labels.pay.gasFromWallet
              )}
            </DetailRow>
            <DetailRow name={labels.pay.to}>
              {shortAddress(quote.instructions.to)}{' '}
              <span className="novapay:font-sans novapay:text-[var(--tuwa-text-secondary)]">{merchant}</span>
            </DetailRow>
          </dl>

          {problem && <ScreenError>{problem}</ScreenError>}
        </section>

        <ScreenFooter>
          <PrimaryButton busy={busy} disabled={action.disabled} onClick={action.run}>
            {action.label}
          </PrimaryButton>
          <div className="novapay:flex novapay:items-center novapay:justify-between novapay:gap-3">
            <FooterAction onClick={backToMethods}>{labels.pay.back}</FooterAction>
            {quote.gasless && (
              <FooterAction onClick={() => setWithGas(!withGas)}>
                {withGas ? formatLabel(labels.pay.payGasless, { merchant }) : labels.pay.payWithGas}
              </FooterAction>
            )}
          </div>
          <p className="novapay:m-0 novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
            {formatLabel(labels.pay.disclaimer, { merchant })}
          </p>
        </ScreenFooter>
      </div>

      {prompt && (
        <WalletPrompt
          kind={prompt}
          walletName={wallet?.name ?? ''}
          walletId={wallet?.walletId ?? ''}
          amount={token(amounts.send)}
          merchant={merchant}
          network={network}
          to={shortAddress(quote.instructions.to)}
          priceTime={expired ? null : formatCountdown(left)}
          onRetry={path === 'relay' ? () => void payment.pay() : undefined}
          onCancel={payment.dismiss}
        />
      )}
    </div>
  );
}
