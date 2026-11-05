import { cn } from '@tuwaio/nova-core';
import { type FormEvent, useId, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import { focusRing, mono } from './classes';
import { FooterAction, ScreenError, SecondaryButton } from './ScreenParts';

const EVM_TRANSACTION = /^0x[0-9a-fA-F]{64}$/;
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

/**
 * The way to name the real transaction of a payment Quasar could not confirm. A payment sped up in the wallet goes out under
 * another hash than the one the page handed over, and only the buyer can see it. Quasar reads what is named from the chain:
 * naming a hash proves nothing by itself. Shown only while a price is locked, as Quasar takes a transaction only then.
 *
 * Side effects: hands the transaction to Quasar through `submit` of the checkout store.
 *
 * @returns The link that opens the field, then the field; nothing without a locked price.
 * @internal
 */
export function NameTransaction() {
  const { store, state, checkout, labels, wallet } = useCheckoutContext();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const locked = state.quote ?? checkout?.quote;
  if (!locked) return null;
  const text = labels.outcome;

  if (!open) return <FooterAction onClick={() => setOpen(true)}>{text.nameHash}</FooterAction>;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const txKey = value.trim();
    const form = locked.instructions.family === 'solana' ? SOLANA_SIGNATURE : EVM_TRANSACTION;
    if (!form.test(txKey)) return setProblem(text.nameHashInvalid);
    setProblem(null);
    setBusy(true);
    const taken = await store.getState().submit({ txKey, ...(wallet ? { from: wallet.address } : {}) });
    setBusy(false);
    if (!taken) setProblem(text.nameHashRefused);
  };

  return (
    <form
      onSubmit={(event) => void send(event)}
      className="novapay:flex novapay:w-full novapay:max-w-sm novapay:flex-col novapay:gap-2 novapay:text-left"
    >
      <label htmlFor={id} className="novapay:text-xs novapay:font-semibold">
        {text.nameHashField}
      </label>
      <input
        id={id}
        value={value}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={problem ? true : undefined}
        onChange={(event) => setValue(event.target.value)}
        className={cn(
          mono,
          'novapay:box-border novapay:h-10 novapay:w-full novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:text-xs novapay:text-[var(--tuwa-text-primary)]',
          focusRing,
        )}
      />
      {problem && <ScreenError>{problem}</ScreenError>}
      <SecondaryButton type="submit" disabled={busy || !value.trim()}>
        {text.nameHashSend}
      </SecondaryButton>
    </form>
  );
}
