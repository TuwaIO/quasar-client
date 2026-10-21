import { describe, expect, it } from 'vitest';

import { buyerFields, buyerIssues, cleanBuyer, countryOptions } from './buyer';

describe('buyer details', () => {
  it('asks for the email, the full details, or the company details', () => {
    expect(buyerFields('email', false).map((field) => field.name)).toEqual(['email']);
    expect(
      buyerFields('full', false)
        .filter((field) => field.required)
        .map((field) => field.name),
    ).toEqual(['email', 'name', 'country', 'addressLine1']);
    expect(
      buyerFields('full', true)
        .filter((field) => field.required)
        .map((field) => field.name),
    ).toEqual(['email', 'name', 'country', 'addressLine1', 'taxId']);
    expect(buyerFields('email', true).map((field) => field.name)).toContain('taxId');
  });

  it('asks for the country right after the name, as an address starts with it', () => {
    expect(buyerFields('full', false).map((field) => field.name)).toEqual([
      'email',
      'name',
      'country',
      'addressLine1',
      'addressLine2',
      'postalCode',
      'city',
    ]);
  });

  it('names each missing or invalid field, as the engine would refuse it', () => {
    expect(buyerIssues({ email: 'buyer@example.com' }, 'email', false)).toEqual({});
    expect(buyerIssues({}, 'email', false)).toEqual({ email: 'required' });
    expect(buyerIssues({ email: 'not an email' }, 'email', false)).toEqual({ email: 'email' });
    expect(buyerIssues({ email: 'a@b.co', name: 'Ana', addressLine1: 'Main 1', country: 'ES' }, 'full', true)).toEqual({
      taxId: 'required',
    });
    expect(buyerIssues({ email: 'a@b.co', name: ' ', addressLine1: 'Main 1', country: 'XX' }, 'full', false)).toEqual({
      name: 'required',
      country: 'country',
    });
  });

  it('sends trimmed values and leaves empty ones out', () => {
    expect(cleanBuyer({ email: ' a@b.co ', name: '', city: ' Madrid ', country: 'es' })).toEqual({
      email: 'a@b.co',
      city: 'Madrid',
      country: 'ES',
    });
  });

  it('lists the countries under their names in the language of the page, sorted', () => {
    const options = countryOptions('uk');
    expect(options.find((option) => option.code === 'DE')?.name).toBe('Німеччина');
    expect(options.length).toBeGreaterThan(240);
    expect(options[0].name.localeCompare(options[1].name, 'uk')).toBeLessThanOrEqual(0);
  });
});
