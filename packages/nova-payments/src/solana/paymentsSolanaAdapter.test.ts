import {
  AccountRole,
  address,
  getBase58Encoder,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  SolanaError,
} from '@solana/kit';
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import { OrbitAdapter } from '@tuwaio/orbit-core';
import { TransactionTracker } from '@tuwaio/pulsar-core';
import type { PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const solana = vi.hoisted(() => ({
  rpc: {} as Record<string, ReturnType<typeof vi.fn>>,
  createClient: vi.fn(),
  createSigner: vi.fn(),
  signAndSend: vi.fn(),
}));

vi.mock('@tuwaio/orbit-solana', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createSolanaClientWithCache: solana.createClient,
  createSolanaTransactionSendingSigner: solana.createSigner,
}));
vi.mock('@solana/kit', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  signAndSendTransactionMessageWithSigners: solana.signAndSend,
}));

const { paymentsSolanaAdapter } = await import('./paymentsSolanaAdapter');

const DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const PAYER = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const MERCHANT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const PYUSD = '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo';
const REFERENCE = '9yYb9dhzyFZGnJgUqt9uZaCvYEJcVwd8xTbgaiVtVb8Y';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SIGNATURE = '5'.repeat(88);

const sol: PaymentInstructions = {
  family: 'solana',
  chainId: DEVNET,
  to: MERCHANT,
  token: 'native',
  amount: '584994667',
  decimals: 9,
  symbol: 'SOL',
  reference: REFERENCE,
  solanaPayUrl: 'solana:x',
};
const usdc: PaymentInstructions = { ...sol, token: USDC, amount: '89540000', decimals: 6, symbol: 'USDC' };

/** An RPC call answered with `value` (as `@solana/kit` RPC methods resolve with `.send()`). */
const answers = (value: unknown) => vi.fn(() => ({ send: async () => value }));
/** A jsonParsed mint account owned by a token program, with extensions. */
const mint = (owner: string, extensions: unknown[] = []) => ({
  value: { owner, data: { parsed: { type: 'mint', info: { decimals: 6, extensions } } } },
});

const signer = { address: address(PAYER), signAndSendTransactions: vi.fn() };
const connection = { connectedAccount: { address: PAYER } };

beforeEach(() => {
  solana.rpc = {
    getBalance: answers({ value: 2_000_000_000n }),
    getTokenAccountsByOwner: answers({
      value: [
        { account: { data: { parsed: { info: { tokenAmount: { amount: '40000000' } } } } } },
        { account: { data: { parsed: { info: { tokenAmount: { amount: '12100000' } } } } } },
      ],
    }),
    getAccountInfo: answers(mint(TOKEN_PROGRAM_ADDRESS)),
    getMinimumBalanceForRentExemption: answers(2_039_280n),
    getLatestBlockhash: answers({
      value: { blockhash: 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N', lastValidBlockHeight: 100n },
    }),
  };
  solana.createClient.mockImplementation(() => ({ rpc: solana.rpc }));
  solana.createSigner.mockReset().mockReturnValue(signer);
  solana.signAndSend.mockReset().mockResolvedValue(new Uint8Array(getBase58Encoder().encode(SIGNATURE)));
});

/** The instructions of the message the wallet was asked to sign and send. */
const sentInstructions = () =>
  (
    solana.signAndSend.mock.calls[0][0] as {
      instructions: { programAddress: string; accounts: { address: string; role: number }[] }[];
    }
  ).instructions;

describe('paymentsSolanaAdapter', () => {
  it("reads SOL and a token's balance over all of the account's token accounts of that mint", async () => {
    const adapter = paymentsSolanaAdapter({ rpcUrls: { devnet: 'https://devnet.example' } });
    await expect(adapter.getBalance({ chainId: DEVNET, account: PAYER, token: 'native' })).resolves.toBe(
      2_000_000_000n,
    );
    await expect(adapter.getBalance({ chainId: DEVNET, account: PAYER, token: USDC })).resolves.toBe(52_100_000n);
    expect(solana.rpc.getTokenAccountsByOwner).toHaveBeenCalledWith(PAYER, { mint: USDC }, { encoding: 'jsonParsed' });
    expect(solana.createClient).toHaveBeenCalledWith({
      rpcUrlOrMoniker: 'devnet',
      rpcUrls: { devnet: 'https://devnet.example' },
    });
  });

  it('estimates the fee: one signature, plus the rent of the merchant token account when it does not exist yet', async () => {
    const adapter = paymentsSolanaAdapter();
    await expect(adapter.estimateFee!({ instructions: sol, account: PAYER })).resolves.toEqual({
      amount: 5000n,
      decimals: 9,
      symbol: 'SOL',
    });
    solana.rpc.getAccountInfo = vi
      .fn()
      .mockReturnValueOnce({ send: async () => mint(TOKEN_PROGRAM_ADDRESS) })
      .mockReturnValueOnce({ send: async () => ({ value: null }) });
    await expect(adapter.estimateFee!({ instructions: usdc, account: PAYER })).resolves.toMatchObject({
      amount: 2_044_280n,
    });
  });

  it('sends SOL with the Solana Pay reference as a read-only key of the transfer, signed by the connected account', async () => {
    const adapter = paymentsSolanaAdapter();
    await expect(adapter.sendTransfer({ instructions: sol, account: PAYER, connection })).resolves.toBe(SIGNATURE);
    expect(solana.createSigner).toHaveBeenCalledWith(connection.connectedAccount, 'devnet');
    const [transfer] = sentInstructions();
    expect(transfer.programAddress).toBe('11111111111111111111111111111111');
    expect(transfer.accounts.map(({ address: key, role }) => [key, role])).toEqual([
      [PAYER, AccountRole.WRITABLE_SIGNER],
      [MERCHANT, AccountRole.WRITABLE],
      [REFERENCE, AccountRole.READONLY],
    ]);
    expect(sentInstructions()).toHaveLength(1);
  });

  // A refund (RefundButton) goes to the payer without a Solana Pay reference: Quasar takes its signature
  it('sends a transfer without a reference key when it has none', async () => {
    const adapter = paymentsSolanaAdapter();
    await adapter.sendTransfer({
      instructions: { ...sol, reference: '', solanaPayUrl: '' },
      account: PAYER,
      connection,
    });
    const [transfer] = sentInstructions();
    expect(transfer.accounts.map(({ address: key }) => key)).toEqual([PAYER, MERCHANT]);
  });

  it('tells when the wallet sent on another Solana network: the blockhash of the payment is unknown there', async () => {
    const adapter = paymentsSolanaAdapter();
    // How wallets report it: the RPC error of their network, directly or as the cause
    for (const error of [
      new Error('Transaction simulation failed: Blockhash not found'),
      Object.assign(new Error('Unexpected error'), { cause: { code: -32002, message: 'BlockhashNotFound' } }),
      { code: -32603, message: 'failed to send transaction: Transaction simulation failed: Blockhash not found' },
      // The errors of @solana/kit, whose messages production builds strip
      new SolanaError(SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE, {
        accounts: null,
        cause: new SolanaError(SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND),
        logs: null,
        returnData: null,
        unitsConsumed: undefined,
      } as never),
    ]) {
      solana.signAndSend.mockRejectedValueOnce(error);
      await expect(adapter.sendTransfer({ instructions: sol, account: PAYER, connection })).rejects.toMatchObject({
        name: 'PaymentWalletError',
        kind: 'wrongNetwork',
      });
    }
    // Anything else is the wallet's own error
    const declined = Object.assign(new Error('User rejected the request.'), { code: 4001 });
    solana.signAndSend.mockRejectedValueOnce(declined);
    await expect(adapter.sendTransfer({ instructions: sol, account: PAYER, connection })).rejects.toBe(declined);
  });

  it("sends a token to the merchant's associated account, creating it when needed, with the reference", async () => {
    const adapter = paymentsSolanaAdapter();
    await adapter.sendTransfer({ instructions: usdc, account: PAYER, connection });
    const [create, transfer] = sentInstructions();
    const [source] = await findAssociatedTokenPda({
      owner: address(PAYER),
      mint: address(USDC),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const [destination] = await findAssociatedTokenPda({
      owner: address(MERCHANT),
      mint: address(USDC),
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    expect(create.programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
    expect(create.accounts[1].address).toBe(destination);
    expect(transfer.programAddress).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(transfer.accounts.map(({ address: key }) => key)).toEqual([source, USDC, destination, PAYER, REFERENCE]);
    expect(transfer.accounts[4].role).toBe(AccountRole.READONLY);
  });

  it('pays a Token-2022 mint through its own program', async () => {
    solana.rpc.getAccountInfo = answers(mint(TOKEN_2022, [{ extension: 'transferFeeConfig', state: {} }]));
    const adapter = paymentsSolanaAdapter();
    await adapter.sendTransfer({ instructions: { ...usdc, token: PYUSD }, account: PAYER, connection });
    const [create, transfer] = sentInstructions();
    const [destination] = await findAssociatedTokenPda({
      owner: address(MERCHANT),
      mint: address(PYUSD),
      tokenProgram: address(TOKEN_2022),
    });
    expect(transfer.programAddress).toBe(TOKEN_2022);
    expect(create.accounts[1].address).toBe(destination);
  });

  it('leaves a mint with a transfer hook to a Solana Pay wallet, and needs the connected account to sign', async () => {
    solana.rpc.getAccountInfo = answers(
      mint(TOKEN_2022, [
        { extension: 'transferHook', state: { programId: 'SysvarRent111111111111111111111111111111111' } },
      ]),
    );
    const adapter = paymentsSolanaAdapter();
    await expect(
      adapter.sendTransfer({ instructions: { ...usdc, token: PYUSD }, account: PAYER, connection }),
    ).rejects.toMatchObject({
      kind: 'unsupported',
    });
    await expect(
      adapter.sendTransfer({ instructions: sol, account: PAYER, connection: undefined }),
    ).rejects.toMatchObject({
      kind: 'unsupported',
    });
    await expect(adapter.sendTransfer({ instructions: sol, account: MERCHANT, connection })).rejects.toMatchObject({
      kind: 'unsupported',
    });
    expect(solana.signAndSend).not.toHaveBeenCalled();
  });

  it('describes a sent payment as a pending Pulsar transaction followed by its signature', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_791_000_000_500);
    const tx = paymentsSolanaAdapter({ rpcUrls: { devnet: 'https://devnet.example' } }).pulsarTransaction!({
      txKey: SIGNATURE,
      instructions: usdc,
      account: PAYER,
      connectorType: 'solana:phantom',
      title: 'Payment to Acme Labs',
      description: '89.54 USDC · INV-2026-42',
      payload: { quasarInvoice: 'inv_1' },
    });
    expect(tx).toEqual({
      adapter: OrbitAdapter.SOLANA,
      tracker: TransactionTracker.Solana,
      txKey: SIGNATURE,
      chainId: DEVNET,
      rpcUrl: 'https://devnet.example',
      from: PAYER,
      type: 'payment',
      connectorType: 'solana:phantom',
      title: 'Payment to Acme Labs',
      description: '89.54 USDC · INV-2026-42',
      payload: { quasarInvoice: 'inv_1' },
      pending: true,
      localTimestamp: 1_791_000_000,
      isTrackedModalOpen: false,
    });
    vi.restoreAllMocks();
  });

  it('links a transaction to the Solana explorer of its cluster', () => {
    expect(paymentsSolanaAdapter().explorerUrl!({ chainId: DEVNET, txKey: SIGNATURE })).toBe(
      `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet`,
    );
  });

  it('refuses a chain that is not Solana', async () => {
    await expect(
      paymentsSolanaAdapter().getBalance({ chainId: 'eip155:1', account: PAYER, token: 'native' }),
    ).rejects.toThrow('not a Solana chain');
  });
});
