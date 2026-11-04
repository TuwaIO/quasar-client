import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '@tuwaio/nova-core';
import type { Buyer } from '@tuwaio/quasar-sdk';
import { type FormEvent, Fragment, useId, useMemo, useState } from 'react';

import { useCheckoutContext } from '../hooks/useCheckoutContext';
import type { NovaPaymentsLabels } from '../i18n';
import {
  type BuyerCollect,
  buyerFields,
  type BuyerIssue,
  buyerIssues,
  cleanBuyer,
  countryOptions,
} from '../utils/buyer';
import { focusRing } from './classes';
import { PrimaryButton, ScreenContent, ScreenError, ScreenFooter } from './ScreenParts';

type Values = Partial<Record<keyof Buyer, string>>;

/** The label of a field. */
const fieldLabel = (labels: NovaPaymentsLabels, name: keyof Buyer, company: boolean) =>
  name === 'name' && company
    ? labels.buyer.companyName
    : (labels.buyer[name as keyof NovaPaymentsLabels['buyer']] ?? name);

/** The message of a refused field. */
const issueText = (labels: NovaPaymentsLabels, issue: BuyerIssue) =>
  issue === 'email'
    ? labels.buyer.invalidEmail
    : issue === 'country'
      ? labels.buyer.invalidCountry
      : labels.buyer.required;

/** Fields on two columns from 640 px; the others take the whole row. */
const HALF_WIDTH = new Set<keyof Buyer>(['postalCode', 'city', 'taxId', 'registrationNumber']);

/** Inputs keep a 3:1 border against the page (WCAG 1.4.11); the focused one turns to the accent. */
const inputClass = (invalid: boolean) =>
  cn(
    'novapay:h-10 novapay:w-full novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:bg-[var(--tuwa-bg-primary)] novapay:px-3 novapay:text-[13px] novapay:text-[var(--tuwa-text-primary)] novapay:transition-colors novapay:focus:border-[var(--tuwa-text-accent)]',
    invalid
      ? 'novapay:border-[var(--tuwa-error-icon)]'
      : 'novapay:border-[var(--tuwa-text-secondary)] novapay:hover:border-[var(--tuwa-text-primary)]',
    focusRing,
  );

/**
 * The buyer details step, shown when the merchant's settings ask for the buyer and the invoice was issued without
 * them: the email, then a company invoice on request (a card under the email), then the details — the name, the
 * country, the address, and for a company its tax ID. The fields carry `autocomplete` tokens (WCAG 1.3.5), errors are
 * tied to their fields and announced, and the invoice document is issued once the details are taken.
 *
 * @returns The buyer details step.
 */
export function BuyerScreen() {
  const { checkout, state, store, labels, locale } = useCheckoutContext();
  const [values, setValues] = useState<Values>({});
  const [company, setCompany] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const id = useId();
  const countries = useMemo(() => countryOptions(locale), [locale]);
  if (!checkout || checkout.buyer.collect === 'off') return null;

  const collect = checkout.buyer.collect as BuyerCollect;
  const fields = buyerFields(collect, company);
  const issues = buyerIssues(values, collect, company);
  const set = (name: keyof Buyer, value: string) => setValues((current) => ({ ...current, [name]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(issues).length > 0) {
      document.getElementById(`${id}-${Object.keys(issues)[0]}`)?.focus();
      return;
    }
    setSending(true);
    await store.getState().setBuyer(cleanBuyer(values), { company });
    setSending(false);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="novapay:flex novapay:flex-1 novapay:flex-col"
    >
      <ScreenContent title={labels.buyer.title} subtitle={labels.buyer.subtitle}>
        <div className="novapay:grid novapay:grid-cols-1 novapay:gap-x-3 novapay:gap-y-3.5 novapay:pt-1 novapay:sm:grid-cols-2">
          {fields.map((field, index) => {
            const inputId = `${id}-${field.name}`;
            const issue = submitted ? issues[field.name] : undefined;
            const input =
              field.type === 'country' ? (
                <div className="novapay:relative">
                  <select
                    id={inputId}
                    autoComplete={field.autoComplete}
                    required={field.required}
                    aria-invalid={Boolean(issue)}
                    aria-describedby={issue ? `${inputId}-error` : undefined}
                    value={values.country ?? ''}
                    onChange={(event) => set('country', event.target.value)}
                    className={cn(
                      inputClass(Boolean(issue)),
                      'novapay:cursor-pointer novapay:appearance-none novapay:pr-9',
                      !values.country && 'novapay:text-[var(--tuwa-text-secondary)]',
                    )}
                  >
                    <option value="">{labels.buyer.chooseCountry}</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden
                    className="novapay:pointer-events-none novapay:absolute novapay:top-1/2 novapay:right-3 novapay:h-4 novapay:w-4 novapay:-translate-y-1/2 novapay:text-[var(--tuwa-text-secondary)]"
                  />
                </div>
              ) : (
                <input
                  id={inputId}
                  type={field.type}
                  autoComplete={field.autoComplete}
                  required={field.required}
                  aria-invalid={Boolean(issue)}
                  aria-describedby={issue ? `${inputId}-error` : undefined}
                  value={values[field.name] ?? ''}
                  onChange={(event) => set(field.name, event.target.value)}
                  className={inputClass(Boolean(issue))}
                />
              );
            return (
              <Fragment key={field.name}>
                <div
                  className={cn(
                    'novapay:flex novapay:flex-col novapay:gap-1.5',
                    !HALF_WIDTH.has(field.name) && 'novapay:sm:col-span-2',
                  )}
                >
                  <label
                    htmlFor={inputId}
                    className="novapay:text-xs novapay:font-medium novapay:text-[var(--tuwa-text-primary)]"
                  >
                    {fieldLabel(labels, field.name, company)}
                    {!field.required && (
                      <span className="novapay:font-normal novapay:text-[var(--tuwa-text-secondary)]">
                        {' '}
                        ({labels.buyer.optional})
                      </span>
                    )}
                  </label>
                  {input}
                  {issue && (
                    <span id={`${inputId}-error`} className="novapay:text-[11px] novapay:text-[var(--tuwa-error-text)]">
                      {issueText(labels, issue)}
                    </span>
                  )}
                </div>
                {/* The company invoice right under the email: it decides which details follow */}
                {index === 0 && checkout.buyer.companyInvoice && (
                  <label
                    className={cn(
                      'novapay:flex novapay:cursor-pointer novapay:items-center novapay:gap-2.5 novapay:rounded-[var(--tuwa-rounded-corners)] novapay:border novapay:px-3 novapay:py-2.5 novapay:text-[13px] novapay:transition-colors novapay:sm:col-span-2',
                      // As the option cards: one border width, the choice adds a ring, nothing moves
                      company
                        ? 'novapay:border-[var(--tuwa-text-accent)] novapay:bg-[var(--tuwa-bg-primary)] novapay:ring-1 novapay:ring-[var(--tuwa-text-accent)]'
                        : 'novapay:border-[var(--tuwa-border-primary)] novapay:bg-[var(--tuwa-bg-secondary)] novapay:hover:border-[var(--tuwa-text-secondary)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={company}
                      onChange={(event) => setCompany(event.target.checked)}
                      className={cn(
                        'novapay:h-4 novapay:w-4 novapay:shrink-0 novapay:accent-[var(--tuwa-text-accent)]',
                        focusRing,
                      )}
                    />
                    <span className="novapay:font-semibold">{labels.buyer.companyInvoice}</span>
                  </label>
                )}
              </Fragment>
            );
          })}
        </div>
        {state.error && state.phase === 'buyer' && <ScreenError>{state.error.message}</ScreenError>}
      </ScreenContent>
      <ScreenFooter>
        <PrimaryButton type="submit" busy={sending}>
          {labels.buyer.continue}
        </PrimaryButton>
      </ScreenFooter>
    </form>
  );
}
