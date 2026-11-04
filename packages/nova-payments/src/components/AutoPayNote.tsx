import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { formatLabel } from '../i18n';
import { textButton } from './classes';
import { FooterNote } from './ScreenParts';

/**
 * The note on a screen of an invoice of a subscription: automatic payments are on, with the control that turns them off.
 * Just after they were turned off, it says so instead. Nothing otherwise.
 *
 * @returns The note, or nothing.
 */
export function AutoPayNote() {
  const { checkout, labels, autoPayOff, setAutoPayOff } = useCheckoutContext();
  const offer = checkout?.autoCharge;
  if (autoPayOff === 'done') {
    return (
      <FooterNote>{formatLabel(labels.paid.autoPayTurnedOff, { merchant: checkout?.merchant.name ?? '' })}</FooterNote>
    );
  }
  if (offer?.status !== 'active' || !offer.revocation) return null;
  return (
    <FooterNote>
      {labels.paid.autoPayActive}{' '}
      <button type="button" onClick={() => setAutoPayOff('open')} className={textButton}>
        {labels.paid.autoPayOff}
      </button>
    </FooterNote>
  );
}
