import type { NovaPaymentsLabels } from './types';

/**
 * The English labels of Nova Payments, the default for every language until its own labels are added.
 */
export const defaultLabels: NovaPaymentsLabels = {
  common: {
    close: 'Close',
    retry: 'Try again',
    loading: 'Loading the checkout…',
    dialogTitle: 'Pay {merchant}',
  },
  error: {
    title: "The checkout can't be opened",
    notFound: 'This payment link is wrong or no longer works. Ask the seller for a new one.',
    generic: 'Something went wrong. Try again in a moment.',
  },
  steps: {
    details: 'Details',
    method: 'Method',
    pay: 'Pay',
    confirm: 'Confirm',
    autoPay: 'Auto-pay',
    progress: 'Step {current} of {total}: {name}',
    label: 'Payment steps',
  },
  language: {
    button: 'Language: {language}',
    title: 'Language',
    note: 'Your invoice and receipt use this language too.',
    noteAfterPaid: 'Your receipt stays in the language it was issued in.',
  },
  summary: {
    test: 'Test',
    testHint: 'Test invoice: it is paid on a test network.',
    sellerDetails: 'Seller details',
    registration: 'Company number',
    taxId: 'VAT ID',
    terms: 'Terms',
    refundPolicy: 'Refund policy',
    privacy: 'Privacy',
    sellerRole:
      '{seller} is the seller. Quasar is the payment software: it never holds your funds and is not a party to this purchase.',
    payWithin: 'Pay within',
    until: 'until {date}',
    minutesLeft: '{minutes} minutes left to pay',
    oneMinuteLeft: '1 minute left to pay',
    invoice: 'Invoice',
    quantity: '{quantity} × {price}',
    subtotal: 'Subtotal',
    taxRate: 'VAT {rate}%',
    tax: 'VAT',
    total: 'Total',
    secured: 'Secured by Quasar',
    help: 'Help',
    compact: '{count} items · incl. VAT {tax}',
    showOrder: 'Details',
  },
};
