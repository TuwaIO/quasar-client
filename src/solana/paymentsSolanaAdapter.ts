import {
  AccountRole,
  type Address,
  address,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  getBase58Decoder,
  type Instruction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  type TransactionSendingSigner,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from '@solana-program/token';
import { OrbitAdapter } from '@tuwaio/orbit-core';
import {
  createSolanaClientWithCache,
  createSolanaTransactionSendingSigner,
  getCluster,
  getSolanaExplorerLink,
  type SolanaClusterMoniker,
} from '@tuwaio/orbit-solana';
import { type SolanaTransaction, TransactionTracker } from '@tuwaio/pulsar-core';
import type { PaymentInstructions } from '@tuwaio/quasar-sdk/checkout';

import type { PaymentsAdapter } from '../adapters/types';
import { PaymentWalletError } from '../utils/walletErrors';

/** The Token-2022 program. */
const TOKEN_2022_PROGRAM_ADDRESS = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
/** The fee of one signature, in lamports. */
const SIGNATURE_FEE = 5000n;
/** The size of a token account, for its rent. */
const TOKEN_ACCOUNT_SIZE = 165n;

/** The Wallet Standard account of a Satellite Connect Solana connection. */
type SigningAccount = Parameters<typeof createSolanaTransactionSendingSigner>[0];

/** A jsonParsed mint account, as far as the adapter reads it. */
type ParsedMint = {
  owner: string;
  data: { parsed?: { info?: { extensions?: { extension: string; state?: { programId?: string | null } }[] } } };
} | null;

/** Options of {@link paymentsSolanaAdapter}. */
export interface PaymentsSolanaAdapterOptions {
  /** RPC URLs by cluster (`devnet`, `mainnet`…); the public endpoint of a cluster without one. */
  rpcUrls?: Partial<Record<SolanaClusterMoniker, string>>;
}

/** The Solana instructions of a quote. */
function solanaInstructions(instructions: PaymentInstructions) {
  if (instructions.family !== 'solana') throw new Error(`${instructions.chainId} is not a Solana chain`);
  return instructions;
}

/** The cluster moniker of a CAIP-2 Solana chain (`devnet`). */
function clusterOf(chainId: string): SolanaClusterMoniker {
  if (!chainId.startsWith('solana:')) throw new Error(`${chainId} is not a Solana chain`);
  return getCluster({ cluster: chainId }) as SolanaClusterMoniker;
}

/** An instruction with the Solana Pay reference as a read-only key, as wallets add it. */
const withReference = <T extends Instruction>(instruction: T, reference: string): T => ({
  ...instruction,
  accounts: [...(instruction.accounts ?? []), { address: address(reference), role: AccountRole.READONLY }],
});

/**
 * The adapter that pays Solana methods of a Nova Payments checkout from the Wallet Standard wallet connected through
 * Satellite Connect. It reads balances and estimates fees on the network, and sends SOL with a system transfer or a
 * token with `transferChecked` to the merchant's associated token account (created when missing), in the token's own
 * program (Token or Token-2022), always with the Solana Pay reference key of the quote. A Token-2022 mint with a
 * transfer hook is refused: a Solana Pay wallet pays it with the QR code. Pass it in `adapters` of
 * `NovaPaymentsProvider`.
 *
 * Side effects: RPC reads (the URLs of `rpcUrls`, else the public endpoints of the clusters); wallet prompts.
 *
 * @param options - See {@link PaymentsSolanaAdapterOptions}.
 * @returns The Solana adapter.
 *
 * @example
 * ```tsx
 * import { NovaPaymentsProvider } from '@tuwaio/nova-payments';
 * import { paymentsSolanaAdapter } from '@tuwaio/nova-payments/solana';
 *
 * const adapters = [paymentsSolanaAdapter({ rpcUrls: { devnet: 'https://api.devnet.solana.com' } })];
 *
 * export function Payments({ children }: { children: React.ReactNode }) {
 *   return <NovaPaymentsProvider adapters={adapters}>{children}</NovaPaymentsProvider>;
 * }
 * ```
 */
export function paymentsSolanaAdapter({ rpcUrls }: PaymentsSolanaAdapterOptions = {}): PaymentsAdapter {
  const rpcOf = (chainId: string) => createSolanaClientWithCache({ rpcUrlOrMoniker: clusterOf(chainId), rpcUrls }).rpc;

  /** The token program that owns a mint; a transfer hook needs accounts only a Solana Pay wallet resolves. */
  const tokenProgramOf = async (chainId: string, mint: Address): Promise<Address> => {
    const { value } = (await rpcOf(chainId).getAccountInfo(mint, { encoding: 'jsonParsed' }).send()) as {
      value: ParsedMint;
    };
    if (!value) throw new Error(`${mint} is not a token mint`);
    if (value.owner === TOKEN_PROGRAM_ADDRESS) return TOKEN_PROGRAM_ADDRESS;
    if (value.owner !== TOKEN_2022_PROGRAM_ADDRESS) throw new Error(`${mint} is not a token mint`);
    const hook = value.data.parsed?.info?.extensions?.find((item) => item.extension === 'transferHook');
    if (hook?.state?.programId) {
      throw new PaymentWalletError('unsupported', 'A token with a transfer hook is paid with the QR code');
    }
    return TOKEN_2022_PROGRAM_ADDRESS;
  };

  /** The merchant's associated token account of the quoted mint, and its program. */
  const merchantTokenAccount = async (instructions: Extract<PaymentInstructions, { family: 'solana' }>) => {
    const mint = address(instructions.token);
    const tokenProgram = await tokenProgramOf(instructions.chainId, mint);
    const [account] = await findAssociatedTokenPda({ owner: address(instructions.to), mint, tokenProgram });
    return { mint, tokenProgram, account };
  };

  /** The instructions of the transfer the quote describes. */
  const transferInstructions = async (
    instructions: Extract<PaymentInstructions, { family: 'solana' }>,
    signer: TransactionSendingSigner,
  ): Promise<Instruction[]> => {
    const amount = BigInt(instructions.amount);
    if (instructions.token === 'native') {
      const transfer = getTransferSolInstruction({ source: signer, destination: address(instructions.to), amount });
      return [withReference(transfer, instructions.reference)];
    }
    const { mint, tokenProgram, account: destination } = await merchantTokenAccount(instructions);
    const [source] = await findAssociatedTokenPda({ owner: signer.address, mint, tokenProgram });
    const create = getCreateAssociatedTokenIdempotentInstruction({
      payer: signer,
      ata: destination,
      owner: address(instructions.to),
      mint,
      tokenProgram,
    });
    const transfer = getTransferCheckedInstruction(
      { source, mint, destination, authority: signer, amount, decimals: instructions.decimals },
      { programAddress: tokenProgram },
    );
    return [create, withReference(transfer, instructions.reference)];
  };

  return {
    family: 'solana',

    getBalance: async ({ chainId, account, token }) => {
      const rpc = rpcOf(chainId);
      if (token === 'native') return (await rpc.getBalance(address(account)).send()).value;
      const { value } = await rpc
        .getTokenAccountsByOwner(address(account), { mint: address(token) }, { encoding: 'jsonParsed' })
        .send();
      return value.reduce((sum, item) => sum + BigInt(item.account.data.parsed.info.tokenAmount.amount), 0n);
    },

    estimateFee: async ({ instructions }) => {
      const solana = solanaInstructions(instructions);
      if (solana.token === 'native') return { amount: SIGNATURE_FEE, decimals: 9, symbol: 'SOL' };
      const { account } = await merchantTokenAccount(solana);
      const rpc = rpcOf(solana.chainId);
      const { value } = await rpc.getAccountInfo(account, { encoding: 'base64' }).send();
      // Creating the merchant's token account costs its rent, paid by the buyer
      const rent = value ? 0n : await rpc.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE).send();
      return { amount: SIGNATURE_FEE + rent, decimals: 9, symbol: 'SOL' };
    },

    sendTransfer: async ({ instructions, account, connection }) => {
      const solana = solanaInstructions(instructions);
      const signingAccount = (connection as { connectedAccount?: SigningAccount } | undefined)?.connectedAccount;
      if (!signingAccount || signingAccount.address !== account) {
        throw new PaymentWalletError('unsupported', 'No connected Solana account to sign with');
      }
      let signer: TransactionSendingSigner;
      try {
        signer = createSolanaTransactionSendingSigner(signingAccount, clusterOf(solana.chainId));
      } catch (error) {
        throw new PaymentWalletError('unsupported', 'The wallet cannot send this transaction', { cause: error });
      }
      const transfer = await transferInstructions(solana, signer);
      const { value: blockhash } = await rpcOf(solana.chainId).getLatestBlockhash().send();
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (draft) => setTransactionMessageFeePayerSigner(signer, draft),
        (draft) => setTransactionMessageLifetimeUsingBlockhash(blockhash, draft),
        (draft) => appendTransactionMessageInstructions(transfer, draft),
      );
      return getBase58Decoder().decode(await signAndSendTransactionMessageWithSigners(message));
    },

    explorerUrl: ({ chainId, txKey }) => getSolanaExplorerLink(`/tx/${txKey}`, clusterOf(chainId)),

    pulsarTransaction: ({ txKey, instructions, account, connectorType, title, description, payload }) => {
      const solana = solanaInstructions(instructions);
      const rpcUrl = rpcUrls?.[clusterOf(solana.chainId)];
      const transaction: SolanaTransaction = {
        adapter: OrbitAdapter.SOLANA,
        tracker: TransactionTracker.Solana,
        txKey,
        chainId: solana.chainId,
        ...(rpcUrl ? { rpcUrl } : {}),
        from: account,
        type: 'payment',
        connectorType,
        title,
        description,
        payload,
        pending: true,
        localTimestamp: Math.floor(Date.now() / 1000),
        isTrackedModalOpen: false,
      };
      return transaction;
    },
  };
}
