import { CloseIcon, cn } from '@tuwaio/nova-core';
import type { ReactNode } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import type { CheckoutLocale } from '../i18n';
import { type CheckoutStep, checkoutSteps, paidSteps } from '../utils/checkout';
import type { CheckoutContextValue } from './checkoutContext';
import { CheckoutStepper } from './CheckoutStepper';
import { MerchantBadge } from './CheckoutSummary';
import { iconButton, mono } from './classes';
import { checkoutClassName } from './customization';
import { LocaleSwitcher } from './LocaleSwitcher';

/** Props of {@link CheckoutHeader}. */
export interface CheckoutHeaderProps {
  /** The heading of an outcome screen, shown instead of the steps. */
  title?: ReactNode;
  /** The checkout asked for the buyer details first: the steps start with them. */
  withDetails?: boolean;
}

/** The steps of a screen; on its own page the paid screen keeps them, all done, so the row does not change at the end. */
const stepsOfScreen = (context: CheckoutContextValue, withDetails?: boolean) =>
  checkoutSteps(context.screen, { withDetails }) ??
  (context.display === 'page' && context.screen === 'paid' ? paidSteps({ withDetails }) : null);

/** The steps of the checkout, or their replacement (`customization.components.Stepper`), with their classes. */
function stepsOf(context: CheckoutContextValue, steps: CheckoutStep[], className?: string) {
  const Stepper = context.customization.components?.Stepper ?? CheckoutStepper;
  return (
    <Stepper
      steps={steps}
      labels={context.labels}
      className={cn(className, checkoutClassName(context, 'stepper'))}
      stepClassName={(step, index) => checkoutClassName(context, 'step', { step, index })}
    />
  );
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
  const context = useCheckoutContext();
  const { labels, locale, setLocale, close, state } = context;
  const page = context.display === 'page';
  const steps = context.customization.config?.showSteps === false ? null : stepsOfScreen(context, withDetails);
  const extra = checkoutClassName(context, 'header');
  const onLocaleChange = context.customization.handlers?.onLocaleChange;
  const tools = (
    <div className="novapay:ml-auto novapay:flex novapay:shrink-0 novapay:items-center novapay:gap-2">
      <LocaleSwitcher
        locale={locale}
        labels={labels}
        receiptIssued={Boolean(state.receiptUrl)}
        onSelect={(code: CheckoutLocale) =>
          void (onLocaleChange ? onLocaleChange({ locale: code, proceed: () => setLocale(code) }) : setLocale(code))
        }
      />
      {close && (
        <button type="button" aria-label={labels.common.close} onClick={close} className={iconButton}>
          <CloseIcon aria-hidden className="novapay:h-4 novapay:w-4" />
        </button>
      )}
    </div>
  );
  return (
    <>
      <header
        className={cn(
          'novapay:hidden novapay:items-center novapay:gap-3 novapay:border-b novapay:border-[var(--tuwa-border-primary)] novapay:py-3.5 novapay:pl-5 novapay:pr-4 novapay:sm:flex',
          page && 'novapay-page-header',
          extra,
        )}
      >
        {steps
          ? stepsOf(context, steps)
          : title && (
              <h2 className={cn(mono, 'novapay:m-0 novapay:flex-1 novapay:text-[15px] novapay:font-bold')}>{title}</h2>
            )}
        {tools}
      </header>
      <header
        className={cn(
          'novapay:flex novapay:items-center novapay:gap-2.5 novapay:px-4 novapay:pb-3 novapay:pt-1.5 novapay:sm:hidden',
          page && 'novapay-page-header-phone',
          extra,
        )}
      >
        <MerchantBadge compact />
        {tools}
      </header>
    </>
  );
}

/** The steps on a phone, under the order. @internal */
export function MobileSteps({ withDetails }: { withDetails?: boolean }) {
  const context = useCheckoutContext();
  if (context.customization.config?.showSteps === false) return null;
  const steps = stepsOfScreen(context, withDetails);
  if (!steps) return null;
  return stepsOf(context, steps, 'novapay:px-4 novapay:pt-3.5');
}
