/**
 * @file A checkout for component tests: methods, a view, a fake store and a context value, and helpers that search
 * the element tree a component returns (the package has no DOM testing library).
 */

import type { CheckoutMethod, CheckoutState, CheckoutView } from '@tuwaio/quasar-sdk/checkout';
import { isValidElement, type ReactElement } from 'react';
import { vi } from 'vitest';

import type { CheckoutContextValue } from '../components/checkoutContext';
import { defaultLabels } from '../i18n';

/** A method of the test checkout. */
export const method = (id: string, symbol: string, chainId: string, featured = false): CheckoutMethod =>
  ({
    id,
    name: `${symbol} on ${chainId}`,
    symbol,
    chainId,
    assetId: null,
    decimals: 6,
    gasless: 'off',
    featured,
    markupBps: 0,
    discountBps: 0,
  }) as CheckoutMethod;

/** USDC on two networks and SOL. */
export const methods = [
  method('usdc-base', 'USDC', 'eip155:8453', true),
  method('usdc-eth', 'USDC', 'eip155:1'),
  method('sol', 'SOL', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
];

/** An open invoice of 2.00 USD with {@link methods}. */
export const checkout = {
  invoice: {
    id: 'inv_1',
    number: 'INV-1',
    status: 'open',
    currency: 'USD',
    totalMinor: '200',
    lineItems: [],
    dueAt: null,
    environment: 'live',
    replacedBy: null,
  },
  merchant: {
    name: 'Cosmos',
    website: null,
    supportEmail: null,
    seller: null,
    fundingUrl: null,
    links: { terms: null, refundPolicy: null, privacy: null },
  },
  methods,
  quoteTtlSeconds: 900,
  autoCharge: null,
} as unknown as CheckoutView;

/** The actions of a fake checkout store, as spies. */
export function fakeStore() {
  const actions = {
    selectMethod: vi.fn(),
    setPayer: vi.fn(),
    setConsentGiven: vi.fn(),
    requestQuote: vi.fn(async () => null),
    releaseQuote: vi.fn(),
    setLocale: vi.fn(async () => true),
    load: vi.fn(async () => undefined),
  };
  return { actions, store: { getState: () => actions } as unknown as CheckoutContextValue['store'] };
}

/**
 * A checkout context on the method step of {@link checkout}, USDC on Base chosen.
 *
 * @param customization - The customization of the checkout.
 * @param extra - Fields to replace.
 * @returns The context value.
 */
export function checkoutContextValue(
  customization: CheckoutContextValue['customization'],
  extra: Partial<CheckoutContextValue> = {},
): CheckoutContextValue {
  return {
    store: fakeStore().store,
    state: {
      phase: 'selectMethod',
      checkout,
      methodId: 'usdc-base',
      quote: null,
      error: null,
    } as unknown as CheckoutState,
    checkout,
    screen: 'method',
    locale: 'en',
    labels: defaultLabels,
    now: 0,
    wallet: null,
    payWith: 'wallet',
    setPayWith: vi.fn(),
    payUrl: null,
    connectWallet: vi.fn(() => true),
    adapterFor: () => ({ family: 'eip155' }) as never,
    handoff: false,
    setHandoff: vi.fn(),
    backToMethods: vi.fn(),
    onPaymentSent: vi.fn(),
    autoPay: false,
    setAutoPay: vi.fn(),
    openInvoice: vi.fn(),
    autoReturnSeconds: 5,
    customization,
    ...extra,
  } as CheckoutContextValue;
}

/** Every element of the tree (children and element props), depth first. */
export function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...Object.values(element.props).flatMap(elements)];
}

/** The elements of a component type in the tree. */
export const ofType = (node: unknown, type: unknown) => elements(node).filter((element) => element.type === type);

/** Whether an element of the tree has the class. */
export const hasClass = (node: unknown, name: string) =>
  elements(node).some((element) =>
    String(element.props.className ?? '')
      .split(' ')
      .includes(name),
  );
