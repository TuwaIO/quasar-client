import type { Meta, StoryObj } from '@storybook/react-vite';
import { primaryButtonClasses } from '@tuwaio/nova-core/utils';
import { NovaPaymentsProvider, RefundButton, RefundDialog, type RefundRequest } from '@tuwaio/nova-payments';
import { createRefundStore, type RefundState } from '@tuwaio/quasar-sdk/checkout';
import { useMemo, useState } from 'react';
import { action } from 'storybook/actions';
import { expect, userEvent, within } from 'storybook/test';

import { STORY_OWN_CONNECTION } from '../../utils/payments/ownConnection';
import { PaymentsConnectionCaption } from '../../utils/payments/PaymentsConnectionCaption';
import {
  type SimulatedConnection,
  SimulatedWallet,
  type SimulatedWalletOptions,
} from '../../utils/payments/simulatedWallet';

type Refund = NonNullable<RefundState['refund']>;

/** How the simulated Quasar answers a refund. */
interface RefundSimulation {
  /** The network of the payment. */
  chain?: 'base' | 'solana';
  /** Quasar knows the payer's wallet. */
  payer?: boolean;
  /** What happens to the refund transaction: confirmed, failed on-chain, or not taken by Quasar the first time. */
  outcome?: 'confirmed' | 'failed' | 'notTaken';
  /** The price moved since the payment, so the amount takes another number of tokens. */
  moved?: boolean;
}

type StoryProps = RefundSimulation & {
  wallet?: SimulatedConnection;
  walletOptions?: SimulatedWalletOptions;
  params?: RefundRequest;
  locale?: string;
  record?: boolean;
  trigger?: boolean;
  /** Whose wallet connection the refund uses, shown above it: the app's (the simulated wallet) or Nova's own. */
  connection?: 'app' | 'own';
};

const PAYMENT = {
  base: {
    chainId: 'eip155:84532',
    assetId: 'eip155:84532/erc20:0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    to: '0x9c1e5b8f0d6a4e2c7b3a1f9e8d7c6b5a4f3e4f02',
  },
  solana: {
    chainId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    assetId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1/token:4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    to: '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2',
  },
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A refund store on a simulated Quasar: a moment per call, the refund confirmed or failed two seconds after it is sent. */
function simulatedRefundStore({
  chain = 'base',
  payer = true,
  outcome = 'confirmed',
  moved = false,
}: RefundSimulation) {
  const payment = PAYMENT[chain];
  let refund: Refund;
  let sentAt = 0;
  let refused = false;
  return createRefundStore({
    // Each story starts clean: a kept transaction would carry over to the next one, as it does over a reload
    handOverStorage: null,
    // The token fell since the payment: the amount takes more of it, and the window shows that before asking
    preview: async (invoiceId, params) => {
      await wait(400);
      const amount = params.amount ?? '20.00';
      const atPaymentRate = Math.round(Number(amount) * 1_000_000);
      return {
        amount,
        currency: 'USD',
        cryptoAmount: String(moved ? Math.round(atPaymentRate * 1.3) : atPaymentRate),
        symbol: 'USDC',
        decimals: 6,
        received: '49000000',
        atPaymentRate: String(atPaymentRate),
        exactPossible: true,
      };
    },
    request: async (invoiceId, params) => {
      action('request')(invoiceId, params);
      await wait(700);
      const amount = params.mode === 'exact_received' ? '20.00' : (params.amount ?? '20.00');
      refund = {
        id: 'rf_story',
        object: 'refund',
        invoiceId,
        status: 'requested',
        amount,
        currency: 'USD',
        mode: params.mode ?? 'fiat_value',
        cryptoAmount: String(Math.round(Number(amount) * 1_000_000)),
        assetId: payment.assetId,
        chainId: payment.chainId,
        to: payment.to,
        txHash: null,
        from: null,
        reason: params.reason ?? null,
        failureReason: null,
        creditNoteNumber: null,
        createdAt: new Date().toISOString(),
        confirmedAt: null,
      };
      return {
        refund,
        instructions: {
          chainId: payment.chainId,
          assetId: payment.assetId,
          to: payer ? payment.to : null,
          amount: refund.cryptoAmount,
          decimals: 6,
          symbol: 'USDC',
        },
      };
    },
    submit: async (refundId, params) => {
      action('submit')(refundId, params);
      await wait(700);
      if (outcome === 'notTaken' && !refused) {
        refused = true;
        throw new Error('Quasar did not answer');
      }
      sentAt = Date.now();
      refund = { ...refund, status: 'submitted', txHash: params.txHash, from: params.from };
      return refund;
    },
    get: async () => {
      if (refund.status === 'submitted' && Date.now() - sentAt > 2000) {
        refund =
          outcome === 'failed'
            ? { ...refund, status: 'failed', failureReason: 'The transaction reverted on Base Sepolia.' }
            : {
                ...refund,
                status: 'confirmed',
                creditNoteNumber: 'TEST-CN-2026-4',
                confirmedAt: new Date().toISOString(),
              };
      }
      return refund;
    },
    pollMs: 500,
  });
}

/** A refund of a paid 20 USD invoice on a simulated Quasar and wallet: no network. */
function SimulatedRefund({
  wallet,
  walletOptions,
  params,
  locale,
  record,
  trigger,
  connection,
  ...simulation
}: StoryProps) {
  const { chain, payer, outcome, moved } = simulation;
  const store = useMemo(() => simulatedRefundStore({ chain, payer, outcome, moved }), [chain, payer, outcome, moved]);
  const [open, setOpen] = useState(true);
  const props = {
    store,
    invoiceId: 'inv_story',
    invoice: 'TEST-INV-2026-42',
    currency: 'USD',
    refundable: '20.00 USD',
    params,
    locale,
    onRecord: record ? action('onRecord') : undefined,
    onRefunded: action('onRefunded'),
  };
  const refund = (
    <>
      {connection && <PaymentsConnectionCaption />}
      {trigger ? (
        <RefundButton {...props} />
      ) : (
        <>
          {/* The opener stays in the page: the dialog gives the focus back to it when it closes */}
          <button type="button" onClick={() => setOpen(true)} className={primaryButtonClasses}>
            Open the refund
          </button>
          <RefundDialog {...props} open={open} onOpenChange={setOpen} />
        </>
      )}
    </>
  );
  // Nova's own connection: no Satellite store above, a real Nova Connect modal
  if (connection === 'own') {
    return <NovaPaymentsProvider ownConnection={STORY_OWN_CONNECTION}>{refund}</NovaPaymentsProvider>;
  }
  return (
    <SimulatedWallet connection={wallet} options={walletOptions}>
      {refund}
    </SimulatedWallet>
  );
}

const meta: Meta<typeof SimulatedRefund> = {
  title: 'Nova Payments/Refunds/RefundButton',
  component: SimulatedRefund,
  parameters: { layout: 'centered' },
  args: { chain: 'base', payer: true, outcome: 'confirmed', record: true },
  argTypes: {
    chain: { control: 'inline-radio', options: ['base', 'solana'] },
    outcome: { control: 'inline-radio', options: ['confirmed', 'failed', 'notTaken'] },
    connection: { control: false },
  },
};
export default meta;

type Story = StoryObj<typeof SimulatedRefund>;

const METAMASK_ON_BASE_SEPOLIA: SimulatedConnection = {
  address: '0x7a0b3c4d5e6f708192a3b4c5d6e7f8091a2b77e1',
  chainId: 84532,
  connectorType: 'evm:metamask',
};
const EVERYTHING: RefundRequest = { mode: 'exact_received', reason: 'Order cancelled' };

/** The page of a paid invoice: "Refund" opens the window. */
export const Button: Story = { args: { trigger: true } };

/** What to refund: an amount of the invoice currency (everything left when empty) or the tokens received. */
export const Amount: Story = {};

/** The app worked out the refund: the window asks for a wallet of the payment's network at once. */
export const ConnectWallet: Story = { args: { params: EVERYTHING } };

/**
 * The price moved since the payment: "Continue" shows how many tokens go out against what came in, before the refund is
 * asked for, since a requested refund holds its amount.
 */
export const PriceMoved: Story = { args: { moved: true, wallet: METAMASK_ON_BASE_SEPOLIA } };

/** What goes where, from which wallet with its balance, and the network fee. */
export const Confirm: Story = { args: { params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA } };

/** The wallet is on Ethereum: the window asks to switch it to Base Sepolia first, as the checkout does. */
export const WrongNetwork: Story = {
  args: { params: EVERYTHING, wallet: { ...METAMASK_ON_BASE_SEPOLIA, chainId: 1 } },
};

/** The wallet holds 5 USDC: nothing is asked of it, and the refund can be recorded after sending it another way. */
export const NotEnough: Story = {
  args: { params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { balance: 5_000_000n } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Send refund' }));
    await expect(await page.findByText(/Not enough USDC/)).toBeVisible();
  },
};

/** The merchant declines in the wallet: nothing was sent, the refund waits for its transaction. */
export const Declined: Story = {
  args: { params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA, walletOptions: { decline: true } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Send refund' }));
    await expect(await page.findByText(/You declined the request/, {}, { timeout: 5000 })).toBeVisible();
  },
};

/** The whole refund: the wallet sends it, Quasar follows it and issues the credit note. */
export const Refunded: Story = {
  args: { params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Send refund' }));
    await expect(await page.findByText('TEST-CN-2026-4', {}, { timeout: 8000 })).toBeVisible();
  },
};

/** The transaction failed on-chain: the window says so and offers the same refund again. */
export const FailedOnChain: Story = {
  args: { params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA, outcome: 'failed' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Send refund' }));
    await expect(await page.findByText('The refund failed', {}, { timeout: 8000 })).toBeVisible();
  },
};

/** The wallet sent the refund but Quasar did not take it: the same transaction is handed over again, never sent twice. */
export const NotHandedOver: Story = {
  args: { params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA, outcome: 'notTaken' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Send refund' }));
    await expect(await page.findByRole('button', { name: 'Hand it over again' }, { timeout: 5000 })).toBeVisible();
  },
};

/** Quasar does not know the payer's wallet: the refund can only be recorded after sending it another way. */
export const NoPayer: Story = { args: { params: EVERYTHING, payer: false } };

/** A payment on Solana devnet, sent back from Phantom. */
export const Solana: Story = {
  args: {
    chain: 'solana',
    params: EVERYTHING,
    wallet: {
      address: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      chainId: 'devnet',
      connectorType: 'solana:phantom',
    },
  },
};

/**
 * The app's connection: the refund sends from the wallet of the app's Satellite store (here the simulated wallet), and
 * "Change wallet" opens the app's Nova Connect.
 */
export const AppConnection: Story = {
  name: "App's connection",
  args: { connection: 'app', params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByTestId('payments-connection')).toHaveTextContent(/^app$/);
    await expect(await page.findByRole('button', { name: 'Send refund' })).toBeVisible();
  },
};

/**
 * Nova's own connection: an app without a Satellite store (an admin page, say) gives `ownConnection`, and "Connect
 * wallet" opens Nova's own Nova Connect modal on the wallets of the payment's network.
 */
export const OwnConnection: Story = {
  name: "Nova's own connection",
  args: { connection: 'own', params: EVERYTHING },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByTestId('payments-connection')).toHaveTextContent(/^own$/);
    await userEvent.click(await page.findByRole('button', { name: 'Connect wallet' }, { timeout: 5000 }));
    await expect(await page.findByRole('dialog', { name: /Connect Wallet/i })).toBeVisible();
  },
};

/** In Ukrainian. */
export const Ukrainian: Story = { args: { locale: 'uk', params: EVERYTHING, wallet: METAMASK_ON_BASE_SEPOLIA } };
