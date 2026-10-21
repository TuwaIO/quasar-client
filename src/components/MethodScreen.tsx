import { DevicePhoneMobileIcon, QrCodeIcon, WalletIcon as WalletOutlineIcon } from '@heroicons/react/24/outline';
import { cn, NetworkIcon, TokenIcon, WalletIcon } from '@tuwaio/nova-core';
import { toEvmChainId } from '@tuwaio/orbit-core';
import type { CheckoutMethod } from '@tuwaio/quasar-sdk/checkout';
import { type ReactNode, useEffect, useEffectEvent, useMemo, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel, formatLabelParts, type NovaPaymentsLabels } from '../i18n';
import { groupMethodsByToken } from '../utils/checkout';
import { shortAddress } from '../utils/format';
import { canPayWithQr, methodFamily, networkName, payerFor, priceAdjustment } from '../utils/methods';
import { methodErrorText } from '../utils/outcome';
import { focusRing, mono } from './classes';
import { checkoutClassName } from './customization';
import { RadioCards } from './RadioCards';
import { GroupLabel, PrimaryButton, ScreenContent, ScreenError, ScreenFooter } from './ScreenParts';

/** A small badge of a network option. */
function Badge({ tone, children }: { tone: 'neutral' | 'accent' | 'success'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'novapay:shrink-0 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:px-1.5 novapay:py-0.5 novapay:text-[11px]',
        tone === 'neutral' && 'novapay:bg-[var(--tuwa-bg-muted)] novapay:text-[var(--tuwa-text-primary)]',
        // An outline: the accent text reads on the page background in both themes, not on a tinted one
        tone === 'accent' &&
          'novapay:border novapay:border-[var(--tuwa-text-accent)] novapay:text-[var(--tuwa-text-accent)]',
        tone === 'success' && 'novapay:bg-[var(--tuwa-success-bg)] novapay:text-[var(--tuwa-success-text)]',
      )}
    >
      {children}
    </span>
  );
}

/** The discount or markup of a method, if any. */
function Adjustment({ method, labels }: { method: CheckoutMethod; labels: NovaPaymentsLabels }) {
  const adjustment = priceAdjustment(method);
  if (!adjustment) return null;
  return adjustment.kind === 'discount' ? (
    <Badge tone="success">{formatLabel(labels.method.discount, { percent: adjustment.percent })}</Badge>
  ) : (
    <Badge tone="neutral">{formatLabel(labels.method.markup, { percent: adjustment.percent })}</Badge>
  );
}

/** The radio dot of a list option. */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'novapay:h-3.5 novapay:w-3.5 novapay:shrink-0 novapay:rounded-full novapay:box-border',
        selected
          ? 'novapay:border-4 novapay:border-[var(--tuwa-text-accent)]'
          : 'novapay:border novapay:border-[var(--tuwa-text-secondary)]',
      )}
    />
  );
}

/**
 * The legal line under the main button: the seller's terms and refund policy as links (a link the merchant did not set
 * is left out, and the line too without both).
 */
function AgreeLine({
  labels,
  terms,
  refundPolicy,
}: {
  labels: NovaPaymentsLabels;
  terms: string | null;
  refundPolicy: string | null;
}) {
  const link = (href: string, text: string) => (
    <a
      key={href}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('novapay:text-[var(--tuwa-text-accent)] novapay:underline', focusRing)}
    >
      {text}
    </a>
  );
  const parts =
    terms && refundPolicy
      ? formatLabelParts(labels.method.agreeBoth, {
          terms: link(terms, labels.summary.terms),
          refundPolicy: link(refundPolicy, labels.summary.refundPolicy),
        })
      : terms || refundPolicy
        ? formatLabelParts(labels.method.agreeOne, {
            link: terms ? link(terms, labels.summary.terms) : link(refundPolicy as string, labels.summary.refundPolicy),
          })
        : null;
  if (!parts) return null;
  return (
    <p className="novapay:m-0 novapay:text-center novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
      {parts}
    </p>
  );
}

/**
 * The method step: the token first, then its network (left out when the token has one), then how to pay — from a
 * wallet in this browser or with a QR code on a phone. The connected wallet's network comes first and is marked, the
 * merchant's Popular methods next; a discount or markup of a method shows on it. Paying from a wallet needs the chain
 * adapter of the method's family (`adapters` of `NovaPaymentsProvider`). "Continue" locks the price for the connected
 * wallet (or connects one first), locks it without a payer for a Solana Pay QR code, or shows the QR code of the
 * payment page for an EVM method paid on a phone.
 *
 * @returns The method step.
 */
export function MethodScreen() {
  const context = useCheckoutContext();
  const { checkout, state, store, labels, wallet, payWith, setPayWith, payUrl, connectWallet, adapterFor, setHandoff } =
    context;
  const { TokenOption, NetworkOption } = context.customization.components ?? {};
  const methods = useMemo(() => checkout?.methods ?? [], [checkout]);
  const groups = useMemo(() => groupMethodsByToken(methods, wallet?.chainId), [methods, wallet?.chainId]);
  const selected = methods.find((method) => method.id === state.methodId) ?? null;
  const group = groups.find((item) => item.symbol === selected?.symbol) ?? null;
  const qrAvailable = selected ? canPayWithQr(selected, payUrl) : false;
  // The wallet pays only where the app gave the adapter of the method's chain family
  const family = selected ? methodFamily(selected) : null;
  const walletAvailable = family ? Boolean(adapterFor(family)) : false;
  const ways = [...(walletAvailable ? ['wallet' as const] : []), ...(qrAvailable ? ['qr' as const] : [])];
  const way = ways.includes(payWith) ? payWith : (ways[0] ?? null);
  const [cannotConnect, setCannotConnect] = useState(false);

  // A method is chosen from the start: the connected wallet's network, else the first Popular one, else the first
  const selectDefault = useEffectEvent(() => {
    const first = groups[0]?.methods[0];
    if (!state.methodId && first) store.getState().selectMethod(first.id);
  });
  useEffect(() => selectDefault(), [groups]);

  if (!checkout) return null;
  if (methods.length === 0) {
    return (
      <ScreenContent title={labels.method.title}>
        <ScreenError>{labels.method.noMethods}</ScreenError>
      </ScreenContent>
    );
  }

  const quoting = state.phase === 'quoting';
  const onContinue = async () => {
    if (!selected || !way) return;
    setCannotConnect(false);
    if (way === 'qr') {
      if (payWith !== 'qr') setPayWith('qr');
      // Solana Pay locks a price without a payer; an EVM method continues on the phone, on the payment page
      if (family !== 'solana') return setHandoff(true);
      store.getState().setPayer(null);
      await store.getState().requestQuote();
      return;
    }
    if (payWith !== 'wallet') setPayWith('wallet');
    const payer = payerFor(wallet, selected);
    if (!payer) return setCannotConnect(!connectWallet(selected));
    store.getState().setPayer(payer);
    await store.getState().requestQuote();
  };

  return (
    <>
      <ScreenContent
        title={labels.method.title}
        subtitle={formatLabel(labels.method.subtitle, { minutes: Math.round(checkout.quoteTtlSeconds / 60) })}
      >
        <GroupLabel>{labels.method.token}</GroupLabel>
        <RadioCards
          label={labels.method.token}
          items={groups}
          value={group?.symbol ?? null}
          getKey={(item) => item.symbol}
          onChange={(symbol) => {
            const next = groups.find((item) => item.symbol === symbol)?.methods[0];
            if (next) store.getState().selectMethod(next.id);
          }}
          className="novapay:grid novapay:grid-cols-2 novapay:gap-2 novapay:sm:grid-cols-4"
          itemClassName={(isSelected, item) =>
            cn(
              'novapay:flex novapay:flex-col novapay:items-center novapay:gap-1 novapay:px-1 novapay:py-2',
              checkoutClassName(context, 'tokenOption', { group: item, selected: isSelected }),
            )
          }
        >
          {(item, isSelected) =>
            TokenOption ? (
              <TokenOption group={item} selected={isSelected} />
            ) : (
              <>
                <span className="novapay:h-6.5 novapay:w-6.5">
                  <TokenIcon symbol={item.symbol} />
                </span>
                <span className="novapay:text-[13px] novapay:font-semibold">{item.symbol}</span>
                <span className="novapay:text-[10px] novapay:text-[var(--tuwa-text-secondary)]">
                  {item.methods.length > 1 ? (
                    formatLabel(labels.method.networks, { count: item.methods.length })
                  ) : priceAdjustment(item.methods[0]) ? (
                    <Adjustment method={item.methods[0]} labels={labels} />
                  ) : (
                    networkName(item.methods[0].chainId)
                  )}
                </span>
              </>
            )
          }
        </RadioCards>

        {group && group.methods.length > 1 && (
          <>
            <GroupLabel>{formatLabel(labels.method.network, { symbol: group.symbol })}</GroupLabel>
            <RadioCards
              label={formatLabel(labels.method.network, { symbol: group.symbol })}
              items={group.methods}
              value={selected?.id ?? null}
              getKey={(method) => method.id}
              onChange={(id) => store.getState().selectMethod(id)}
              className="novapay:flex novapay:flex-col novapay:gap-1.5"
              itemClassName={(isSelected, method) =>
                cn(
                  'novapay:flex novapay:items-center novapay:gap-2.5 novapay:px-3 novapay:py-2',
                  checkoutClassName(context, 'networkOption', { method, selected: isSelected }),
                )
              }
            >
              {(method, isSelected) =>
                NetworkOption ? (
                  <NetworkOption method={method} selected={isSelected} />
                ) : (
                  <>
                    <span className="novapay:h-5 novapay:w-5 novapay:shrink-0">
                      <NetworkIcon chainId={toEvmChainId(method.chainId) ?? method.chainId} />
                    </span>
                    <span className="novapay:text-[13px] novapay:font-semibold">{networkName(method.chainId)}</span>
                    <span className="novapay:ml-auto novapay:flex novapay:flex-wrap novapay:justify-end novapay:gap-1.5">
                      {wallet?.chainId === method.chainId && <Badge tone="neutral">{labels.method.yourWallet}</Badge>}
                      {method.featured && <Badge tone="accent">{labels.method.popular}</Badge>}
                      <Adjustment method={method} labels={labels} />
                      {method.gasless === 'auto' ? (
                        <Badge tone="success">{labels.method.noGasFee}</Badge>
                      ) : (
                        <span className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
                          {labels.method.buyerPaysGas}
                        </span>
                      )}
                    </span>
                    <RadioDot selected={isSelected} />
                  </>
                )
              }
            </RadioCards>
          </>
        )}

        <GroupLabel>{labels.method.payWith}</GroupLabel>
        <RadioCards
          label={labels.method.payWith}
          items={ways}
          value={way}
          getKey={(item) => item}
          onChange={(item) => {
            setCannotConnect(false);
            setPayWith(item as 'wallet' | 'qr');
          }}
          className={cn('novapay:grid novapay:gap-2', ways.length > 1 && 'novapay:grid-cols-2')}
          itemClassName={(isSelected, item) =>
            cn(
              'novapay:flex novapay:items-center novapay:gap-2.5 novapay:px-2.5 novapay:py-2',
              checkoutClassName(context, 'payWithOption', { payWith: item, selected: isSelected }),
            )
          }
        >
          {(item) =>
            item === 'wallet' ? (
              <>
                {wallet ? (
                  <span className="novapay:h-5 novapay:w-5 novapay:shrink-0">
                    <WalletIcon walletName={wallet.walletId} />
                  </span>
                ) : (
                  <WalletOutlineIcon
                    aria-hidden
                    className="novapay:h-5 novapay:w-5 novapay:shrink-0 novapay:text-[var(--tuwa-text-accent)]"
                  />
                )}
                <span className="novapay:flex novapay:min-w-0 novapay:flex-col">
                  <span className="novapay:text-[13px] novapay:font-semibold">{labels.method.wallet}</span>
                  <span
                    className={cn(
                      'novapay:truncate novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]',
                      wallet && mono,
                    )}
                  >
                    {wallet ? `${wallet.name} · ${shortAddress(wallet.address)}` : labels.method.walletHint}
                  </span>
                </span>
              </>
            ) : (
              <>
                {selected && methodFamily(selected) === 'solana' ? (
                  <QrCodeIcon aria-hidden className="novapay:h-5 novapay:w-5 novapay:shrink-0" />
                ) : (
                  <DevicePhoneMobileIcon aria-hidden className="novapay:h-5 novapay:w-5 novapay:shrink-0" />
                )}
                <span className="novapay:flex novapay:flex-col">
                  <span className="novapay:text-[13px] novapay:font-semibold">{labels.method.qr}</span>
                  <span className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
                    {labels.method.qrHint}
                  </span>
                </span>
              </>
            )
          }
        </RadioCards>
        {selected && !way && <ScreenError>{labels.method.methodUnavailable}</ScreenError>}
        {cannotConnect && (
          <ScreenError>{qrAvailable ? labels.pay.connectUnavailable : labels.method.methodUnavailable}</ScreenError>
        )}
        {state.error && state.phase === 'selectMethod' && (
          <ScreenError>{methodErrorText(state.error, labels)}</ScreenError>
        )}
      </ScreenContent>
      <ScreenFooter>
        <PrimaryButton busy={quoting} disabled={!selected || !way} onClick={() => void onContinue()}>
          {quoting ? labels.method.quoting : labels.method.continue}
        </PrimaryButton>
        <AgreeLine
          labels={labels}
          terms={checkout.merchant.links.terms}
          refundPolicy={checkout.merchant.links.refundPolicy}
        />
      </ScreenFooter>
    </>
  );
}
