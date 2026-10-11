import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import type { ReactNode } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import type { CheckoutLocale } from '../i18n';
import { checkoutSteps } from '../utils/checkout';
import { CheckoutStepper } from './CheckoutStepper';
import { MerchantBadge } from './CheckoutSummary';
import { iconButton, mono } from './classes';
import { LocaleSwitcher } from './LocaleSwitcher';

/** Props of {@link CheckoutHeader}. */
export interface CheckoutHeaderProps {
  /** The heading of an outcome screen, shown instead of the steps. */
  title?: ReactNode;
  /** The checkout asked for the buyer details first: the steps start with them. */
  withDetails?: boolean;
}

/**
 * The header of the checkout: the steps (or the heading of an outcome), then the language menu and the close button,
 * which stay in the top right corner on every screen and on a phone. On a phone the steps move under the order and
 * the header shows the merchant.
 *
 * @param props - See {@link CheckoutHeaderProps}.
 * @returns The header.
 */
export function CheckoutHeader({ title, withDetails }: CheckoutHeaderProps) {
  const { screen, labels, locale, store, close, state } = useCheckoutContext();
  const steps = checkoutSteps(screen, { withDetails });
  const tools = (
    <div className="novapay:ml-auto novapay:flex novapay:shrink-0 novapay:items-center novapay:gap-2">
      <LocaleSwitcher
        locale={locale}
        labels={labels}
        receiptIssued={Boolean(state.receiptUrl)}
        onSelect={(code: CheckoutLocale) => void store.getState().setLocale(code)}
      />
      {close && (
        <button type="button" aria-label={labels.common.close} onClick={close} className={iconButton}>
          <XMarkIcon aria-hidden className="novapay:h-3.5 novapay:w-3.5" />
        </button>
      )}
    </div>
  );
  return (
    <>
      <header className="novapay:hidden novapay:items-center novapay:gap-3 novapay:border-b novapay:border-[var(--tuwa-border-primary)] novapay:py-3.5 novapay:pl-5 novapay:pr-4 novapay:sm:flex">
        {steps ? (
          <CheckoutStepper steps={steps} labels={labels} />
        ) : (
          title && (
            <h2 className={cn(mono, 'novapay:m-0 novapay:flex-1 novapay:text-[15px] novapay:font-bold')}>{title}</h2>
          )
        )}
        {tools}
      </header>
      <header className="novapay:flex novapay:items-center novapay:gap-2.5 novapay:px-4 novapay:pb-3 novapay:pt-1.5 novapay:sm:hidden">
        <MerchantBadge compact />
        {tools}
      </header>
    </>
  );
}

/** The steps on a phone, under the order. @internal */
export function MobileSteps({ withDetails }: { withDetails?: boolean }) {
  const { screen, labels } = useCheckoutContext();
  const steps = checkoutSteps(screen, { withDetails });
  if (!steps) return null;
  return <CheckoutStepper steps={steps} labels={labels} className="novapay:px-4 novapay:pt-3.5" />;
}
