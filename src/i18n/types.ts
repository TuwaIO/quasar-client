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
    /** The page can pay the chosen method neither from a wallet nor with a QR code */
    methodUnavailable: string;
    /** The seller named the paying wallet, and it is another one (`payer_not_expected`) */
    payerNotExpected: string;
    /** Too many tries (`rate_limited`) (default: `Too many tries. Wait a minute and try again.`) */
    rateLimited: string;
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
  /** The pay step: the wallet, the locked price, the network fee and the main action. */
  pay: {
    /** Heading, read by screen readers (default: `Pay`) */
    title: string;
    /** The connected wallet under its name: `{address}`, `{network}` (default: `{address} · {network}`) */
    walletLine: string;
    /** Button that changes the wallet (default: `Change`) */
    change: string;
    /** Accessible name of that button (default: `Change wallet`) */
    changeWallet: string;
    /** Above the amount (default: `You send`) */
    youSend: string;
    /** Accessible name of the copy button (default: `Copy amount`) */
    copyAmount: string;
    /** After copying (default: `Copied`) */
    copied: string;
    /** Under the amount: `{network}` (default: `on {network}`) */
    onNetwork: string;
    /** The invoice value of the amount: `{amount}`, `{currency}` (default: `= {amount} {currency}`) */
    fiatValue: string;
    /** The price lock: `{time}` is a countdown (default: `Price locked for {time}`) */
    priceLocked: string;
    /** Button that locks a new price (default: `Refresh price`) */
    refreshPrice: string;
    /** In the last minute of the price: `{time}` (default: `This price ends in {time}. Keep it?`) */
    priceEnding: string;
    /** Button that locks the price again: `{minutes}` (default: `Keep this price · +{minutes} min`) */
    keepPrice: string;
    /** The price lock ran out (default: `The price lock ran out.`) */
    priceExpired: string;
    /** Button that locks a new price after it ran out (default: `Get a new price`) */
    newPrice: string;
    /** Row of the rate (default: `Rate`) */
    rate: string;
    /** The rate: `{symbol}`, `{price}`, `{currency}` (default: `1 {symbol} = {price} {currency}`) */
    rateValue: string;
    /** Row of the network fee (default: `Network fee`) */
    networkFee: string;
    /** The merchant pays the gas: `{merchant}` (default: `{merchant} pays · you only sign`) */
    merchantPaysGas: string;
    /** The buyer pays the gas: `{amount}` is the estimate (default: `≈ {amount} · from your wallet`) */
    gasEstimate: string;
    /** The buyer pays the gas, estimate unknown (default: `Paid from your wallet`) */
    gasFromWallet: string;
    /** Row of the recipient (default: `To`) */
    to: string;
    /** Row of the invoice total, with a token transfer fee (default: `Invoice total`) */
    invoiceTotal: string;
    /** Row of the token's transfer fee: `{percent}` (default: `Token transfer fee {percent}%`) */
    transferFee: string;
    /** Row of what the merchant receives: `{merchant}` (default: `{merchant} receives`) */
    merchantReceives: string;
    /** Why the buyer sends more with a transfer fee */
    transferFeeNote: string;
    /** Main button of a gasless payment: `{amount}` with its symbol (default: `Sign to pay {amount}`) */
    signToPay: string;
    /** Main button when the buyer pays the gas: `{amount}` (default: `Pay {amount}`) */
    payAmount: string;
    /** Main button on the wrong network: `{network}` (default: `Switch to {network}`) */
    switchTo: string;
    /** Main button without a wallet of the method's family (default: `Connect a wallet`) */
    connect: string;
    /** Link back to the method step (default: `Back to methods`) */
    back: string;
    /** Pays the gas instead of signing (default: `Pay with gas instead`) */
    payWithGas: string;
    /** Goes back to the gasless payment: `{merchant}` (default: `Let {merchant} pay the gas`) */
    payGasless: string;
    /** Under the button: `{merchant}` */
    disclaimer: string;
    /** Heading of the wrong network banner (default: `Wrong network`) */
    wrongNetwork: string;
    /** Text of the banner: `{current}`, `{network}` (default: `Your wallet is on {current}. This payment goes on {network}.`) */
    wrongNetworkText: string;
    /** Under the switch button (default: `Your wallet asks you to approve the switch.`) */
    switchHint: string;
    /** Heading of a short balance (default: `Not enough`) */
    notEnough: string;
    /** The balance: `{amount}`, `{network}` (default: `Your wallet has {amount} on {network}`) */
    walletHas: string;
    /** The difference: `{short}`, `{need}` (default: `{short} short of {need}.`) */
    shortBy: string;
    /** Above the methods the wallet can pay (default: `Pay from what this wallet has`) */
    payFromBalance: string;
    /** Balance under such a method: `{amount}` (default: `You have {amount}`) */
    youHave: string;
    /** Before the seller's top-up link: `{symbol}` (default: `Or add {symbol} to this wallet and come back:`) */
    topUp: string;
    /** The seller's top-up link: `{symbol}` (default: `Get {symbol}`) */
    getToken: string;
    /** Without a way to connect a wallet in this app */
    connectUnavailable: string;
    /** The buyer declined in the wallet: `{wallet}` (default: `You declined the request in {wallet}.`) */
    declined: string;
    /** Button after a declined request (default: `Try again`) */
    tryAgain: string;
    /** The transaction failed: `{network}` */
    failed: string;
    /** Button after a failed transaction (default: `Pay again`) */
    payAgain: string;
    /** The wallet cannot pay this way: `{wallet}` (default: `{wallet} can't make this payment.`) */
    unsupported: string;
    /** The wallet screening of Quasar is unavailable (default: `The wallet check is unavailable right now.`) */
    screeningUnavailable: string;
    /** Button then (default: `Try again in a minute`) */
    retryLater: string;
    /** No answer from Quasar */
    noAnswer: string;
    /** Title of the payment in the app's transaction history and toasts: `{merchant}` (default: `Payment to {merchant}`) */
    txTitle: string;
    /** Its description: `{amount}` with its symbol, `{invoice}` the invoice number (default: `{amount} · {invoice}`) */
    txDescription: string;
  };
  /** The window while the wallet asks the buyer. */
  walletPrompt: {
    /** Heading of a gasless signature: `{wallet}` (default: `Sign in {wallet}`) */
    signIn: string;
    /** Heading of a transaction: `{wallet}` (default: `Confirm in {wallet}`) */
    confirmIn: string;
    /** Heading while switching the network: `{wallet}` (default: `Approve the switch in {wallet}`) */
    switchIn: string;
    /** Text of a gasless signature: `{amount}`, `{merchant}`, `{network}` */
    signText: string;
    /** Text of a transaction: `{amount}`, `{merchant}`, `{network}` */
    confirmText: string;
    /** Above the things to check: `{wallet}` (default: `Check in {wallet} before signing`) */
    check: string;
    /** Row of the amount (default: `Amount`) */
    amount: string;
    /** Row of the recipient (default: `To`) */
    to: string;
    /** Row of the network (default: `Network`) */
    network: string;
    /** Row of the price lock (default: `Price locked`) */
    priceLocked: string;
    /** Before the retry button (default: `The wallet window didn't open?`) */
    notOpened: string;
    /** Retry button (default: `Try again`) */
    tryAgain: string;
    /** For a transaction that may still wait in the wallet: `{wallet}` */
    stillWaiting: string;
    /** Closes the window (default: `Cancel`) */
    cancel: string;
    /** While Quasar takes the payment (default: `Handing the payment to Quasar…`) */
    submitting: string;
  };
  /** The QR code step: Solana Pay, or this checkout on a phone. */
  qr: {
    /** Heading of Solana Pay (default: `Scan with a Solana wallet`) */
    solanaTitle: string;
    /** Under it (default: `Open Phantom, Solflare or Backpack`) */
    solanaHint: string;
    /** First step (default: `Scan the code (Solana Pay)`) */
    scanStep: string;
    /** Second step (default: `Approve the amount below`) */
    approveStep: string;
    /** Text alternative of the Solana Pay code: `{amount}` (default: `QR code of a Solana Pay request for {amount}`) */
    solanaCode: string;
    /** While waiting (default: `Waiting for the payment…`) */
    waiting: string;
    /** Why not to pay from an exchange */
    exchangeWarning: string;
    /** Link that opens the request in a wallet app (default: `Open in wallet app`) */
    openInWallet: string;
    /** Heading of the phone hand-off (default: `Pay on your phone`) */
    handoffTitle: string;
    /** Under it */
    handoffHint: string;
    /** Text alternative of the hand-off code (default: `QR code that opens this checkout on your phone`) */
    handoffCode: string;
    /** That this page follows the payment */
    handoffNote: string;
    /** Copies the link of the payment page (default: `Copy link`) */
    copyLink: string;
    /** Link back to the method step (default: `Back to methods`) */
    back: string;
  };
  /** The confirm step: the transaction is on its way. */
  confirm: {
    /** Heading (default: `Confirming your payment`) */
    title: string;
    /** Under the heading: `{network}` (default: `Usually under a minute on {network}.`) */
    hint: string;
    /** First step (default: `Sent`) */
    sent: string;
    /** Second step while it runs (default: `Confirming`) */
    confirming: string;
    /** Second step once the network confirmed the transaction (default: `Confirmed`) */
    confirmed: string;
    /** Last step (default: `Paid`) */
    paid: string;
    /** Last step when the transaction failed (default: `Failed`) */
    failed: string;
    /** Row of the network (default: `Network`) */
    network: string;
    /** Row of the amount (default: `Amount`) */
    amount: string;
    /** Row of the transaction (default: `Transaction`) */
    transaction: string;
    /** Row of the sender (default: `From`) */
    from: string;
    /** That the window may close */
    canClose: string;
    /** Accessible name of the explorer link of the transaction (default: `View on the explorer`) */
    viewOnExplorer: string;
    /** Accessible name of the copy button of the transaction (default: `Copy the transaction`) */
    copyHash: string;
  };
  /** The paid outcome. */
  paid: {
    /** Heading (default: `Payment received`) */
    title: string;
    /** Under the amount: `{network}`, `{date}` (default: `on {network} · {date}`) */
    summary: string;
    /** The receipt card (default: `Receipt`) */
    receipt: string;
    /** Under it (default: `PDF of the payment, also kept by the seller`) */
    receiptHint: string;
    /** Download link of the receipt (default: `Download`) */
    download: string;
    /** A part refunded later: `{amount}`, `{currency}` (default: `Refunded {amount} {currency}`) */
    refunded: string;
    /** Button back to the seller: `{merchant}` (default: `Back to {merchant}`) */
    back: string;
    /** Auto-return countdown: `{merchant}`, `{seconds}` (default: `Returning to {merchant} in {seconds} s`) */
    returning: string;
    /** Stops the auto-return (default: `Stay here`) */
    stay: string;
    /** Button of the automatic payments offer of a subscription (default: `Pay the next periods automatically`) */
    autoPayOffer: string;
    /** When automatic payments are on (default: `Automatic payments are on.`) */
    autoPayActive: string;
  };
  /** The automatic payments offer of a subscription (ERC-7715), after a paid period. */
  autoPay: {
    /** Heading (default: `Pay next periods automatically?`) */
    title: string;
    /** Under it */
    subtitle: string;
    /** Above the limit: `{merchant}` (default: `You allow {merchant} to take`) */
    allow: string;
    /** The limit: `{amount}` with its symbol (default: `up to {amount}`) */
    limit: string;
    /** The period: `{period}` (for example `30 days`) (default: `every {period}`) */
    every: string;
    /** Row of the paying wallet (default: `From`) */
    from: string;
    /** Row of the account that takes the payments (default: `To`) */
    to: string;
    /** Row of the expiry (default: `Valid until`) */
    validUntil: string;
    /** Its value: `{date}` (default: `{date}, or until you cancel`) */
    validUntilValue: string;
    /** First note (default: `Each charge comes with an invoice and a receipt by email.`) */
    invoices: string;
    /** Second note: `{merchant}` (default: `{merchant} can't take more than this limit in a period.`) */
    cap: string;
    /** Third note */
    turnOff: string;
    /** Main button (default: `Allow automatic payments`) */
    confirm: string;
    /** Declines (default: `Not now, I'll pay each invoice`) */
    skip: string;
    /** Under the buttons (default: `Your wallet shows this permission (ERC-7715) before you approve it.`) */
    walletNote: string;
    /** Heading while the wallet asks: `{wallet}` (default: `Approve in {wallet}`) */
    approveIn: string;
    /** The wallet cannot grant it: `{wallet}` (default: `{wallet} can't allow automatic payments.`) */
    unavailable: string;
  };
  /** The outcomes other than paid. */
  outcome: {
    /** Heading of an underpaid invoice (default: `Part of the payment arrived`) */
    underpaidTitle: string;
    /** What arrived: `{received}`, `{total}` (default: `{received} of {total} received.`) */
    underpaidText: string;
    /** What is left: `{rest}`, `{network}` (default: `Send the rest, {rest}, from the same wallet on {network}.`) */
    underpaidRest: string;
    /** Until when: `{merchant}`, `{date}` */
    underpaidNote: string;
    /** Button that pays the rest (default: `Pay the rest`) */
    payRest: string;
    /** Heading of a payment on review: `{merchant}` (default: `Payment received, {merchant} is checking it`) */
    heldTitle: string;
    /** Reason `screening`: `{merchant}` (default: `{merchant} checks the payment before confirming the order.`) */
    heldScreening: string;
    /** Reason `late`: `{merchant}` */
    heldLate: string;
    /** Reason `overpaid`: `{merchant}` */
    heldOverpaid: string;
    /** Under it (default: `The seller contacts you if anything is needed.`) */
    heldNote: string;
    /** Heading of a refunded invoice (default: `Refunded`) */
    refundedTitle: string;
    /** Its text: `{merchant}`, `{amount}`, `{currency}` (default: `{merchant} refunded this invoice: {amount} {currency}.`) */
    refundedText: string;
    /** Heading of an expired invoice (default: `This invoice has expired`) */
    expiredTitle: string;
    /** Its text: `{date}`, `{merchant}` */
    expiredText: string;
    /** Under it */
    expiredNote: string;
    /** Heading of a cancelled invoice (default: `This invoice was cancelled`) */
    cancelledTitle: string;
    /** Its text: `{merchant}` (default: `{merchant} cancelled it; nothing was charged.`) */
    cancelledText: string;
    /** Heading of a corrected invoice: `{merchant}` (default: `{merchant} corrected this invoice`) */
    replacedTitle: string;
    /** Its text: `{number}` of the new invoice (default: `{number} replaces it. This invoice can no longer be paid.`) */
    replacedText: string;
    /** Under it (default: `Already paid? Your payment moved to the new invoice.`) */
    replacedPaid: string;
    /** Opens the new invoice: `{number}` (default: `Open {number}`) */
    openReplacement: string;
    /** Heading when the wallet check refused the payer (default: `This wallet can't pay this invoice`) */
    blockedTitle: string;
    /** Its text: `{merchant}` */
    blockedText: string;
    /** Button that connects another wallet (default: `Use another wallet`) */
    useAnotherWallet: string;
    /** Contacts the seller: `{merchant}` (default: `Contact {merchant}`) */
    contact: string;
    /** Subject of the email to the seller: `{number}` (default: `Invoice {number}`) */
    contactSubject: string;
  };
  /** The question when the buyer closes the checkout before a transaction is sent. */
  leave: {
    /** Heading (default: `Leave the checkout?`) */
    title: string;
    /** Its text: `{date}` */
    text: string;
    /** Its text without a deadline */
    textNoDate: string;
    /** About the locked price (default: `The locked price is released; you get a new one when you come back.`) */
    price: string;
    /** Keeps the checkout open (default: `Stay and pay`) */
    stay: string;
    /** Closes it (default: `Leave`) */
    leave: string;
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
