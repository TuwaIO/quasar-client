/**
 * @file The buyer details the checkout collects when the merchant's settings ask for them (plan 12 §6.8): which
 * fields, what is missing, and the countries to pick from.
 */

import type { Buyer } from '@tuwaio/quasar-sdk';

/** A field of the buyer details form. */
export interface BuyerField {
  /** The field of `Buyer`. */
  name: keyof Buyer;
  /** Whether the invoice needs it. */
  required: boolean;
  /** The `autocomplete` token, so browsers fill it in (WCAG 1.3.5). */
  autoComplete: string;
  /** The input type. */
  type: 'email' | 'text' | 'country';
}

/** Why a field is refused: missing, not an email, not a country code. */
export type BuyerIssue = 'required' | 'email' | 'country';

/** What the checkout collects: `email` or `full` details (the checkout view's `buyer.collect`). */
export type BuyerCollect = 'email' | 'full';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ISO 3166-1 alpha-2 codes. */
const COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC ' +
  'CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD ' +
  'GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH ' +
  'KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW ' +
  'MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC ' +
  'SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY ' +
  'UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');
const COUNTRIES = new Set(COUNTRY_CODES);

/**
 * The fields of the form, in order.
 *
 * @param collect - What the checkout collects.
 * @param company - The buyer wants an invoice for a company: name, address line, country and tax ID are needed.
 * @returns The fields.
 */
export function buyerFields(collect: BuyerCollect, company: boolean): BuyerField[] {
  const full = collect === 'full' || company;
  const fields: BuyerField[] = [{ name: 'email', required: true, autoComplete: 'email', type: 'email' }];
  if (!full) return fields;
  return [
    ...fields,
    { name: 'name', required: true, autoComplete: company ? 'organization' : 'name', type: 'text' },
    // The country first: an address is read, and its format chosen, from it
    { name: 'country', required: true, autoComplete: 'country', type: 'country' },
    { name: 'addressLine1', required: true, autoComplete: 'address-line1', type: 'text' },
    { name: 'addressLine2', required: false, autoComplete: 'address-line2', type: 'text' },
    { name: 'postalCode', required: false, autoComplete: 'postal-code', type: 'text' },
    { name: 'city', required: false, autoComplete: 'address-level2', type: 'text' },
    ...(company ? companyFields() : []),
  ];
}

const companyFields = (): BuyerField[] => [
  { name: 'taxId', required: true, autoComplete: 'off', type: 'text' },
  { name: 'registrationNumber', required: false, autoComplete: 'off', type: 'text' },
];

/**
 * What is missing or invalid in the details, field by field.
 *
 * @param buyer - The details as typed.
 * @param collect - What the checkout collects.
 * @param company - Whether the buyer wants a company invoice.
 * @returns The issue of each refused field; empty when the details can be sent.
 */
export function buyerIssues(
  buyer: Partial<Record<keyof Buyer, string>>,
  collect: BuyerCollect,
  company: boolean,
): Partial<Record<keyof Buyer, BuyerIssue>> {
  const issues: Partial<Record<keyof Buyer, BuyerIssue>> = {};
  for (const field of buyerFields(collect, company)) {
    const value = buyer[field.name]?.trim() ?? '';
    if (!value) {
      if (field.required) issues[field.name] = 'required';
    } else if (field.type === 'email' && !EMAIL.test(value)) issues[field.name] = 'email';
    else if (field.type === 'country' && !COUNTRIES.has(value.toUpperCase())) issues[field.name] = 'country';
  }
  return issues;
}

/**
 * The details to send: trimmed, empty ones left out, the country in capitals.
 *
 * @param buyer - The details as typed.
 * @returns The `Buyer` for `setBuyer` of the checkout store.
 */
export function cleanBuyer(buyer: Partial<Record<keyof Buyer, string>>): Buyer {
  const clean: Buyer = {};
  for (const [name, value] of Object.entries(buyer) as [keyof Buyer, string | undefined][]) {
    const trimmed = value?.trim();
    if (trimmed) clean[name] = name === 'country' ? trimmed.toUpperCase() : trimmed;
  }
  return clean;
}

/**
 * The countries to pick from, named in the language of the page (`Intl.DisplayNames`) and sorted by name.
 *
 * @param locale - BCP 47 language of the page.
 * @returns The country codes and names.
 */
export function countryOptions(locale: string): { code: string; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
}
