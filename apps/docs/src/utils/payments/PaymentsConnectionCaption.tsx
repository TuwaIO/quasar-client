import { usePaymentsConnection } from '@tuwaio/nova-payments';

/** The wallet connection the payments below use (`usePaymentsConnection`), shown above them in the stories. */
export function PaymentsConnectionCaption() {
  const connection = usePaymentsConnection();
  return (
    <p className="mb-3 text-sm text-[var(--tuwa-text-primary)]">
      Wallet connection: <code data-testid="payments-connection">{connection}</code>
    </p>
  );
}
