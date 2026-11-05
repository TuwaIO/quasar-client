import { cn } from '@tuwaio/nova-core';
import { useEffect, useRef, useState } from 'react';

import type { PaymentsAdapter } from '../adapters/types';
import { useAsyncValue } from '../hooks/useAsyncValue';
import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { useStepHeight } from '../hooks/useStepHeight';
import { formatLabel } from '../i18n';
import { formatTokenAmount, shortAddress } from '../utils/format';
import { methodFamily, networkName } from '../utils/methods';
import { autoPayTerms, formatPeriod, grantableOffer, methodErrorText } from '../utils/outcome';
import { isPayerProofError, payerProofErrorText } from '../utils/payerProof';
import { OPEN_REQUEST_MS, settlesWithin } from '../utils/settlesWithin';
import { type PaymentWalletErrorKind, walletErrorKind } from '../utils/walletErrors';
import { mono } from './classes';
import {
  ChainLink,
  DetailRow,
  DetailsCard,
  FooterNote,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
  SecondaryButton,
} from './ScreenParts';
import { WalletPrompt } from './WalletPrompt';

/** The wallet did not switch the account, and not because the buyer refused: the buyer can still do it in the wallet. */
class UpgradeFailed extends Error {}

/** What the wallet asks for on this step. */
type AskStep = 'idle' | 'switching' | 'upgrading' | 'permission' | 'proof';

/** Why the step stopped; `smartAccount`: the switch to a smart account did not happen, so the buyer does it in the wallet. */
type AskProblem = PaymentWalletErrorKind | 'smartAccount' | 'cannotConnect';

/** What the wallet granted, as `grantPermission` of the checkout store takes it. */
type Granted = Awaited<ReturnType<NonNullable<PaymentsAdapter['requestPermission']>>>;

/**
 * The automatic payments offer of a subscription, after a paid period: the limit the seller may take each period, the
 * period, the paying wallet and the seller's wallet the charges are paid to, until when, that Quasar sends each charge
 * for the seller, and how to turn it off. "Allow" takes the wallet through what it needs: to the network of the
 * permission, from a plain account to its smart account (see `smartAccountStatus`: the offer says so first, and MetaMask
 * asks only then), then the ERC-7715 permission, which Quasar takes (the paid outcome then says automatic payments are
 * on); "Not now" keeps paying each invoice. Without a wallet the main button connects one.
 *
 * Each press is a try with a number: Cancel closes the window, and an answer the wallet gives later changes nothing on
 * the page, except that a permission it grants still reaches Quasar. A request still open in the wallet is not asked
 * again, so the buyer never approves two; what the wallet already granted is not asked again after a refusal of the free
 * confirmation.
 *
 * Side effects: wallet prompts and, for a plain account, a transaction whose fee the buyer pays; `POST permission` of
 * the checkout; network and wallet reads for the kind of account.
 *
 * @returns The automatic payments step.
 */
export function AutoPayScreen() {
  const { checkout, state, store, labels, locale, wallet, adapterFor, setAutoPay, connectFamily } =
    useCheckoutContext();
  const [step, setStep] = useState<AskStep>('idle');
  const [problem, setProblem] = useState<AskProblem | null>(null);
  // Another wallet: a refusal is about the last one, whose request the page no longer shows
  const address = wallet?.address;
  const [shownAddress, setShownAddress] = useState(address);
  if (shownAddress !== address) {
    setShownAddress(address);
    setProblem(null);
    setStep('idle');
  }
  const attempt = useRef(0);
  useEffect(() => {
    attempt.current++;
    const { error, clearError } = store.getState();
    if (error && (isPayerProofError(error) || error.code === 'permission_invalid')) clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the wallet changes
  }, [address]);
  // The request waiting in the wallet, and what it granted: asked once per wallet, whatever the buyer presses meanwhile
  const open = useRef<{ account: string; asked: Promise<Granted> } | null>(null);
  const kept = useRef<{ account: string; granted: Granted } | null>(null);
  const prompting = step !== 'idle' && wallet !== null;
  // On a phone the prompt keeps the height of the offer
  const [stepRef, stepHeight] = useStepHeight(prompting);
  const offer = grantableOffer(checkout?.autoCharge ?? null);
  const method = offer ? checkout?.methods.find((item) => item.id === offer.methodId) : undefined;
  const family = method ? methodFamily(method) : null;
  const adapter = family ? adapterFor(family) : undefined;
  const terms = checkout ? autoPayTerms(checkout.autoCharge, checkout.methods) : null;
  const [upgradedFor, setUpgradedFor] = useState<string | null>(null);
  const accountKind = useAsyncValue(
    terms && wallet && adapter?.smartAccountStatus && upgradedFor !== wallet.address
      ? `${terms.chainId}:${wallet.address}`
      : null,
    () => adapter!.smartAccountStatus!({ chainId: terms!.chainId, account: wallet!.address }),
  );
  if (!checkout) return null;
  const merchant = checkout.merchant.name;
  const needsUpgrade = accountKind === 'upgradable' && Boolean(adapter?.upgradeToSmartAccount);

  const allow = async () => {
    if (!offer || !terms || !wallet || !adapter?.requestPermission) return setProblem('unsupported');
    const { requestPermission } = adapter;
    const id = ++attempt.current;
    const isCurrent = () => attempt.current === id;
    const account = wallet.address;
    setProblem(null);
    store.getState().clearError();
    try {
      if (wallet.chainId !== terms.chainId && adapter.switchChain) {
        setStep('switching');
        await adapter.switchChain(terms.chainId);
        if (!isCurrent()) return;
      }
      if (needsUpgrade) {
        setStep('upgrading');
        try {
          await adapter.upgradeToSmartAccount!({ chainId: terms.chainId, account });
        } catch (error) {
          const kind = walletErrorKind(error);
          // What the buyer can still do by hand: the wallet has this switch among the details of the account
          throw kind === 'failed' ? new UpgradeFailed() : error;
        }
        if (isCurrent()) setUpgradedFor(account);
        if (!isCurrent()) return;
      }
      setStep('permission');
      let granted = kept.current?.account === account ? kept.current.granted : null;
      if (!granted) {
        if (open.current?.account !== account) {
          const asked = requestPermission({ request: offer.request, account });
          const entry = { account, asked };
          open.current = entry;
          const settled = () => {
            if (open.current === entry) open.current = null;
          };
          asked.then(settled, settled);
        }
        // A wallet that lost the request never answers: after this long it is over, and the buyer can ask again
        const waited = open.current!;
        let answer: Granted | null = null;
        const settled = await settlesWithin(
          waited.asked.then((value) => {
            answer = value;
          }),
          OPEN_REQUEST_MS,
        );
        if (!settled || !answer) {
          if (open.current === waited) open.current = null;
          if (isCurrent()) setProblem('alreadyPending');
          return;
        }
        granted = answer as Granted;
        kept.current = { account, granted };
      }
      const accepted = await store.getState().grantPermission(
        { payer: `${terms.chainId}:${account}`, ...granted },
        // Quasar takes it only from a wallet that confirmed the invoice: free, and only if it has not yet
        adapter.signMessage &&
          ((message, issued) => {
            if (isCurrent()) setStep('proof');
            return adapter.signMessage!({ message, account, chainId: issued.chainId });
          }),
      );
      if (accepted) {
        kept.current = null;
        if (isCurrent()) setAutoPay(false);
        return;
      }
      // Asked again only when the wallet's answer is what Quasar refused, not the free confirmation or a lost request
      const refusal = store.getState().error;
      if (refusal?.code === 'permission_invalid') kept.current = null;
    } catch (error) {
      if (!isCurrent()) return;
      setProblem(error instanceof UpgradeFailed ? 'smartAccount' : walletErrorKind(error));
    } finally {
      if (isCurrent()) setStep('idle');
    }
  };

  const values = { wallet: wallet?.name ?? '', network: terms ? networkName(terms.chainId) : '', merchant };
  const refusal = state.error;
  const refusalText = !refusal
    ? null
    : refusal.code === 'permission_invalid'
      ? // Quasar refuses a wallet that could never be charged: a plain account the wallet signed for without switching it
        (refusal as { reason?: string }).reason === 'wallet_unknown'
        ? formatLabel(labels.autoPay.smartAccountNeeded, values)
        : labels.autoPay.invalid
      : isPayerProofError(refusal)
        ? payerProofErrorText(refusal, null, labels, values)
        : methodErrorText(refusal, labels, merchant);
  const problemText =
    problem === 'declined'
      ? formatLabel(labels.pay.declined, values)
      : problem === 'unsupported'
        ? formatLabel(labels.autoPay.unavailable, values)
        : problem === 'smartAccount'
          ? formatLabel(labels.autoPay.smartAccountNeeded, values)
          : problem === 'wrongNetwork' || problem === 'switchFailed'
            ? formatLabel(labels.pay.switchFailed, values)
            : problem === 'notAuthorized'
              ? formatLabel(labels.pay.notAuthorized, values)
              : problem === 'alreadyPending'
                ? formatLabel(labels.walletPrompt.stillWaiting, values)
                : problem === 'cannotConnect'
                  ? labels.pay.connectUnavailable
                  : problem
                    ? formatLabel(labels.autoPay.notGranted, values)
                    : refusalText;

  return (
    <div className="novapay:relative novapay:flex novapay:flex-1 novapay:flex-col">
      {/* While the wallet asks, the offer leaves the layout (keeping its state): the prompt takes its place */}
      <div
        ref={stepRef}
        inert={prompting}
        className={cn('novapay:flex novapay:flex-1 novapay:flex-col', prompting && 'novapay:hidden')}
      >
        <ScreenContent title={labels.autoPay.title} subtitle={labels.autoPay.subtitle}>
          {terms && (
            <>
              <div className="novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:px-3 novapay:py-2">
                <span className="novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
                  {formatLabel(labels.autoPay.allow, { merchant })}
                </span>
                <p className={cn(mono, 'novapay:m-0 novapay:text-lg novapay:font-bold')}>
                  {formatLabel(labels.autoPay.limit, {
                    amount: `${formatTokenAmount(terms.limit, terms.decimals, locale)} ${terms.symbol}`,
                  })}{' '}
                  <span className="novapay:text-sm novapay:font-normal">
                    {formatLabel(labels.autoPay.every, { period: formatPeriod(terms.periodSeconds, locale) })}
                  </span>
                </p>
              </div>
              <DetailsCard>
                {wallet && (
                  <DetailRow name={labels.autoPay.from}>
                    <span className="novapay:inline-flex novapay:items-center novapay:gap-1">
                      <ChainLink hash={wallet.address} chainId={terms.chainId} /> · {networkName(terms.chainId)}
                    </span>
                  </DetailRow>
                )}
                <DetailRow name={labels.autoPay.to}>
                  <ChainLink hash={terms.to} chainId={terms.chainId} />
                  <span className="novapay:font-sans novapay:text-[var(--tuwa-text-secondary)]">{merchant}</span>
                </DetailRow>
                {terms.expiresAt && (
                  <DetailRow name={labels.autoPay.validUntil}>
                    {formatLabel(labels.autoPay.validUntilValue, {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(terms.expiresAt),
                    })}
                  </DetailRow>
                )}
              </DetailsCard>
              <ul className="novapay:m-0 novapay:flex novapay:list-disc novapay:flex-col novapay:gap-1 novapay:pl-4 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
                <li>{formatLabel(labels.autoPay.collector, { merchant })}</li>
                <li>{labels.autoPay.invoices}</li>
                <li>{formatLabel(labels.autoPay.cap, { merchant })}</li>
                <li>{formatLabel(labels.autoPay.turnOff, { merchant })}</li>
              </ul>
            </>
          )}
          {needsUpgrade && (
            <p className="novapay:m-0 novapay:text-xs novapay:text-[var(--tuwa-text-primary)]">
              {formatLabel(labels.autoPay.smartAccountNote, values)}
            </p>
          )}
          {problemText && <ScreenError>{problemText}</ScreenError>}
        </ScreenContent>
        <ScreenFooter>
          {wallet ? (
            <PrimaryButton busy={prompting} disabled={!terms} onClick={() => void allow()}>
              {labels.autoPay.confirm}
            </PrimaryButton>
          ) : (
            <PrimaryButton
              disabled={!family}
              onClick={() => {
                if (family && !connectFamily(family)) setProblem('cannotConnect');
              }}
            >
              {labels.pay.connect}
            </PrimaryButton>
          )}
          <SecondaryButton onClick={() => setAutoPay(false)}>{labels.autoPay.skip}</SecondaryButton>
          <FooterNote>{labels.autoPay.walletNote}</FooterNote>
        </ScreenFooter>
      </div>
      {prompting && wallet && (
        <WalletPrompt
          kind={
            step === 'switching'
              ? 'switch'
              : step === 'upgrading'
                ? 'confirm'
                : step === 'proof'
                  ? 'proof'
                  : 'permission'
          }
          walletName={wallet.name}
          walletId={wallet.walletId}
          walletIcon={wallet.icon}
          amount=""
          merchant={merchant}
          network={values.network}
          to=""
          priceTime={null}
          text={
            step === 'upgrading'
              ? formatLabel(labels.autoPay.smartAccountPrompt, values)
              : step === 'proof'
                ? formatLabel(labels.payerProof.promptText, {
                    ...values,
                    invoice: checkout.invoice.number ?? checkout.invoice.id,
                  })
                : undefined
          }
          details={
            step === 'upgrading'
              ? [
                  { name: labels.autoPay.from, value: shortAddress(wallet.address) },
                  { name: labels.walletPrompt.network, value: values.network },
                ]
              : step === 'proof'
                ? [
                    { name: labels.payerProof.invoice, value: checkout.invoice.number ?? checkout.invoice.id },
                    { name: labels.payerProof.merchant, value: merchant },
                  ]
                : undefined
          }
          onCancel={() => {
            attempt.current++;
            setStep('idle');
          }}
          stepHeight={stepHeight}
        />
      )}
    </div>
  );
}
