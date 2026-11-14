import { cn, NetworkIcon, TokenIcon } from '@tuwaio/nova-core';
import { toEvmChainId } from '@tuwaio/orbit-core';
import type { CheckoutMethod } from '@tuwaio/quasar-sdk/checkout';
import { type ReactNode, useEffect, useEffectEvent, useId, useMemo, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel, formatLabelParts, type NovaPaymentsLabels } from '../i18n';
import { type CheckoutTokenGroup, groupMethodsByToken } from '../utils/checkout';
import { shortAddress } from '../utils/format';
import { canPayWithQr, methodFamily, networkName, payerFor, priceAdjustment } from '../utils/methods';
import { methodErrorText } from '../utils/outcome';
import { CapsLabel } from './CapsLabel';
import { chip, chipTone, focusRing, mono } from './classes';
import { checkoutClassName } from './customization';
import { DevicePhoneMobileIcon, QrCodeIcon, WalletOutlineIcon } from './icons';
import { RadioCards } from './RadioCards';
import {
  CheckBox,
  CheckoutWalletIcon,
  FailedTransaction,
  GroupLabel,
  PrimaryButton,
  ScreenContent,
  ScreenError,
  ScreenFooter,
} from './ScreenParts';

/** A small badge of a network option: a chip of the checkout in one of its tones. */
function Badge({ tone, children }: { tone: 'neutral' | 'accent' | 'success'; children: ReactNode }) {
  return <span className={cn(chip, chipTone[tone])}>{children}</span>;
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

/** The radio mark of a list option: square, as the marks of Nova that were circles (`--tuwa-rounded-full`). */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'novapay:h-3.5 novapay:w-3.5 novapay:shrink-0 novapay:rounded-[var(--tuwa-rounded-full)] novapay:box-border',
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
 * payment page for an EVM method paid on a phone; a wallet that must confirm the invoice first (an EVM payment it sends
 * itself) goes to the step that confirms it before the price. A consent the seller asks (`checkout.consent`) is a box the buyer
 * ticks under the ways to pay; a required one keeps "Continue" off until it is ticked, and the quote carries it.
 *
 * @returns The method step.
 */
export function MethodScreen() {
  const context = useCheckoutContext();
  const {
    checkout,
    state,
    store,
    labels,
    wallet,
    payWith,
    setPayWith,
    payUrl,
    connectWallet,
    adapterFor,
    setHandoff,
    lockPrice,
  } = context;
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
  const consentTextId = useId();
  const consentHintId = useId();

  // A method is chosen from the start: the connected wallet's network, else the first Popular one, else the first
  const selectDefault = useEffectEvent(() => {
    const first = groups[0]?.methods[0];
    // Chosen for the buyer, so what the page says about a payment that left the wallet stays
    if (!state.methodId && first) store.getState().selectMethod(first.id, { keepError: true });
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

  const page = context.display === 'page';
  // The token with the most networks holds its place on a page, so that picking another moves nothing under it
  const largest = groups.reduce((most, item) => (item.methods.length > most.methods.length ? item : most), groups[0]);
  const quoting = state.phase === 'quoting';
  const consent = checkout.consent ?? null;
  const consentGiven = Boolean(state.consentGiven);
  const consentMissing = Boolean(consent?.required && !consentGiven);
  const handlers = context.customization.handlers;
  // A pick of the buyer goes through `onMethodSelect` when the app set it (the first choice of the checkout does not)
  const pick = (method: CheckoutMethod) => {
    const select = () => store.getState().selectMethod(method.id);
    if (handlers?.onMethodSelect) handlers.onMethodSelect({ method, select });
    else select();
  };
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
    // The wallet confirms the invoice first when it must (an EVM payment it sends itself), then the price is locked
    await lockPrice();
  };

  const networksOf = (item: CheckoutTokenGroup) => (
    <>
      {/* A token keeps the letters of its symbol (`wstETH`) in the label in capitals */}
      <GroupLabel>
        <CapsLabel label={labels.method.network} values={{ symbol: item.symbol }} />
      </GroupLabel>
      <RadioCards
        label={formatLabel(labels.method.network, { symbol: item.symbol })}
        items={item.methods}
        value={selected?.id ?? null}
        getKey={(method) => method.id}
        onChange={(id) => {
          const next = item.methods.find((method) => method.id === id);
          if (next) pick(next);
        }}
        className={
          page && item.methods.length > 1
            ? 'novapay:grid novapay:grid-cols-1 novapay:gap-1.5 novapay:@min-[520px]:grid-cols-2'
            : 'novapay:flex novapay:flex-col novapay:gap-1.5'
        }
        itemClassName={(isSelected, method) =>
          cn(
            'novapay:flex novapay:items-center novapay:gap-2.5 novapay:px-3 novapay:py-2.5',
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
              {/* The name, and under it what the network costs and why it stands out: one layout at every width
                  and in every language */}
              <span className="novapay:flex novapay:min-w-0 novapay:flex-1 novapay:flex-col novapay:gap-1">
                <span className="novapay:text-[13px] novapay:font-semibold">{networkName(method.chainId)}</span>
                <span className="novapay:flex novapay:flex-wrap novapay:items-center novapay:gap-1.5">
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
              </span>
              <RadioDot selected={isSelected} />
            </>
          )
        }
      </RadioCards>
    </>
  );

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
            if (next) pick(next);
          }}
          // Equal cards across the row, however many tokens and however wide the checkout
          className="novapay:grid novapay:grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] novapay:gap-2"
          itemClassName={(isSelected, item) =>
            cn(
              'novapay:flex novapay:min-w-0 novapay:flex-col novapay:items-center novapay:gap-1 novapay:px-2 novapay:py-2',
              page && 'novapay-page-token',
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
                <span className="novapay:max-w-full novapay:truncate novapay:text-[10px] novapay:text-[var(--tuwa-text-secondary)]">
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

        {page && group ? (
          // The network of a page always shows, and its place is that of the largest list, from 640 px: "Pay with" stays
          <div className={cn('novapay:grid', group.methods.length === 1 && 'novapay:max-sm:hidden')}>
            {largest !== group && (
              <div
                inert
                aria-hidden
                className="novapay:invisible novapay:flex novapay:flex-col novapay:gap-2.5 novapay:[grid-area:1/1] novapay:max-sm:hidden"
              >
                {networksOf(largest)}
              </div>
            )}
            <div className="novapay:flex novapay:min-w-0 novapay:flex-col novapay:gap-2.5 novapay:[grid-area:1/1]">
              {networksOf(group)}
            </div>
          </div>
        ) : (
          group && group.methods.length > 1 && networksOf(group)
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
              page && 'novapay-page-way',
              checkoutClassName(context, 'payWithOption', { payWith: item, selected: isSelected }),
            )
          }
        >
          {(item) =>
            item === 'wallet' ? (
              <>
                {wallet ? (
                  <span className="novapay:h-5 novapay:w-5 novapay:shrink-0">
                    <CheckoutWalletIcon walletId={wallet.walletId} icon={wallet.icon} />
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
        {consent && (
          <label
            className={cn(
              'novapay:flex novapay:cursor-pointer novapay:items-start novapay:gap-2.5 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:px-3 novapay:py-2.5 novapay:transition-colors',
              // As the option cards: one border width, the tick adds a ring, nothing moves
              consentGiven
                ? 'novapay:border-[var(--tuwa-text-accent)] novapay:bg-[var(--tuwa-bg-primary)] novapay:ring-1 novapay:ring-[var(--tuwa-text-accent)]'
                : 'novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:hover:border-[var(--tuwa-border-strong)]',
              checkoutClassName(context, 'consentOption', { checked: consentGiven, required: consent.required }),
            )}
          >
            <CheckBox
              checked={consentGiven}
              required={consent.required}
              // Named by the seller's words alone: the hint is its description, not part of its name
              aria-labelledby={consentTextId}
              aria-describedby={consent.required ? consentHintId : undefined}
              onChange={(event) => store.getState().setConsentGiven(event.target.checked)}
              className="novapay:mt-0.5"
            />
            <span className="novapay:flex novapay:min-w-0 novapay:flex-col novapay:gap-1">
              <span
                id={consentTextId}
                className="novapay:whitespace-pre-line novapay:break-words novapay:text-[12px] novapay:leading-snug"
              >
                {consent.text}
              </span>
              {consent.required && (
                <span id={consentHintId} className="novapay:text-[11px] novapay:text-[var(--tuwa-text-secondary)]">
                  {labels.method.consentRequired}
                </span>
              )}
            </span>
          </label>
        )}
        {selected && !way && <ScreenError>{labels.method.methodUnavailable}</ScreenError>}
        {cannotConnect && (
          <ScreenError>{qrAvailable ? labels.pay.connectUnavailable : labels.method.methodUnavailable}</ScreenError>
        )}
        {state.error && state.phase === 'selectMethod' && (
          <>
            <ScreenError>{methodErrorText(state.error, labels, checkout.merchant.name)}</ScreenError>
            <FailedTransaction error={state.error} />
          </>
        )}
      </ScreenContent>
      <ScreenFooter>
        <PrimaryButton
          busy={quoting}
          disabled={!selected || !way || consentMissing}
          onClick={() => {
            if (selected && way && handlers?.onQuote) {
              void handlers.onQuote({ method: selected, payWith: way, proceed: onContinue });
            } else void onContinue();
          }}
        >
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
