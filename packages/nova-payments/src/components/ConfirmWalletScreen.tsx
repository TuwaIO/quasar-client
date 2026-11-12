import { cn, WalletIcon } from '@tuwaio/nova-core';
import { useEffect, useRef, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { usePayerProof } from '../hooks/usePayerProof';
import { useStepHeight } from '../hooks/useStepHeight';
import { formatLabel } from '../i18n';
import { formatFiat, minorToDecimal, shortAddress } from '../utils/format';
import { methodFamily, networkName, payerFor } from '../utils/methods';
import { addressOfWallet, isSameWallet } from '../utils/outcome';
import { isConfirmationError, isSmartWallet, payerProofErrorText } from '../utils/payerProof';
import { capsLabel } from './capsLabel';
import { mono, smallAction } from './classes';
import { FingerPrintIcon } from './icons';
import {
  ChainLink,
  DetailRow,
  DetailsCard,
  FooterNote,
  GroupLabel,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
  SecondaryButton,
} from './ScreenParts';
import { WalletPrompt } from './WalletPrompt';

/**
 * The step that confirms the paying wallet, right after the wallet and the method and before
 * the price, for an EVM payment the buyer's wallet sends itself (`payerProof` of the checkout store is `required`): one
 * sentence that it is free and moves no money, the summary of what the wallet signs (the invoice, the seller, the
 * amount and the wallet), and the main button that opens the wallet's signature request. Meanwhile the window of the
 * wallet covers the step, with the site the message names to check, a line that the wallet may show it as a sign-in
 * request for that site, and "Try again" (signing again moves no money); a smart wallet is said to ask for its passkey.
 * Once the window is closed the button works again, also while the wallet never answered. A refusal keeps the buyer
 * on the step, with its reason and the same button to try again; "Back to methods" returns to the methods (or to the
 * underpaid invoice whose rest another wallet pays). Once the wallet signed, the price is locked on this step and the
 * pay step follows. One signature per invoice and wallet: a new price or token needs no new one, nor a new network for
 * an ordinary wallet (a smart wallet's signature counts on its network only).
 *
 * Side effects: wallet prompts (a network switch, the signature); `POST payer-proof/message`, `POST payer-proof` and
 * `POST quote` through the checkout store.
 *
 * @returns The step.
 */
export function ConfirmWalletScreen() {
  const { checkout, state, store, labels, locale, wallet, adapterFor, connectWallet, setConfirmWallet } =
    useCheckoutContext();
  const method = checkout?.methods.find((item) => item.id === state.methodId) ?? null;
  const family = method ? methodFamily(method) : null;
  const proof = usePayerProof({
    adapter: family ? adapterFor(family) : undefined,
    store,
    wallet,
    chainId: method?.chainId ?? '',
  });
  const [cannotConnect, setCannotConnect] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  // The window of the wallet took the focus; when it closes, the step's heading takes it back (WCAG 2.4.3)
  const prompting = proof.step !== 'idle';
  const [stepRef, stepHeight] = useStepHeight(prompting);
  const wasPrompting = useRef(false);
  useEffect(() => {
    if (wasPrompting.current && !prompting) {
      area.current?.querySelector<HTMLElement>('[data-novapay-heading]')?.focus();
    }
    wasPrompting.current = prompting;
  }, [prompting]);

  if (!checkout || !method) return null;

  const merchant = checkout.merchant.name;
  const walletName = wallet?.name ?? '';
  const network = networkName(method.chainId);
  const invoice = checkout.invoice.number ?? checkout.invoice.id;
  const amount = checkout.invoice.totalMinor
    ? `${formatFiat(minorToDecimal(checkout.invoice.totalMinor), locale)} ${checkout.invoice.currency}`
    : null;
  const smart = isSmartWallet(wallet);
  const quoting = state.phase === 'quoting';
  // Busy only while the wallet window is open: once it is closed, the buyer can ask the wallet again
  const waiting = prompting;
  // Only what is about this confirmation: the store may hold a refusal of something else, from before the step opened
  const error = payerProofErrorText(
    !quoting && isConfirmationError(state.error) ? state.error : null,
    proof.problem,
    labels,
    {
      wallet: walletName,
      network,
      merchant,
    },
  );
  const values = { wallet: walletName, invoice, merchant };
  const asked = payerFor(wallet, method);
  const retry = () => {
    // The message Quasar issues names a wallet, and only that wallet's signature counts
    if (asked && state.payer !== asked) store.getState().setPayer(asked);
    void proof.confirm({ quote: true });
  };
  const back = () => {
    setConfirmWallet(false);
    store.getState().clearError();
  };
  // Another wallet already confirmed: the buyer may have only meant to change back to it
  const confirmedOther = asked ? state.confirmedWallets?.find((item) => !isSameWallet(item, asked)) : undefined;

  return (
    <div ref={area} className="novapay:relative novapay:flex novapay:flex-1 novapay:flex-col">
      {/* While the wallet asks, the step leaves the layout (keeping its state): the prompt takes its place */}
      <div
        ref={stepRef}
        inert={prompting}
        className={cn('novapay:flex novapay:flex-1 novapay:flex-col', prompting && 'novapay:hidden')}
      >
        <ScreenContent title={labels.payerProof.title} subtitle={labels.payerProof.text}>
          {wallet && (
            <div className="novapay:flex novapay:items-center novapay:gap-2.5 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2">
              <span className="novapay:h-7 novapay:w-7 novapay:shrink-0">
                <WalletIcon walletName={wallet.walletId} />
              </span>
              <span className="novapay:flex novapay:min-w-0 novapay:flex-1 novapay:flex-col">
                <span className="novapay:text-[13px] novapay:font-semibold">{walletName}</span>
                <span
                  className={cn(mono, 'novapay:truncate novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]')}
                >
                  {/* Where the wallet is now, as on the pay step: the line below says that it is asked to switch */}
                  {formatLabel(labels.pay.walletLine, {
                    address: shortAddress(wallet.address),
                    network: networkName(wallet.chainId),
                  })}
                </span>
              </span>
              <button
                type="button"
                aria-label={labels.pay.changeWallet}
                onClick={() => {
                  if (!connectWallet(method)) setCannotConnect(true);
                }}
                className={smallAction}
              >
                {labels.pay.change}
              </button>
            </div>
          )}

          <GroupLabel>{labels.payerProof.summary}</GroupLabel>
          <DetailsCard>
            <DetailRow name={labels.payerProof.invoice}>{invoice}</DetailRow>
            <DetailRow name={labels.payerProof.merchant}>{merchant}</DetailRow>
            {amount && <DetailRow name={labels.payerProof.amount}>{amount}</DetailRow>}
            {wallet && (
              <DetailRow name={labels.payerProof.wallet}>
                <ChainLink hash={wallet.address} chainId={wallet.chainId} />
              </DetailRow>
            )}
          </DetailsCard>
          <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
            {labels.payerProof.why}
          </p>
          {smart && (
            <p className="novapay:m-0 novapay:flex novapay:items-start novapay:gap-2 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              <FingerPrintIcon aria-hidden className="novapay:h-4 novapay:w-4 novapay:shrink-0" />
              <span>{formatLabel(labels.payerProof.passkey, values)}</span>
            </p>
          )}
          {wallet && family === 'eip155' && wallet.chainId !== method.chainId && (
            <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
              {formatLabel(labels.payerProof.willSwitch, { current: networkName(wallet.chainId), network })}
            </p>
          )}
          {confirmedOther && (
            <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-primary)]">
              {formatLabel(labels.payerProof.alreadyConfirmed, {
                wallet: shortAddress(addressOfWallet(confirmedOther)),
              })}
            </p>
          )}
          {error && <ScreenError>{error}</ScreenError>}
          {cannotConnect && <ScreenError>{labels.pay.connectUnavailable}</ScreenError>}
        </ScreenContent>

        <ScreenFooter>
          <PrimaryButton busy={waiting || quoting} onClick={retry}>
            {quoting
              ? labels.method.quoting
              : waiting
                ? capsLabel(labels.payerProof.waiting, values)
                : capsLabel(labels.payerProof.confirm, values)}
          </PrimaryButton>
          {/* The price is on its way and would open the pay step a moment later */}
          <SecondaryButton disabled={quoting} onClick={back}>
            {(state.invoiceStatus ?? checkout?.invoice.status) === 'underpaid'
              ? labels.pay.backFromRest
              : labels.pay.back}
          </SecondaryButton>
          <FooterNote>{smart ? labels.payerProof.noteSmart : labels.payerProof.note}</FooterNote>
        </ScreenFooter>
      </div>

      {prompting && (
        <WalletPrompt
          kind={proof.step === 'switching' ? 'switch' : 'proof'}
          walletName={walletName}
          walletId={wallet?.walletId ?? ''}
          walletIcon={wallet?.icon}
          amount={amount ?? ''}
          merchant={merchant}
          network={network}
          to=""
          priceTime={null}
          text={formatLabel(smart ? labels.payerProof.promptPasskey : labels.payerProof.promptText, values)}
          details={[
            ...(proof.request ? [{ name: labels.payerProof.site, value: proof.request.domain }] : []),
            { name: labels.payerProof.invoice, value: invoice },
            { name: labels.payerProof.merchant, value: merchant },
            ...(amount ? [{ name: labels.payerProof.amount, value: amount }] : []),
          ]}
          hint={
            proof.request
              ? formatLabel(labels.payerProof.signInRequest, { wallet: walletName, site: proof.request.domain })
              : undefined
          }
          onRetry={retry}
          onCancel={proof.dismiss}
          stepHeight={stepHeight}
        />
      )}
    </div>
  );
}
