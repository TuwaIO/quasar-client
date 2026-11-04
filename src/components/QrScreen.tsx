import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { baseUnitsToDecimal, formatCountdown, formatTokenAmount, shortAddress } from '../utils/format';
import { networkName } from '../utils/methods';
import { addressOfWallet, restRateText } from '../utils/outcome';
import { instructionsChainId } from '../utils/pay';
import { mono, primaryAction } from './classes';
import { checkoutClassName } from './customization';
import { QrCode } from './QrCode';
import { CopyButton, PrimaryButton, ScreenContent, ScreenError, ScreenFooter, SecondaryButton } from './ScreenParts';

/** The phone hand-off of an EVM method: the QR code of the payment page, where the phone's wallet pays. */
function HandoffQr({ payUrl }: { payUrl: string }) {
  const { labels, backToMethods } = useCheckoutContext();
  return (
    <>
      <ScreenContent title={labels.qr.handoffTitle} subtitle={labels.qr.handoffHint}>
        <div className="novapay:flex novapay:flex-col novapay:items-center novapay:gap-3 novapay:py-2">
          <QrCode value={payUrl} label={labels.qr.handoffCode} className="novapay:h-48 novapay:w-48" />
          <CopyButton text={payUrl} label={labels.qr.copyLink} copiedLabel={labels.pay.copied}>
            {labels.qr.copyLink}
          </CopyButton>
          <p className="novapay:m-0 novapay:max-w-xs novapay:text-center novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {labels.qr.handoffNote}
          </p>
        </div>
      </ScreenContent>
      <ScreenFooter>
        <SecondaryButton onClick={backToMethods}>{labels.qr.back}</SecondaryButton>
      </ScreenFooter>
    </>
  );
}

/**
 * The QR code step. For Solana, a Solana Pay transfer request a phone wallet scans (or opens with "Open in wallet
 * app"), with the exact amount, the recipient, the price lock and a warning against paying from an exchange; the page
 * waits for the payment, which Quasar finds by the reference key. For an EVM method, the QR code of the payment page
 * opens this checkout on the phone, before any price.
 *
 * @returns The QR code step.
 */
export function QrScreen() {
  const context = useCheckoutContext();
  const { checkout, state, store, labels, locale, now, payUrl, backToMethods } = context;
  const quote = state.quote;
  if (!checkout) return null;
  if (!quote || quote.instructions.family !== 'solana') return payUrl ? <HandoffQr payUrl={payUrl} /> : null;

  const { instructions } = quote;
  const network = networkName(instructionsChainId(instructions));
  const amount = `${formatTokenAmount(quote.amountToSend, quote.decimals, locale)} ${instructions.symbol}`;
  const left = quote.expiresAt ? Date.parse(quote.expiresAt) - now : Number.POSITIVE_INFINITY;
  const expired = left <= 0;
  const quoting = state.phase === 'quoting';
  // The rest of an underpaid invoice: what is sent is not the total of the invoice
  const rest = (state.invoiceStatus ?? checkout.invoice.status) === 'underpaid';
  const restRate = rest ? restRateText(quote, now, labels, checkout.merchant.name, locale) : null;
  // Another sender's transfer is held for a refund, so the hint names the wallet that paid first
  const firstWallet = rest ? checkout.invoice.originWallet : null;
  const hint = firstWallet
    ? formatLabel(labels.qr.restHint, { wallet: shortAddress(addressOfWallet(firstWallet)) })
    : labels.qr.solanaHint;

  return (
    <>
      <ScreenContent title={labels.qr.solanaTitle} subtitle={hint}>
        {/* Side by side when the screen area has the room (from 440 px), not by the width of the window */}
        <div className="novapay:flex novapay:flex-col novapay:items-center novapay:gap-4 novapay:@min-[440px]:flex-row novapay:@min-[440px]:items-start">
          <QrCode
            value={instructions.solanaPayUrl}
            label={formatLabel(labels.qr.solanaCode, { amount })}
            className={cn('novapay:h-44 novapay:w-44 novapay:shrink-0', expired && 'novapay:opacity-30')}
          />
          {/* On a phone the facts take the width of the screen under the code, aligned with the rest of it */}
          <div className="novapay:flex novapay:min-w-0 novapay:flex-col novapay:gap-2 novapay:self-stretch novapay:text-xs novapay:@min-[440px]:self-auto">
            <ol className="novapay:m-0 novapay:flex novapay:list-decimal novapay:flex-col novapay:gap-1 novapay:pl-4">
              <li>{labels.qr.scanStep}</li>
              <li>{labels.qr.approveStep}</li>
            </ol>
            {rest && <span className="novapay:text-[var(--tuwa-text-secondary)]">{labels.pay.youSendRest}</span>}
            <div className="novapay:flex novapay:items-baseline novapay:gap-2">
              <span className={cn(mono, 'novapay:text-2xl novapay:font-bold')}>
                {formatTokenAmount(quote.amountToSend, quote.decimals, locale)}
              </span>
              <CopyButton
                text={baseUnitsToDecimal(quote.amountToSend, quote.decimals)}
                label={labels.pay.copyAmount}
                copiedLabel={labels.pay.copied}
              />
            </div>
            <span className={cn(mono, 'novapay:text-[var(--tuwa-text-secondary)]')}>
              {instructions.symbol} · {network} · {shortAddress(instructions.to)}
            </span>
            {!expired && (
              <>
                <span role="status" className="novapay:flex novapay:items-center novapay:gap-1.5">
                  <ArrowPathIcon
                    aria-hidden
                    className="novapay:h-3.5 novapay:w-3.5 novapay:animate-spin novapay:motion-reduce:animate-none"
                  />
                  {labels.qr.waiting}
                </span>
                <span role="timer" aria-live="off" className="novapay:text-[var(--tuwa-text-secondary)]">
                  {formatLabel(restRate ? labels.pay.restTimeLeft : labels.pay.priceLocked, {
                    time: formatCountdown(left),
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        {expired && <ScreenError>{labels.pay.priceExpired}</ScreenError>}
        {restRate && (
          <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">{restRate}</p>
        )}
        <p className="novapay:m-0 novapay:flex novapay:gap-2 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:bg-[var(--tuwa-pending-bg)] novapay:px-3 novapay:py-2 novapay:text-xs novapay:text-[var(--tuwa-pending-text)]">
          <ExclamationTriangleIcon aria-hidden className="novapay:h-4 novapay:w-4 novapay:shrink-0" />
          {labels.qr.exchangeWarning}
        </p>
      </ScreenContent>
      <ScreenFooter>
        {expired ? (
          <PrimaryButton busy={quoting} onClick={() => void store.getState().requestQuote()}>
            {rest ? labels.outcome.payRest : labels.pay.newPrice}
          </PrimaryButton>
        ) : (
          <a
            href={instructions.solanaPayUrl}
            className={cn(primaryAction, checkoutClassName(context, 'primaryButton'))}
          >
            {labels.qr.openInWallet}
          </a>
        )}
        <SecondaryButton onClick={backToMethods}>{rest ? labels.pay.backFromRest : labels.qr.back}</SecondaryButton>
      </ScreenFooter>
    </>
  );
}
