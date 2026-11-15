import { cn, QuasarLoader } from '@tuwaio/nova-core';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import type { PayeeStatus } from '../utils/payee';
import { ScreenContent, ScreenError, ScreenFooter, SecondaryButton } from './ScreenParts';

/**
 * What the pay and QR steps show instead of the payment until the checkout store verified the payee of the quote. While
 * the check runs, a wait that appears only when it takes more than a moment: an ordinary wallet's signature is checked
 * in the page at once, a smart wallet's asks its contract on the network. When the address could not be confirmed as
 * the merchant's, a refusal: the address is never shown and the wallet never asked, whatever the reason, which
 * `data-payee-refusal` names for the integrator (`payee_unsigned`, `payee_mismatch`, `payee_not_pinned`,
 * `payee_unverified`).
 *
 * @param props - Where the check stands.
 * @param props.payee - `checking`, or `refused` with its reason ({@link payeeStatus}).
 * @returns The step.
 */
export function PayeeScreen({ payee }: { payee: Exclude<PayeeStatus, { status: 'verified' }> }) {
  const { labels, checkout, state, backToMethods } = useCheckoutContext();
  if (payee.status === 'checking') {
    return (
      <div
        role="status"
        className={cn(
          'novapay:flex novapay:flex-1 novapay:flex-col novapay:items-center novapay:justify-center novapay:gap-3 novapay:p-8 novapay:text-sm novapay:text-[var(--tuwa-text-secondary)]',
          'novapay-payee-wait',
        )}
      >
        <QuasarLoader size={40} />
        {labels.pay.payeeChecking}
      </div>
    );
  }
  const merchant = checkout?.merchant.name ?? '';
  // The rest of an underpaid invoice goes back to the invoice, not to the methods
  const rest = (state.invoiceStatus ?? checkout?.invoice.status) === 'underpaid';
  return (
    <>
      <ScreenContent title={labels.pay.payeeRefusedTitle}>
        <div data-payee-refusal={payee.reason}>
          <ScreenError>{formatLabel(labels.pay.payeeRefused, { merchant })}</ScreenError>
        </div>
      </ScreenContent>
      <ScreenFooter>
        <SecondaryButton onClick={backToMethods}>{rest ? labels.pay.backFromRest : labels.pay.back}</SecondaryButton>
      </ScreenFooter>
    </>
  );
}
