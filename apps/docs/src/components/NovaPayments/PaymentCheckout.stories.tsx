import { CheckCircleIcon, FaceFrownIcon } from '@heroicons/react/24/outline';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  type CheckoutPrimaryButtonProps,
  type CheckoutScreenProps,
  type CheckoutStatusIconProps,
  type CheckoutTokenOptionProps,
  NovaPaymentsProvider,
  PaymentCheckout,
  type PaymentCheckoutCustomization,
  type PaymentsConnectionMode,
  useCheckoutContext,
} from '@tuwaio/nova-payments';
import type { CheckoutQuote } from '@tuwaio/quasar-sdk/checkout';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { STORY_OWN_CONNECTION } from '../../utils/payments/ownConnection';
import { PaymentsConnectionCaption } from '../../utils/payments/PaymentsConnectionCaption';
import { sampleCheckout, simulatedCheckoutApi, type SimulationOptions } from '../../utils/payments/simulatedCheckout';
import {
  type SimulatedConnection,
  SimulatedWallet,
  type SimulatedWalletOptions,
} from '../../utils/payments/simulatedWallet';

type StoryProps = SimulationOptions & {
  display: 'modal' | 'inline' | 'page';
  wallet?: SimulatedConnection;
  walletOptions?: SimulatedWalletOptions;
  payUrl?: string;
  autoReturnSeconds?: number;
  /** How often the checkout reads the invoice; the stories read it once a minute unless they follow a payment. */
  pollMs?: number;
  customization?: PaymentCheckoutCustomization;
  /**
   * Whose wallet connection the checkout uses, shown above it: the app's (the simulated wallet with its Nova Connect),
   * the app's store with the app's own connect button, or Nova's own (a real Nova Connect modal).
   */
  connection?: Exclude<PaymentsConnectionMode, 'none'>;
};

/** The wallet connection of a story: the simulated app's, or Nova's own. */
function StoryConnection({
  connection,
  wallet,
  walletOptions,
  children,
}: Pick<StoryProps, 'connection' | 'wallet' | 'walletOptions'> & { children: ReactNode }) {
  if (connection === 'own') {
    return (
      <NovaPaymentsProvider ownConnection={STORY_OWN_CONNECTION}>
        <PaymentsConnectionCaption />
        {children}
      </NovaPaymentsProvider>
    );
  }
  return (
    <SimulatedWallet connection={wallet} options={walletOptions} novaConnect={connection !== 'appStore'}>
      {connection && <PaymentsConnectionCaption />}
      {children}
    </SimulatedWallet>
  );
}

/** A checkout on a simulated Quasar API: no network, the language the buyer picks is kept. */
function SimulatedCheckout({
  display,
  wallet,
  walletOptions,
  payUrl,
  autoReturnSeconds,
  pollMs = 60_000,
  customization,
  connection,
  ...simulation
}: StoryProps) {
  const api = useMemo(() => simulatedCheckoutApi(simulation), [simulation]);
  const [open, setOpen] = useState(true);
  return (
    <StoryConnection connection={connection} wallet={wallet} walletOptions={walletOptions}>
      {/* The opener stays in the page: the dialog gives the focus back to it when it closes */}
      {display === 'modal' && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-[var(--tuwa-button-primary-bg)] px-4 py-2 text-white"
        >
          Open the checkout
        </button>
      )}
      <PaymentCheckout
        // A new simulation for new controls: remounting gives a new checkout store
        key={JSON.stringify(simulation)}
        token="story"
        api={api}
        EventSource={null}
        pollMs={pollMs}
        display={display}
        open={open}
        onOpenChange={(next) => {
          action('onOpenChange')(next);
          setOpen(next);
        }}
        onClose={action('onClose')}
        payUrl={payUrl}
        autoReturnSeconds={autoReturnSeconds}
        onPaid={action('onPaid')}
        customization={customization}
      />
    </StoryConnection>
  );
}

const meta: Meta<typeof SimulatedCheckout> = {
  title: 'Nova Payments/Checkout/PaymentCheckout',
  component: SimulatedCheckout,
  parameters: { layout: 'centered' },
  args: { display: 'inline', logo: false, mode: 'ok', autoReturnSeconds: 0 },
  argTypes: {
    display: { control: 'inline-radio', options: ['modal', 'inline', 'page'] },
    mode: { control: 'inline-radio', options: ['ok', 'loading', 'notFound', 'failure'] },
    customization: { control: false },
    connection: { control: false },
  },
};
export default meta;

type Story = StoryObj<typeof SimulatedCheckout>;

/** The checkout in the page: the order on the left, the steps, language and close in the header. */
export const Inline: Story = {};

/** The modal over the page; under 640 px it is a sheet from the bottom. */
export const Modal: Story = { args: { display: 'modal' } };

/** The merchant's logo instead of its first letter. */
export const WithLogo: Story = { args: { logo: true } };

/** A live invoice (no test badge) in Ukrainian, with one VAT-free line. */
export const LiveInvoice: Story = {
  args: {
    view: sampleCheckout(
      {},
      {
        environment: 'live',
        locale: 'uk',
        lineItems: [
          {
            name: 'Annual license',
            quantity: '1',
            unitPrice: '1200.00',
            taxCategory: 'O',
            taxRate: '0',
            netMinor: '120000',
          },
        ],
        total: '1200.00',
        totalMinor: '120000',
      },
    ),
  },
};

/** While the checkout loads. */
export const Loading: Story = { args: { mode: 'loading' } };

/** A wrong or retired payment link. */
export const NotFound: Story = { args: { mode: 'notFound' } };

/** The API is down: the buyer can try again. */
export const Failure: Story = { args: { mode: 'failure' } };

/** Two minutes before the deadline: the countdown shows seconds and screen readers hear the time left. */
export const DeadlineSoon: Story = {
  args: { view: sampleCheckout({}, { dueAt: new Date(Date.now() + 61_000).toISOString() }) },
};

const METAMASK_ON_BASE_SEPOLIA: SimulatedConnection = {
  address: '0x1111111111111111111111111111111111111111',
  chainId: 84532,
  connectorType: 'evm:metamask',
};

/** A wallet is connected on Base Sepolia: its network comes first and is marked, the wallet shows under "Wallet". */
export const ConnectedWallet: Story = { args: { wallet: METAMASK_ON_BASE_SEPOLIA } };

/** With the payment page of the invoice, an EVM method can also be paid with a QR code on a phone. */
export const WithPayUrl: Story = { args: { payUrl: 'https://quasar.tuwa.io/pay/story' } };

/** The merchant asks for the buyer's full details, and offers a company invoice. */
export const BuyerDetails: Story = {
  args: { view: sampleCheckout({ buyer: { collect: 'full', required: true, companyInvoice: true } }) },
};

/**
 * The seller asks the buyer to tick a line before paying, here the request to start a service at once that Quasar
 * Cloud's quota checkout asks: "Continue" stays off until it is ticked, and the quote carries the consent.
 */
export const RequiredConsent: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: sampleCheckout({
      consent: {
        text: 'I ask Acme Labs to start providing the service immediately and understand that if I withdraw as a consumer I may have to pay for the part already provided',
        required: true,
      },
    }),
  },
};

/**
 * The pay step of a gasless method: "Continue" locks the price, "Sign to pay" asks the wallet for a signature and the
 * merchant pays the gas; "Pay with gas instead" sends the transfer from the wallet with a fee estimate.
 */
export const PayGasless: Story = { args: { wallet: METAMASK_ON_BASE_SEPOLIA } };

/** The merchant sponsors no gas: the buyer pays it, with an estimate in the native coin. */
export const PayWithGas: Story = { args: { wallet: METAMASK_ON_BASE_SEPOLIA, gasless: false } };

/** A smart wallet that takes a paymaster sends the quoted calls; the merchant pays the gas. */
export const SmartWallet: Story = { args: { wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { sponsor: true } } };

/** The wallet is on Ethereum: the pay step asks to switch to Base Sepolia first. */
export const WrongNetwork: Story = { args: { wallet: { ...METAMASK_ON_BASE_SEPOLIA, chainId: 1 } } };

// The icon an EIP-6963 wallet announces: a data URI
const SWITCH_WALLET_ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f766e"/><path d="M9 12h11l-3-3m6 11H12l3 3" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

/**
 * A wallet Nova has neither a name nor an icon of, an EIP-6963 wallet that calls itself "Switch Wallet", is on
 * Ethereum: the checkout names it and shows its own icon, as the wallet list of Nova Connect does. "Switch to Base
 * Sepolia" asks the wallet: the prompt takes the place of the pay step and fills the pane, without a scrollbar.
 */
export const WalletOwnName: Story = {
  name: "Wallet's own name and icon",
  args: {
    display: 'modal',
    wallet: {
      ...METAMASK_ON_BASE_SEPOLIA,
      chainId: 1,
      connectorType: 'evm:switchwallet',
      wallet: { name: 'Switch Wallet', icon: SWITCH_WALLET_ICON },
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Continue' }));
    await userEvent.click(await page.findByRole('button', { name: /^Switch to Base Sepolia/ }, { timeout: 5000 }));
    const prompt = await page.findByRole('heading', { name: 'Approve the switch in Switch Wallet' });
    const pane = prompt.closest<HTMLElement>('[data-novapay-scroll]')!;
    await expect(pane.scrollHeight).toBeLessThanOrEqual(pane.clientHeight);
    await expect(prompt.closest('section')!.querySelector('img')).toHaveAttribute('src', SWITCH_WALLET_ICON);
    // The wallet switched: the pay step is back, with the wallet's name, and the focus on its button
    await waitFor(() => expect(page.queryByRole('heading', { name: /^Approve the switch/ })).toBeNull(), {
      timeout: 5000,
    });
    await expect(page.getByText('Switch Wallet')).toBeVisible();
    // After the dialog put it on its frame for a moment
    await waitFor(() => expect(page.getByRole('button', { name: /^Sign to pay/ })).toHaveFocus());
  },
};

/**
 * The wallet holds 52.10 USDC and 0.08 ETH: the pay step offers ETH, which this wallet can pay, and the seller's
 * top-up link.
 */
export const NotEnough: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    walletOptions: { balance: 52_100_000n, balances: { native: 80_000_000_000_000_000n } },
    view: sampleCheckout({
      methods: [
        ...sampleCheckout().methods,
        {
          id: 'ap_eth_base',
          name: 'ETH on Base',
          symbol: 'ETH',
          chainId: 'eip155:84532',
          assetId: 'eip155:84532/slip44:60',
          decimals: 18,
          gasless: 'off',
          featured: false,
          markupBps: 0,
          discountBps: 0,
        },
      ],
    }),
  },
};

/**
 * Pay, then close the checkout while the wallet still asks: the transaction it sends later goes to the app's Pulsar
 * store (see the actions panel), where Nova Transactions shows its toast and keeps tracking it.
 */
export const HandOverAfterClose: Story = {
  args: { display: 'modal', wallet: METAMASK_ON_BASE_SEPOLIA, gasless: false },
};

/** The buyer declines in the wallet: the reason and "Try again". */
export const Declined: Story = { args: { wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { decline: true } } };

/**
 * No wallet yet: "Continue" opens the connect modal of Nova Connect on the wallets of the method's family (simulated:
 * MetaMask connects on Ethereum after a moment), then the price is locked for it.
 */
export const ConnectFromCheckout: Story = {};

/**
 * The app's connection: the app has a Satellite store and Nova Connect (here the simulated wallet), so the checkout
 * shows the app's wallet and "Connect wallet" opens the app's modal; Nova adds no store or modal of its own.
 */
export const AppConnection: Story = {
  name: "App's connection",
  args: { connection: 'app', wallet: METAMASK_ON_BASE_SEPOLIA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('payments-connection')).toHaveTextContent(/^app$/);
    await expect(await canvas.findByRole('button', { name: 'Continue' })).toBeVisible();
  },
};

/**
 * Nova's own connection: the app has no Satellite store, so `ownConnection` gives the checkout its own store (Sepolia,
 * Base Sepolia and Solana devnet), its own watchers and a real Nova Connect modal without SIWX. "Continue" opens that
 * modal on the wallets of the method's network.
 */
export const OwnConnection: Story = {
  name: "Nova's own connection",
  args: { connection: 'own' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('payments-connection')).toHaveTextContent(/^own$/);
    await userEvent.click(await canvas.findByRole('button', { name: 'Continue' }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole('dialog', { name: /Connect Wallet/i })).toBeVisible();
  },
};

/**
 * The app has a Satellite store but no Nova Connect: the checkout shows the app's wallet, and "Continue" calls the
 * app's own connect button (`onConnectWallet` of `NovaPaymentsProvider`, see the actions panel), which connects
 * MetaMask after a moment. Nova never adds a second store.
 */
export const AppStoreConnection: Story = {
  name: "App store, app's connect button",
  args: { connection: 'appStore' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('payments-connection')).toHaveTextContent(/^appStore$/);
    await userEvent.click(await canvas.findByRole('button', { name: 'Continue' }));
    await expect(await canvas.findByRole('heading', { name: 'Pay' }, { timeout: 5000 })).toBeVisible();
  },
};

/** Phantom is connected on devnet: Solana comes first, and the pay step sends USDC from the wallet. */
export const PaySolanaWallet: Story = {
  args: {
    wallet: {
      address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      chainId: 'devnet',
      connectorType: 'solana:phantom',
    },
  },
};

/**
 * Phantom sends a devnet payment on mainnet: the network does not know the payment's blockhash, nothing is paid, and
 * the buyer is told to switch the wallet and pay again. Solana wallets have no network switch an app can ask for, so
 * the pay step reminds the buyer of the cluster beforehand, with the steps of Phantom and Solflare.
 */
export const SolanaOtherNetwork: Story = {
  args: { ...PaySolanaWallet.args, walletOptions: { otherCluster: true } },
};

/** A token that keeps a 0.2 % fee on every transfer: the buyer sends a bit more, and sees why. */
export const TransferFee: Story = { args: { wallet: METAMASK_ON_BASE_SEPOLIA, transferFeeBps: 20 } };

/** A price that holds 70 seconds: "Keep this price" shows ten seconds after it is locked. */
export const PriceEnding: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, view: sampleCheckout({ quoteTtlSeconds: 70 }) },
};

/** A Solana Pay price locked earlier without a payer: the QR code shows again, as after a reload. */
export const SolanaPayQr: Story = {
  args: {
    view: sampleCheckout({
      quote: {
        object: 'checkout_quote',
        methodId: 'ap_usdc_sol',
        payer: null,
        cryptoAmountExpected: '89540000',
        amountDue: '89540000',
        amountToSend: '89540000',
        rateHeldUntil: null,
        transferFee: null,
        decimals: 6,
        symbol: 'USDC',
        lockedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
        reference: '9yYb9dhzyFZGnJgUqt9uZaCvYEJcVwd8xTbgaiVtVb8Y',
        rates: [],
        markupBps: 0,
        discountBps: 0,
        instructions: {
          family: 'solana',
          chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
          to: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
          token: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
          amount: '89540000',
          decimals: 6,
          symbol: 'USDC',
          reference: '9yYb9dhzyFZGnJgUqt9uZaCvYEJcVwd8xTbgaiVtVb8Y',
          solanaPayUrl:
            'solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?amount=89.54&spl-token=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU&reference=9yYb9dhzyFZGnJgUqt9uZaCvYEJcVwd8xTbgaiVtVb8Y&label=Acme%20Labs',
        },
        gasless: null,
      },
    }),
  },
};

/** A price locked earlier for MetaMask on Base Sepolia: the payment the outcome stories are about. */
const LOCKED: CheckoutQuote = {
  object: 'checkout_quote',
  methodId: 'ap_usdc_base',
  payer: 'eip155:84532:0x1111111111111111111111111111111111111111',
  cryptoAmountExpected: '89540000',
  amountDue: '89540000',
  amountToSend: '89540000',
  rateHeldUntil: null,
  transferFee: null,
  decimals: 6,
  symbol: 'USDC',
  lockedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
  reference: null,
  rates: [],
  markupBps: 0,
  discountBps: 0,
  instructions: {
    family: 'eip155',
    chainId: 84532,
    to: '0x2222222222222222222222222222222222222222',
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    amount: '89540000',
    decimals: 6,
    symbol: 'USDC',
  },
  gasless: null,
};

/** An invoice of the stories in another state, with the locked price. */
const settled = (invoice: Partial<ReturnType<typeof sampleCheckout>['invoice']>, extra = {}) =>
  sampleCheckout({ quote: LOCKED, ...extra }, invoice);

/**
 * The price is locked and the seller does not check paying wallets (`amlScreening: false`): the note under the button
 * says only that the payment goes straight to the seller.
 */
export const PayWithoutScreening: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, view: settled({}, { amlScreening: false }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The whole note: no sentence about screening after it
    const note = await canvas.findByText(/^Payments go straight to Acme Labs/);
    await expect(note).toHaveTextContent(
      /^Payments go straight to Acme Labs and can't be reversed; refunds come from the seller\.$/,
    );
  },
};

/** The transaction is on its way: Sent, then Confirming, with the network, amount and sender. */
export const Confirming: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, view: settled({ status: 'processing' }) },
};

/** Paid: the amount, network and steps, the receipt to download, and the way back to the seller. */
export const Paid: Story = {
  args: { view: settled({ status: 'paid', amountPaid: '89540000', successUrl: 'https://acme.example/thanks' }) },
};

/**
 * Just paid, with a return link: a visible countdown sends the buyer back, unless "Stay here". A page opened on an invoice
 * paid earlier (`Paid`) stays: it is a receipt, and nothing was just paid.
 */
export const PaidReturnCountdown: Story = {
  args: {
    autoReturnSeconds: 30,
    pollMs: 500,
    view: settled({ status: 'processing', successUrl: '#returned' }),
    afterReplace: settled({ status: 'paid', amountPaid: '89540000', successUrl: '#returned' }),
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('timer', {}, { timeout: 10_000 })).toBeVisible();
  },
};

/** Paid, then the seller refunded a part. */
export const PartRefunded: Story = {
  args: { view: settled({ status: 'partially_refunded', amountPaid: '89540000', refundedTotalMinor: '1000' }) },
};

/**
 * A paid subscription period: the checkout offers automatic payments for the next ones (ERC-7715), paid only to the
 * seller's wallet; Quasar's collector sends each charge.
 */
export const SubscriptionAutoPay: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: settled(
      {
        status: 'paid',
        amountPaid: '89540000',
        subscription: {
          status: 'active',
          interval: 'month',
          intervalCount: 1,
          period: 1,
          periodStart: new Date().toISOString(),
          periodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          cycles: null,
          endsAt: null,
          cancelAtPeriodEnd: false,
        },
      },
      {
        autoCharge: {
          status: 'available',
          methodId: 'ap_usdc_base',
          request: {
            chainId: '0x14a34',
            to: '0x3333333333333333333333333333333333333333',
            permission: {
              type: 'erc20-token-periodic',
              isAdjustmentAllowed: false,
              data: {
                tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
                periodAmount: '0x2ebae40',
                periodDuration: 2_592_000,
                startTime: Math.floor(Date.now() / 1000),
                justification: 'Pro plan',
              },
            },
            rules: [
              { type: 'expiry', data: { timestamp: Math.floor(Date.now() / 1000) + 365 * 86_400 } },
              { type: 'payee', data: { addresses: ['0x2222222222222222222222222222222222222222'] } },
              { type: 'redeemer', data: { addresses: ['0x3333333333333333333333333333333333333333'] } },
            ],
          },
        },
      },
    ),
  },
};

/**
 * Automatic payments are on: "Turn off" opens the screen where the wallet that allowed them sends the transaction that
 * revokes the permission. Another wallet is asked to connect that one first.
 */
export const SubscriptionAutoPayOn: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: settled(
      { status: 'paid', amountPaid: '89540000' },
      {
        autoCharge: {
          status: 'active',
          permission: {
            status: 'active',
            chainId: 'eip155:84532',
            methodId: 'ap_usdc_base',
            payer: `eip155:84532:${METAMASK_ON_BASE_SEPOLIA.address}`,
            tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            periodAmount: '49000000',
            periodSeconds: 2_592_000,
            startsAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 86_400_000).toISOString(),
            grantedAt: new Date().toISOString(),
            revokedAt: null,
          },
          revocation: { to: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3', data: '0x3ed01015' },
        },
      },
    ),
  },
};

/** Part of the payment arrived: the rest, from the same wallet, with "Pay the rest". */
export const Underpaid: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: settled({ status: 'underpaid', amountPaid: '80000000', restPayable: true }),
  },
};

/**
 * Part of the payment arrived, and the rest can no longer be paid here: the seller turned the method off. After the due
 * date the seller can refund what arrived.
 */
export const UnderpaidRestClosed: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: settled({ status: 'underpaid', amountPaid: '80000000', restPayable: false }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('The rest of this invoice can no longer be paid here.')).toBeVisible();
    await expect(await canvas.findByText(/can refund what arrived/)).toBeVisible();
    await expect(canvas.queryByRole('button', { name: 'Pay the rest' })).toBeNull();
  },
};

/**
 * The rest in an asset that moves against the invoice currency: it stays payable, and the page says until when the rate
 * holds. A payment after that waits for the seller to accept or refund it.
 */
export const PayRestMovingAsset: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: settled(
      { status: 'underpaid', amountPaid: '80000000', restPayable: true },
      { quote: { ...LOCKED, rateHeldUntil: new Date(Date.now() + 5 * 60_000).toISOString() } },
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText(/This rate holds until/)).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: 'Pay the rest' }));
    await expect(await canvas.findByText('You send the rest', undefined, { timeout: 6000 })).toBeVisible();
    await expect(await canvas.findByText(/A payment after that waits for Acme Labs to accept it/)).toBeVisible();
    await expect(await canvas.findByText(/Time left to send/)).toBeVisible();
  },
};

/** The buyer sent more: the seller reviews the payment. */
export const OnReview: Story = {
  args: { view: settled({ status: 'held', amountPaid: '91000000', review: { reason: 'overpaid' } }) },
};

/** The seller refunded the whole invoice. */
export const Refunded: Story = { args: { view: settled({ status: 'refunded', refundedTotalMinor: '8954' }) } };

/** The deadline passed before the payment. */
export const Expired: Story = {
  args: { view: sampleCheckout({}, { status: 'expired', dueAt: new Date(Date.now() - 3_600_000).toISOString() }) },
};

/** The deadline passed after part of the payment arrived: what arrived, and that the seller can refund it. */
export const ExpiredPartPaid: Story = {
  args: {
    view: settled({ status: 'expired', amountPaid: '80000000', dueAt: new Date(Date.now() - 3_600_000).toISOString() }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Part of the payment arrived: 80\.00 USDC\./);
    await expect(canvas.getByText('Acme Labs can refund it to the wallet that paid; contact Acme Labs.')).toBeVisible();
    await expect(canvas.queryByText(/nothing was charged/)).toBeNull();
  },
};

/** The seller cancelled the invoice. */
export const Cancelled: Story = { args: { view: sampleCheckout({}, { status: 'cancelled' }) } };

/** The seller corrected the invoice: "Open INV-2026-43" opens the new one in the checkout. */
export const Replaced: Story = {
  args: {
    view: sampleCheckout(
      {},
      { status: 'cancelled', replacedBy: { number: 'INV-2026-43', checkoutToken: 'replacement' } },
    ),
    afterReplace: sampleCheckout({}, { id: 'inv_replacement', number: 'INV-2026-43' }),
  },
};

/** The wallet check refused the payer: "Use another wallet". */
export const Blocked: Story = { args: { wallet: METAMASK_ON_BASE_SEPOLIA, quoteError: 'payer_blocked' } };

/** The wallet check is down: the method step says so, in the language of the checkout. */
export const ScreeningUnavailable: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, quoteError: 'screening_unavailable' },
};

// --- Confirming the paying wallet ---

/** The checkout of the stories with USDC on Base Sepolia paid by the buyer's wallet, which confirms the invoice first. */
const proofCheckout = (invoice: Partial<ReturnType<typeof sampleCheckout>['invoice']> = {}, extra = {}) => {
  const view = sampleCheckout(extra, invoice);
  return {
    ...view,
    methods: view.methods.map((method) =>
      method.id === 'ap_usdc_base'
        ? { ...method, gasless: 'off' as const, payerProof: 'before_quote' as const }
        : { ...method, payerProof: 'none' as const },
    ),
  };
};

/** Coinbase Smart Wallet on Base Sepolia: a smart account that signs with a passkey. */
const SMART_WALLET_ON_BASE_SEPOLIA: SimulatedConnection = {
  ...METAMASK_ON_BASE_SEPOLIA,
  connectorType: 'evm:coinbase',
};

/** Continues from the method step to the step that confirms the wallet. */
async function continueToConfirmWallet(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole('button', { name: 'Continue' }));
  const heading = await canvas.findByRole('heading', { name: 'Confirm your wallet' });
  await waitFor(() => expect(heading).toHaveFocus());
  return canvas;
}

/**
 * Right after the wallet and the method, before the price: the wallet confirms the invoice with a free signature that
 * moves no money. The step says so in one sentence and sums up what the wallet signs; the main button opens the
 * wallet's request.
 */
export const ConfirmWallet: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, view: proofCheckout() },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await expect(canvas.getByText('Confirm this wallet — it is free and moves no money.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Confirm in MetaMask' })).toBeEnabled();
  },
};

/** The wallet window over the step while the wallet signs: the site, invoice, seller and amount to check. */
export const ConfirmWalletSigning: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { signPending: true }, view: proofCheckout() },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Confirm in MetaMask' }));
    const heading = await canvas.findByRole('heading', { name: 'Sign in MetaMask' });
    await waitFor(() => expect(heading).toHaveFocus());
    await expect(await canvas.findByText('Site')).toBeVisible();
  },
};

/**
 * The wallet window was closed while the wallet never answered (a lost WalletConnect or mobile request): the button
 * works again, and the window offers "Try again" (signing again moves no money). The window also says that the wallet
 * may show the message as a sign-in request for the site.
 */
export const ConfirmWalletRetry: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { signPending: true }, view: proofCheckout() },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Confirm in MetaMask' }));
    await expect(await canvas.findByText(/^MetaMask may show it as a sign-in request for /)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
    const button = await canvas.findByRole('button', { name: 'Confirm in MetaMask' });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    await expect(await canvas.findByRole('button', { name: 'Try again' })).toBeVisible();
  },
};

/** The wallet signed: the price is locked and the pay step follows, with the buyer paying the gas. */
export const ConfirmWalletThenPay: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, view: proofCheckout() },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Confirm in MetaMask' }));
    await expect(await canvas.findByRole('button', { name: /^Pay 89\.54 USDC/ }, { timeout: 6000 })).toBeVisible();
  },
};

/** The buyer declined the signature: the step stays, with the reason and the same button to try again. */
export const ConfirmWalletDeclined: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { decline: true }, view: proofCheckout() },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Confirm in MetaMask' }));
    await expect(await canvas.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      /^You declined the signature in MetaMask\./,
    );
    await expect(canvas.getByRole('button', { name: 'Confirm in MetaMask' })).toBeEnabled();
  },
};

/** A smart wallet asks for its passkey to sign: the step and the wallet window say so. */
export const ConfirmSmartWallet: Story = {
  args: { wallet: SMART_WALLET_ON_BASE_SEPOLIA, walletOptions: { signPending: true }, view: proofCheckout() },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await expect(canvas.getByText(/may ask for your passkey or fingerprint to sign/)).toBeVisible();
    // Its signature counts on its network only
    await expect(canvas.getByText(/another network asks again\.$/)).toBeVisible();
  },
};

/** A wallet that cannot sign messages: another wallet or method. */
export const ConfirmWalletCannotSign: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { cannotSign: true }, view: proofCheckout() },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Confirm in MetaMask' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      "MetaMask can't sign this confirmation. Choose another wallet or method.",
    );
  },
};

/** Quasar cannot check the signature of a smart wallet now (its network does not answer): try again later. */
export const ConfirmWalletUnavailable: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: proofCheckout(),
    payerProofError: 'payer_proof_unavailable',
  },
  play: async ({ canvasElement }) => {
    const canvas = await continueToConfirmWallet(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Confirm in MetaMask' }));
    await expect(await canvas.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent(
      "The network can't check this wallet's signature right now. Try again in a minute.",
    );
  },
};

/**
 * A method the gasless relay may pay locks its price at once: the relay's signed authorization confirms the wallet.
 * When the buyer pays the gas instead, the wallet confirms the invoice first.
 */
export const ConfirmBeforePayingGas: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: {
      ...sampleCheckout(),
      methods: sampleCheckout().methods.map((method) => ({
        ...method,
        payerProof: method.id === 'ap_usdc_base' ? ('unless_relayed' as const) : ('none' as const),
      })),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Continue' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Pay with gas instead' }));
    await expect(await canvas.findByRole('button', { name: 'Confirm this wallet to pay' })).toBeVisible();
  },
};

/**
 * A transfer from a wallet that never confirmed the invoice: Quasar ties it to no invoice and records it as a held
 * transfer, which the seller returns to the wallet that sent it. The invoice stays open: the page says so, and that
 * the confirmed wallet can still pay it. Never "the seller checks your payment".
 */
export const HeldTransfer: Story = {
  args: {
    view: sampleCheckout(
      {},
      {
        pendingPayments: 0,
        rejectedPayments: [
          {
            txKey: '0x5c1e000000000000000000000000000000000000000000000000000000007d1a',
            reason: 'payer_unconfirmed',
            final: true,
            movedMoney: true,
            held: true,
            at: Date.parse('2026-11-03T14:02:00.000Z'),
          },
        ],
      },
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/returns it to the wallet that sent it, and you can still pay this invoice/),
    ).toBeVisible();
  },
};

/**
 * Part of the invoice was paid from one wallet and another one is connected now: only the wallet that paid first pays
 * the rest, and "Pay the rest" asks for it.
 */
export const PayRestNewWallet: Story = {
  args: {
    wallet: { ...METAMASK_ON_BASE_SEPOLIA, address: '0x3333333333333333333333333333333333333333' },
    view: proofCheckout({ status: 'underpaid', amountPaid: '80000000', restPayable: true }, { quote: LOCKED }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        'Only the wallet that paid first, 0x1111…1111, can pay the rest. Connect that wallet to pay it.',
      ),
    ).toBeVisible();
  },
};

/** The wallet that paid first pays the rest: the price is what is left, 9.54 of 89.54 USDC at the same rate. */
export const PayRest: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    view: settled({ status: 'underpaid', amountPaid: '80000000', restPayable: true }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Pay the rest' }));
    await expect(await canvas.findByText('You send the rest', undefined, { timeout: 6000 })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /^Pay 9\.54 USDC/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Back' })).toBeVisible();
  },
};

// --- Customization ---

/**
 * Class name functions add classes to the parts from the state of the checkout. They come after the default classes:
 * change colors the parts already set with the `--tuwa-*` variables, or replace the part.
 */
const brandClassNames: PaymentCheckoutCustomization['classNames'] = {
  container: ({ screen }) =>
    screen === 'paid' ? 'ring-2 ring-emerald-500/50 shadow-xl' : 'ring-2 ring-blue-600/40 shadow-xl',
  step: ({ step }) => (step.state === 'current' ? 'rounded bg-blue-600/10 pr-1.5' : undefined),
  tokenOption: ({ selected }) => (selected ? 'shadow-md' : undefined),
  networkOption: ({ method }) => (method.featured ? 'ring-1 ring-sky-500/60' : undefined),
  primaryButton: () => 'uppercase tracking-widest',
  total: () => 'rounded border border-dashed border-sky-500/60 px-2 py-1',
  statusIcon: () => 'drop-shadow',
};

/** Classes from the state of the checkout: a ring on the block, the current step marked, the chosen token raised. */
export const CustomClassNames: Story = { args: { customization: { classNames: brandClassNames } } };

/** The main button of the app: same props as the default one (`busy`, `disabled`, `onClick`, `type`…). */
function BrandButton({ busy, children, className, ...props }: CheckoutPrimaryButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-[var(--tuwa-rounded-corners)] border-0 bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70 ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** A token card that shows how many networks the token is on. */
function BrandTokenOption({ group, selected }: CheckoutTokenOptionProps) {
  return (
    <>
      <span className="text-[13px] font-bold">{group.symbol}</span>
      <span className="text-[11px] text-[var(--tuwa-text-secondary)]">
        {group.methods.length} {group.methods.length === 1 ? 'network' : 'networks'}
        {selected ? ' · chosen' : ''}
      </span>
    </>
  );
}

/** One icon for every outcome other than paid. */
function BrandStatusIcon({ className }: CheckoutStatusIconProps) {
  return <FaceFrownIcon aria-hidden className={`h-12 w-12 text-blue-600 ${className ?? ''}`} />;
}

/** The app's own paid screen, reading the checkout with `useCheckoutContext`. */
function BrandPaidScreen({ screen }: CheckoutScreenProps) {
  const { checkout, close } = useCheckoutContext();
  return (
    <section
      data-screen={screen}
      className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[var(--tuwa-text-primary)]"
    >
      <CheckCircleIcon aria-hidden className="h-12 w-12 text-emerald-600" />
      <h2 className="m-0 text-lg font-semibold">Thank you for your order</h2>
      <p className="m-0 text-sm text-[var(--tuwa-text-secondary)]">
        {checkout?.merchant.name} received the payment of invoice {checkout?.invoice.number}.
      </p>
      {close && <BrandButton onClick={close}>Back to the shop</BrandButton>}
    </section>
  );
}

const brandComponents: PaymentCheckoutCustomization['components'] = {
  PrimaryButton: BrandButton,
  TokenOption: BrandTokenOption,
  StatusIcon: BrandStatusIcon,
  screens: { paid: BrandPaidScreen },
};

/** Parts replaced by the app's components: the main button, the token cards, the outcome icon. */
export const CustomComponents: Story = { args: { customization: { components: brandComponents } } };

/** The paid screen replaced by the app's own (`components.screens.paid`). */
export const CustomPaidScreen: Story = {
  args: {
    customization: { components: brandComponents },
    view: settled({ status: 'paid', amountPaid: '89540000' }),
  },
};

/** An outcome with the app's icon and classes. */
export const CustomOutcome: Story = {
  args: {
    customization: { classNames: brandClassNames, components: brandComponents },
    view: sampleCheckout({}, { status: 'cancelled' }),
  },
};

/** Handlers that log every action of the buyer and every event to the Actions panel, then let the checkout go on. */
const loggingHandlers: PaymentCheckoutCustomization['handlers'] = {
  onMethodSelect: ({ method, select }) => {
    action('onMethodSelect')(method.id);
    select();
  },
  onQuote: async ({ method, payWith, proceed }) => {
    action('onQuote')(method.id, payWith);
    await proceed();
  },
  onSubmit: async ({ quote, proceed }) => {
    action('onSubmit')(quote.amountToSend, quote.instructions.symbol);
    await proceed();
  },
  onLocaleChange: async ({ locale, proceed }) => {
    action('onLocaleChange')(locale);
    await proceed();
  },
  onStatusChange: action('onStatusChange'),
  onError: action('onError'),
  onExpire: action('onExpire'),
};

/** Every handler logs to the Actions panel: pick a token or a network, continue, pay, change the language. */
export const WithHandlers: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA, customization: { handlers: loggingHandlers } },
};

/** No steps in the header, no animations, no balance check, the deadline announced 15 and 5 minutes before. */
export const WithConfig: Story = {
  args: {
    wallet: METAMASK_ON_BASE_SEPOLIA,
    customization: {
      config: { showSteps: false, animation: { disabled: true }, balanceCheck: false, deadlineAnnouncements: [15, 5] },
    },
  },
};

/** The Nova Transactions parts of the paid step styled through `childCustomizations`. */
export const WithChildCustomizations: Story = {
  args: {
    view: settled({ status: 'paid', amountPaid: '89540000' }),
    customization: {
      childCustomizations: {
        statusVisual: { iconClassNames: { icon: 'text-blue-600' } },
        progressIndicator: { stepClassNames: { label: 'uppercase tracking-wider' } },
        hashLink: { classNames: { hash: 'font-semibold' } },
      },
    },
  },
};

// --- Accessibility ---

/** At 320 px wide (WCAG 1.4.10): the order on top, the steps below, nothing wider than the screen. */
export const NarrowScreen: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvasElement }) => {
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.clientWidth).toBe(320);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};

/** The element that has the focus in the document of the story. */
const focused = (element: Element) => element.ownerDocument.activeElement;

/** Keyboard (WCAG 2.1.1, 2.4.3): the arrows choose the token, Enter continues, the focus moves to the pay step. */
export const KeyboardMethodToPay: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const usdc = await canvas.findByRole('radio', { name: /^USDC/ });
    usdc.focus();
    await userEvent.keyboard('{ArrowRight}');
    const sol = canvas.getByRole('radio', { name: /^SOL/ });
    await expect(sol).toHaveAttribute('aria-checked', 'true');
    await expect(sol).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(usdc).toHaveAttribute('aria-checked', 'true');

    canvas.getByRole('button', { name: 'Continue' }).focus();
    await userEvent.keyboard('{Enter}');
    const heading = await canvas.findByRole('heading', { name: 'Pay' });
    await waitFor(() => expect(heading).toHaveFocus());
  },
};

/** Keyboard: Enter on "Sign to pay" sends the payment; the focus follows to the confirm step. */
export const KeyboardPayToConfirm: Story = {
  args: { wallet: METAMASK_ON_BASE_SEPOLIA },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    (await canvas.findByRole('button', { name: 'Continue' })).focus();
    await userEvent.keyboard('{Enter}');
    const pay = await canvas.findByRole('button', { name: /^Sign to pay/ });
    pay.focus();
    await userEvent.keyboard('{Enter}');
    const heading = await canvas.findByRole('heading', { name: 'Confirming your payment' }, { timeout: 5000 });
    await waitFor(() => expect(heading).toHaveFocus());
  },
};

/** Keyboard: the language menu opens with the down arrow, Enter picks, Escape closes; the focus returns to the button. */
export const KeyboardLanguage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /Language: English/ });
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(await canvas.findByRole('listbox')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(button).toHaveFocus());
    // The block of the checkout, not the wrapper of Storybook's own language
    await waitFor(() => expect(button.closest('[lang]')).toHaveAttribute('lang', 'uk'));

    await userEvent.keyboard('{ArrowDown}');
    await expect(await canvas.findByRole('listbox')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('listbox')).toBeNull();
    await expect(button).toHaveFocus();
  },
};

/**
 * Keyboard in the dialog: Escape asks before leaving (the focus goes to the question and stays in it), Escape or
 * "Stay and pay" goes back with the focus where it was, "Leave" closes and the focus returns to the opener.
 */
export const KeyboardLeaveDialog: Story = {
  args: { display: 'modal' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // Hidden from assistive technology while the dialog is open, as it should be
    const opener = within(canvasElement).getByRole('button', { name: 'Open the checkout', hidden: true });
    const dialog = await page.findByRole('dialog');
    await waitFor(() => expect(dialog).toContainElement(focused(dialog) as HTMLElement));
    const before = focused(dialog);

    await userEvent.keyboard('{Escape}');
    const question = await page.findByRole('alertdialog');
    await waitFor(() => expect(within(question).getByRole('heading')).toHaveFocus());
    for (let i = 0; i < 3; i++) {
      await userEvent.tab();
      await expect(question).toContainElement(focused(question) as HTMLElement);
    }
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(before).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    within(await page.findByRole('alertdialog'))
      .getByRole('button', { name: 'Stay and pay' })
      .focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(before).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    within(await page.findByRole('alertdialog'))
      .getByRole('button', { name: 'Leave' })
      .focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());

    opener.focus();
    await userEvent.keyboard('{Enter}');
    await page.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    within(await page.findByRole('alertdialog'))
      .getByRole('button', { name: 'Leave' })
      .focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

/** Keyboard: Enter on an empty form puts the focus on the first field to fix, with its error tied to it (WCAG 3.3.1). */
export const KeyboardBuyerErrors: Story = {
  args: { view: sampleCheckout({ buyer: { collect: 'full', required: true, companyInvoice: true } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    (await canvas.findByRole('button', { name: 'Continue' })).focus();
    await userEvent.keyboard('{Enter}');
    const email = canvas.getByRole('textbox', { name: 'Email' });
    await waitFor(() => expect(email).toHaveFocus());
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription('Required');
  },
};

/** A story as its own payment page: the whole window, on the page's background, without the fade of a new step. */
const onPage = (story: Story = {}): Story => ({
  ...story,
  parameters: { ...story.parameters, layout: 'fullscreen' },
  args: { ...story.args, display: 'page', customization: { config: { animation: { disabled: true } } } },
  decorators: [
    (Story) => (
      <div style={{ background: 'var(--tuwa-bg-secondary)', minHeight: '100svh' }}>
        <Story />
      </div>
    ),
  ],
});

/** The payment page: one sheet centered in the window. It grows downward with its step and scrolls nothing inside. */
export const PageMethod: Story = onPage();

/** The payment page with a required buyer form. */
export const PageBuyerDetails: Story = onPage(BuyerDetails);

/** The payment page on the step that pays. */
export const PagePay: Story = onPage(PayGasless);

/** The payment page with the wallet on another network. */
export const PageWrongNetwork: Story = onPage(WrongNetwork);

/** The payment page with a Solana Pay code. */
export const PageSolanaQr: Story = onPage(SolanaPayQr);

/** The payment page with the code of the page for a phone. */
export const PageEvmQr: Story = onPage(WithPayUrl);

/** The payment page while the payment confirms: the amount stands where the paid screen shows it. */
export const PageConfirming: Story = onPage(Confirming);

/** The payment page once paid: the steps stay, all done. */
export const PagePaid: Story = onPage(Paid);

/** The payment page with a part of the payment received. */
export const PageUnderpaid: Story = onPage(Underpaid);

/** The payment page of an invoice that expired. */
export const PageExpired: Story = onPage(Expired);

/** The payment page after a transfer from another wallet, which the seller holds. */
export const PageHeldTransfer: Story = onPage(HeldTransfer);
