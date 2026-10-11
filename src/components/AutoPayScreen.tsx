import { cn } from '@tuwaio/nova-core';
import { useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { formatTokenAmount, shortAddress } from '../utils/format';
import { methodFamily, networkName } from '../utils/methods';
import { autoPayTerms, formatPeriod, methodErrorText } from '../utils/outcome';
import { type PaymentWalletErrorKind, walletErrorKind } from '../utils/walletErrors';
import { mono } from './classes';
import { DetailRow, FooterAction, PrimaryButton, ScreenContent, ScreenError, ScreenFooter } from './ScreenParts';
import { WalletPrompt } from './WalletPrompt';

/**
 * The automatic payments offer of a subscription, after a paid period: the limit the seller may take each period, the
 * period, the paying wallet and the account that takes the charges, until when, and how to turn it off. "Allow" asks
 * the wallet for the ERC-7715 permission and hands it to Quasar (then the paid outcome says automatic payments are
 * on); "Not now" keeps paying each invoice.
 *
 * Side effects: a wallet prompt; `POST permission` of the checkout.
 *
 * @returns The automatic payments step.
 */
export function AutoPayScreen() {
  const { checkout, state, store, labels, locale, wallet, adapterFor, setAutoPay } = useCheckoutContext();
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<PaymentWalletErrorKind | null>(null);
  if (!checkout) return null;
  const merchant = checkout.merchant.name;
  const terms = autoPayTerms(checkout.autoCharge, checkout.methods);
  const offer = checkout.autoCharge;
  const method =
    offer?.status === 'available' ? checkout.methods.find((item) => item.id === offer.methodId) : undefined;
  const family = method ? methodFamily(method) : null;
  const adapter = family ? adapterFor(family) : undefined;

  const allow = async () => {
    if (offer?.status !== 'available' || !terms || !wallet || !adapter?.requestPermission)
      return setProblem('unsupported');
    setProblem(null);
    setAsking(true);
    try {
      const permission = await adapter.requestPermission({ request: offer.request, account: wallet.address });
      // Quasar takes it: the offer turns active and the paid outcome says automatic payments are on
      if (await store.getState().grantPermission({ payer: `${terms.chainId}:${wallet.address}`, ...permission })) {
        setAutoPay(false);
      }
    } catch (error) {
      setProblem(walletErrorKind(error));
    } finally {
      setAsking(false);
    }
  };

  const values = { wallet: wallet?.name ?? '', network: terms ? networkName(terms.chainId) : '' };
  const problemText =
    problem === 'declined'
      ? formatLabel(labels.pay.declined, values)
      : problem === 'unsupported'
        ? formatLabel(labels.autoPay.unavailable, values)
        : problem
          ? labels.error.generic
          : state.error
            ? methodErrorText(state.error, labels)
            : null;

  return (
    <div className="novapay:relative novapay:flex novapay:flex-1 novapay:flex-col">
      <div inert={asking} className="novapay:flex novapay:flex-1 novapay:flex-col">
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
              <dl className="novapay:m-0 novapay:flex novapay:flex-col novapay:gap-1.5">
                {wallet && (
                  <DetailRow name={labels.autoPay.from}>
                    {shortAddress(wallet.address)} · {networkName(terms.chainId)}
                  </DetailRow>
                )}
                <DetailRow name={labels.autoPay.to}>
                  {shortAddress(terms.to)}{' '}
                  <span className="novapay:font-sans novapay:text-[var(--tuwa-text-secondary)]">{merchant}</span>
                </DetailRow>
                {terms.expiresAt && (
                  <DetailRow name={labels.autoPay.validUntil}>
                    {formatLabel(labels.autoPay.validUntilValue, {
                      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(terms.expiresAt),
                    })}
                  </DetailRow>
                )}
              </dl>
              <ul className="novapay:m-0 novapay:flex novapay:list-disc novapay:flex-col novapay:gap-1 novapay:pl-4 novapay:text-xs novapay:text-[var(--tuwa-text-secondary)]">
                <li>{labels.autoPay.invoices}</li>
                <li>{formatLabel(labels.autoPay.cap, { merchant })}</li>
                <li>{labels.autoPay.turnOff}</li>
              </ul>
            </>
          )}
          {problemText && <ScreenError>{problemText}</ScreenError>}
        </ScreenContent>
        <ScreenFooter>
          <PrimaryButton busy={asking} disabled={!terms} onClick={() => void allow()}>
            {labels.autoPay.confirm}
          </PrimaryButton>
          <FooterAction onClick={() => setAutoPay(false)}>{labels.autoPay.skip}</FooterAction>
          <p className="novapay:m-0 novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
            {labels.autoPay.walletNote}
          </p>
        </ScreenFooter>
      </div>
      {asking && wallet && (
        <WalletPrompt
          kind="permission"
          walletName={wallet.name}
          walletId={wallet.walletId}
          amount=""
          merchant={merchant}
          network={values.network}
          to=""
          priceTime={null}
          onCancel={() => setAsking(false)}
        />
      )}
    </div>
  );
}
