import { cn, QuasarLoader } from '@tuwaio/nova-core';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { eip681Of } from '../utils/eip681';
import { baseUnitsToDecimal, formatCountdown, formatTokenAmount, shortAddress } from '../utils/format';
import { networkName } from '../utils/methods';
import { addressOfWallet, restRateText } from '../utils/outcome';
import { instructionsChainId } from '../utils/pay';
import { payeeStatus } from '../utils/payee';
import { mono, pendingNote, primaryAction } from './classes';
import { checkoutClassName } from './customization';
import { ExclamationTriangleIcon } from './icons';
import { PayeeScreen } from './PayeeScreen';
import { QrCode } from './QrCode';
import {
  ChainLink,
  CopyButton,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
  SecondaryButton,
} from './ScreenParts';

/** The phone hand-off of an EVM method: the QR code of the payment page, where the phone's wallet pays. */
function HandoffQr({ payUrl }: { payUrl: string }) {
  const { labels, backToMethods, display } = useCheckoutContext();
  return (
    <>
      <ScreenContent title={labels.qr.handoffTitle} subtitle={labels.qr.handoffHint}>
        <div className="novapay:flex novapay:flex-col novapay:items-center novapay:gap-3 novapay:py-2">
          <QrCode
            value={payUrl}
            label={labels.qr.handoffCode}
            className={cn('novapay:h-48 novapay:w-48', display === 'page' && 'novapay-page-qr-handoff')}
          />
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
 * waits for the payment, which Quasar finds by the reference key. For an EVM quote to an invoice's own address, an
 * EIP-681 request of the same kind, which an exchange may pay too: Quasar finds the payment by the address. For another
 * EVM method, the QR code of the payment page opens this checkout on the phone, before any price.
 *
 * @returns The QR code step.
 */
export function QrScreen() {
  const context = useCheckoutContext();
  const { checkout, state, store, labels, locale, now, payUrl, backToMethods } = context;
  const quote = state.quote;
  if (!checkout) return null;
  // A price of an invoice's own address is paid by its EIP-681 request; another EVM method on the phone's checkout
  const ownAddress = quote?.instructions.family === 'eip155' && Boolean(quote.invoiceAddress);
  if (!quote || (quote.instructions.family !== 'solana' && !ownAddress)) {
    return payUrl ? <HandoffQr payUrl={payUrl} /> : null;
  }
  // Neither the code nor the address of a price whose payee is not verified shows
  const payee = payeeStatus(state);
  if (payee.status !== 'verified' && state.phase !== 'submitting') return <PayeeScreen payee={payee} />;

  const { instructions } = quote;
  const solana = instructions.family === 'solana';
  // What the code holds and the wallet app opens: the Solana Pay request, else the EIP-681 one
  const request = solana ? instructions.solanaPayUrl : eip681Of(instructions, quote.amountToSend);
  const network = networkName(instructionsChainId(instructions));
  const amount = `${formatTokenAmount(quote.amountToSend, quote.decimals, locale)} ${instructions.symbol}`;
  const left = quote.expiresAt ? Date.parse(quote.expiresAt) - now : Number.POSITIVE_INFINITY;
  const expired = left <= 0;
  const quoting = state.phase === 'quoting';
  // The rest of an underpaid invoice: what is sent is not the total of the invoice
  const rest = (state.invoiceStatus ?? checkout.invoice.status) === 'underpaid';
  const restRate = rest ? restRateText(quote, now, labels, checkout.merchant.name, locale) : null;
  // Another sender's transfer is an unmatched transfer, refunded only, so the hint names the wallet that paid first
  const firstWallet = rest ? checkout.invoice.originWallet : null;
  const hint = firstWallet
    ? formatLabel(labels.qr.restHint, { wallet: shortAddress(addressOfWallet(firstWallet)) })
    : solana
      ? labels.qr.solanaHint
      : labels.qr.evmHint;

  return (
    <>
      <ScreenContent title={solana ? labels.qr.solanaTitle : labels.qr.evmTitle} subtitle={hint}>
        {/* Side by side when the screen area has the room (from 440 px), not by the width of the window */}
        <div className="novapay:flex novapay:flex-col novapay:items-center novapay:gap-4 novapay:@min-[440px]:flex-row novapay:@min-[440px]:items-start">
          <QrCode
            value={request}
            label={formatLabel(solana ? labels.qr.solanaCode : labels.qr.evmCode, { amount })}
            className={cn(
              'novapay:h-44 novapay:w-44 novapay:shrink-0',
              context.display === 'page' && 'novapay-page-qr',
              expired && 'novapay:opacity-30',
            )}
          />
          {/* On a phone the facts take the width of the screen under the code, aligned with the rest of it */}
          <div className="novapay:flex novapay:min-w-0 novapay:flex-col novapay:gap-2 novapay:self-stretch novapay:text-xs novapay:@min-[440px]:self-auto">
            <ol className="novapay:m-0 novapay:flex novapay:list-decimal novapay:flex-col novapay:gap-1 novapay:pl-4">
              <li>{solana ? labels.qr.scanStep : labels.qr.evmScanStep}</li>
              <li>{labels.qr.approveStep}</li>
            </ol>
            {rest && <span className="novapay:text-[var(--tuwa-text-secondary)]">{labels.pay.youSendRest}</span>}
            {/* An amount of ETH to 18 decimals pushed its copy button out of the card: the row wraps, the amount breaks
                anywhere when even alone it is too wide, and the button keeps its size */}
            <div
              data-amount-row
              className="novapay:flex novapay:flex-wrap novapay:items-baseline novapay:gap-x-2 novapay:gap-y-1"
            >
              <span
                className={cn(
                  mono,
                  'novapay:min-w-0 novapay:text-2xl novapay:font-bold novapay:[overflow-wrap:anywhere]',
                )}
              >
                {formatTokenAmount(quote.amountToSend, quote.decimals, locale)}
              </span>
              <span className="novapay:inline-flex novapay:shrink-0">
                <CopyButton
                  text={baseUnitsToDecimal(quote.amountToSend, quote.decimals)}
                  label={labels.pay.copyAmount}
                  copiedLabel={labels.pay.copied}
                />
              </span>
            </div>
            {/* Each part in one piece with its "·", wrapping only between them: the address broke over two lines with a
                "·" at the start of the second (owner test 2026-11-09, finding 2) */}
            <div
              data-qr-line
              className={cn(
                mono,
                'novapay:flex novapay:flex-wrap novapay:items-center novapay:gap-x-1 novapay:gap-y-0.5 novapay:text-[var(--tuwa-text-secondary)]',
              )}
            >
              <span data-qr-part className="novapay:whitespace-nowrap">
                {instructions.symbol} ·
              </span>
              <span data-qr-part className="novapay:whitespace-nowrap">
                {network} ·
              </span>
              <span data-qr-part className="novapay:whitespace-nowrap">
                <ChainLink hash={instructions.to} chainId={instructionsChainId(instructions)} />
              </span>
            </div>
            {!expired && (
              <>
                <span role="status" className="novapay:flex novapay:items-center novapay:gap-1.5">
                  <QuasarLoader size={14} accent="var(--tuwa-pending-icon)" />
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
        {solana ? (
          <p
            className={cn(
              pendingNote,
              'novapay:m-0 novapay:flex novapay:gap-2 novapay:px-3 novapay:py-2 novapay:text-xs',
            )}
          >
            <ExclamationTriangleIcon aria-hidden className="novapay:h-4 novapay:w-4 novapay:shrink-0" />
            {labels.qr.exchangeWarning}
          </p>
        ) : (
          // The address is this invoice's alone: a transfer from an exchange pays it as well
          <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {labels.qr.exchangeAllowed}
          </p>
        )}
      </ScreenContent>
      <ScreenFooter>
        {expired ? (
          <PrimaryButton busy={quoting} onClick={() => void store.getState().requestQuote()}>
            {rest ? labels.outcome.payRest : labels.pay.newPrice}
          </PrimaryButton>
        ) : (
          <a href={request} className={cn(primaryAction, checkoutClassName(context, 'primaryButton'))}>
            {labels.qr.openInWallet}
          </a>
        )}
        <SecondaryButton onClick={backToMethods}>{rest ? labels.pay.backFromRest : labels.qr.back}</SecondaryButton>
      </ScreenFooter>
    </>
  );
}
