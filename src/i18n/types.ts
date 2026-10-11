/**
 * All texts of the Nova Payments checkout, screen readers' included. `{name}` placeholders are filled by the
 * checkout. Pass a partial object as `labels` of `NovaPaymentsProvider` to override some of them in every language.
 */
export type NovaPaymentsLabels = {
  /** Shared texts. */
  common: {
    /** Close buttons, and the accessible name of the close icon (default: `Close`) */
    close: string;
    /** Retry buttons (default: `Try again`) */
    retry: string;
    /** While the checkout loads (default: `Loading the checkout…`) */
    loading: string;
    /** Accessible title of the checkout dialog; `{merchant}` is the seller's name (default: `Pay {merchant}`) */
    dialogTitle: string;
  };
  /** The checkout cannot be opened. */
  error: {
    /** Heading (default: `The checkout can't be opened`) */
    title: string;
    /** The link is wrong or no longer works (`checkout_not_found`) */
    notFound: string;
    /** Any other failure */
    generic: string;
  };
  /** The stepper in the header. */
  steps: {
    /** Buyer details (default: `Details`) */
    details: string;
    /** Payment method (default: `Method`) */
    method: string;
    /** Payment (default: `Pay`) */
    pay: string;
    /** Confirmation on the network (default: `Confirm`) */
    confirm: string;
    /** Automatic payments of a subscription (default: `Auto-pay`) */
    autoPay: string;
    /** Accessible name of the current step: `{current}`, `{total}`, `{name}` (default: `Step {current} of {total}: {name}`) */
    progress: string;
    /** Accessible name of the stepper (default: `Payment steps`) */
    label: string;
  };
  /** The language menu in the header. */
  language: {
    /** Accessible name of the button; `{language}` is the current language (default: `Language: {language}`) */
    button: string;
    /** Title of the menu (default: `Language`) */
    title: string;
    /** Under the list before payment (default: `Your invoice and receipt use this language too.`) */
    note: string;
    /** Under the list once the receipt is issued */
    noteAfterPaid: string;
  };
  /** The method step: the token, its network and how to pay. */
  method: {
    /** Heading (default: `Choose how to pay`) */
    title: string;
    /** Under the heading; `{minutes}` is how long a price holds (default: `The price locks for {minutes} minutes when you continue.`) */
    subtitle: string;
    /** Name of the token group (default: `Token`) */
    token: string;
    /** Under a token with several networks; `{count}` (default: `{count} networks`) */
    networks: string;
    /** Name of the network group; `{symbol}` (default: `{symbol} network`) */
    network: string;
    /** Badge of the connected wallet's network (default: `Your wallet`) */
    yourWallet: string;
    /** Badge of a method the merchant marks (default: `Popular`) */
    popular: string;
    /** A method whose gas the merchant may pay (default: `No gas fee`) */
    noGasFee: string;
    /** A method whose gas the buyer pays (default: `You pay the network fee`) */
    buyerPaysGas: string;
    /** Discount of a method; `{percent}` (default: `−{percent}%`) */
    discount: string;
    /** Markup of a method; `{percent}` (default: `+{percent}%`) */
    markup: string;
    /** Name of the payment way group (default: `Pay with`) */
    payWith: string;
    /** Pay from a wallet in this browser (default: `Wallet`) */
    wallet: string;
    /** Under "Wallet" without a connected wallet (default: `MetaMask, Rabby, Phantom…`) */
    walletHint: string;
    /** Pay by scanning a QR code (default: `QR code`) */
    qr: string;
    /** Under "QR code" (default: `Phone wallet`) */
    qrHint: string;
    /** Main button (default: `Continue`) */
    continue: string;
    /** While the price is being locked (default: `Getting the price…`) */
    quoting: string;
    /** Under the button with both policies; `{terms}`, `{refundPolicy}` are links (default: `By continuing you agree to the seller's {terms} and {refundPolicy}.`) */
    agreeBoth: string;
    /** Under the button with one policy; `{link}` (default: `By continuing you agree to the seller's {link}.`) */
    agreeOne: string;
    /** No method takes the invoice */
    noMethods: string;
  };
  /** The buyer details step. */
  buyer: {
    /** Heading (default: `Your details`) */
    title: string;
    /** Under the heading (default: `The seller needs them for the invoice and the receipt.`) */
    subtitle: string;
    /** Email field (default: `Email`) */
    email: string;
    /** Name field of a person (default: `Name`) */
    name: string;
    /** Name field of a company (default: `Company`) */
    companyName: string;
    /** First address line (default: `Address`) */
    addressLine1: string;
    /** Second address line (default: `Address, line 2`) */
    addressLine2: string;
    /** Postal code (default: `Postal code`) */
    postalCode: string;
    /** City (default: `City`) */
    city: string;
    /** Country (default: `Country`) */
    country: string;
    /** Placeholder of the country list (default: `Choose a country`) */
    chooseCountry: string;
    /** Tax ID (default: `VAT or tax ID`) */
    taxId: string;
    /** Company registration number (default: `Company number`) */
    registrationNumber: string;
    /** Marks an optional field (default: `optional`) */
    optional: string;
    /** Checkbox for a company invoice (default: `I need an invoice for my company`) */
    companyInvoice: string;
    /** A required field is empty (default: `Required`) */
    required: string;
    /** The email is not one (default: `Enter an email like name@example.com`) */
    invalidEmail: string;
    /** The country is not on the list (default: `Choose a country from the list`) */
    invalidCountry: string;
    /** Main button (default: `Continue`) */
    continue: string;
  };
  /** The order panel: the seller, the deadline, the lines and the total. */
  summary: {
    /** Badge of a test invoice (default: `Test`) */
    test: string;
    /** Accessible description of the test badge */
    testHint: string;
    /** Button that shows the seller details (default: `Seller details`) */
    sellerDetails: string;
    /** Company number of the seller (default: `Company number`) */
    registration: string;
    /** Tax number of the seller (default: `VAT ID`) */
    taxId: string;
    /** Link to the merchant's terms (default: `Terms`) */
    terms: string;
    /** Link to the merchant's refund policy (default: `Refund policy`) */
    refundPolicy: string;
    /** Link to the merchant's privacy notice (default: `Privacy`) */
    privacy: string;
    /** What Quasar is and is not; `{seller}` is the seller's name */
    sellerRole: string;
    /** Above the countdown (default: `Pay within`) */
    payWithin: string;
    /** Under the countdown; `{date}` is the deadline (default: `until {date}`) */
    until: string;
    /** Announced 10 and 5 minutes before the deadline; `{minutes}` (default: `{minutes} minutes left to pay`) */
    minutesLeft: string;
    /** Announced a minute before the deadline (default: `1 minute left to pay`) */
    oneMinuteLeft: string;
    /** Label of the invoice number (default: `Invoice`) */
    invoice: string;
    /** Quantity and unit price of a line: `{quantity}`, `{price}` (default: `{quantity} × {price}`) */
    quantity: string;
    /** Sum of the lines before tax (default: `Subtotal`) */
    subtotal: string;
    /** Tax row; `{rate}` is the rate when all lines share one (default: `VAT {rate}%`) */
    taxRate: string;
    /** Tax row when the lines have different rates (default: `VAT`) */
    tax: string;
    /** Total row (default: `Total`) */
    total: string;
    /** Under the order (default: `Secured by Quasar`) */
    secured: string;
    /** Before the seller's support email (default: `Help`) */
    help: string;
    /** On a phone: the number of lines and the tax; `{count}`, `{tax}` (default: `{count} items · incl. VAT {tax}`) */
    compact: string;
    /** On a phone: button that shows the order (default: `Details`) */
    showOrder: string;
  };
};
