/**
 * @file The one-time account of a gasless payment, through the real wagmi and viem: what it asks the chain and the
 * checkout's paymaster route is answered here, so the requests are the ones Quasar's route checks (the account's
 * delegation, the one authorized call, the chain) and the merchant's bundler takes.
 */
import { createConfig, http } from '@wagmi/core';
import {
  type Address,
  decodeFunctionData,
  encodeFunctionResult,
  getAddress,
  type Hex,
  hexToNumber,
  multicall3Abi,
  numberToHex,
  pad,
  parseAbi,
} from 'viem';
import { entryPoint08Address } from 'viem/account-abstraction';
import { baseSepolia } from 'viem/chains';
import { recoverAuthorizationAddress } from 'viem/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { walletErrorKind } from '../utils/walletErrors';
import { paymentsEVMAdapter } from './paymentsEVMAdapter';

const NODE = 'https://node.test/base-sepolia';
const PAYMASTER = 'https://quasar.test/v1/payments/checkout/tok_1/paymaster';
const SIMPLE_7702 = '0xe6Cae83BdE06E4c305530e199D7217f42808555B';
const PIMLICO_PAYMASTER = '0x777777777777AeC03fd955926DbF81597e66834C';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const CALL = { to: USDC, data: `0xe3ee160e${'11'.repeat(64)}` as Hex };
const USER_OP_HASH = `0x${'ab'.repeat(32)}`;
const EXECUTE = parseAbi(['function execute(address target, uint256 value, bytes data)']);

interface UserOperation {
  sender: Address;
  nonce: Hex;
  factory?: Address;
  callData: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
  paymaster?: Address;
  eip7702Auth?: { address: Address; chainId: Hex; nonce: Hex; r: Hex; s: Hex; yParity: Hex };
}

/** The requests that reached each host, in order. */
let requests: { url: string; method: string; params: unknown[] }[] = [];

/** What the paymaster route answers; a method set to an `Error` answers a JSON-RPC refusal. */
let routeAnswers: Record<string, unknown> = {};

const gasPrice = (maxFeePerGas: bigint, maxPriorityFeePerGas: bigint) => ({
  maxFeePerGas: numberToHex(maxFeePerGas),
  maxPriorityFeePerGas: numberToHex(maxPriorityFeePerGas),
});

const ROUTE: Record<string, unknown> = {
  pimlico_getUserOperationGasPrice: {
    slow: gasPrice(4_000_000n, 1_000_000n),
    standard: gasPrice(5_000_000n, 1_100_000n),
    fast: gasPrice(6_000_000n, 1_200_000n),
  },
  pm_getPaymasterStubData: {
    paymaster: PIMLICO_PAYMASTER,
    paymasterData: '0x01',
    paymasterVerificationGasLimit: numberToHex(40_000),
    paymasterPostOpGasLimit: numberToHex(1),
    isFinal: false,
  },
  eth_estimateUserOperationGas: {
    preVerificationGas: numberToHex(79_600),
    verificationGasLimit: numberToHex(101_136),
    callGasLimit: numberToHex(74_351),
    paymasterVerificationGasLimit: numberToHex(40_000),
    paymasterPostOpGasLimit: numberToHex(1),
  },
  pm_getPaymasterData: { paymaster: PIMLICO_PAYMASTER, paymasterData: '0x02' },
  eth_sendUserOperation: USER_OP_HASH,
};

/** What the reads ask of the chain: wagmi's clients batch them through Multicall3. */
let reads: { to: Address; data: Hex }[] = [];

const NODE_ANSWERS: Record<string, unknown> = {
  eth_chainId: numberToHex(baseSepolia.id),
  // A new key has no code yet: its delegation comes with the operation
  eth_getCode: '0x',
  // EntryPoint 0.8 `getNonce` of a new account: 0
  eth_call: (params: unknown[]) => {
    const [{ to, data }] = params as [{ to: Address; data: Hex }];
    if (getAddress(to) !== getAddress(baseSepolia.contracts.multicall3.address)) {
      reads.push({ to, data });
      return pad('0x0');
    }
    const calls = decodeFunctionData({ abi: multicall3Abi, data }).args[0] as readonly {
      target: Address;
      callData: Hex;
    }[];
    reads.push(...calls.map((call) => ({ to: call.target, data: call.callData })));
    return encodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      result: calls.map(() => ({ success: true, returnData: pad('0x0') })),
    });
  },
};

const rpcAnswer = (id: unknown, result: unknown) =>
  new Response(
    JSON.stringify(
      result instanceof Error
        ? { jsonrpc: '2.0', id, error: { code: -32000, message: result.message, data: { reason: result.message } } }
        : { jsonrpc: '2.0', id, result },
    ),
    { headers: { 'content-type': 'application/json' } },
  );

beforeEach(() => {
  requests = [];
  reads = [];
  routeAnswers = { ...ROUTE };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { body?: unknown }) => {
      const url = String(input instanceof Request ? input.url : input);
      const body = JSON.parse(String(init?.body)) as { id: number; method: string; params?: unknown[] };
      requests.push({ url, method: body.method, params: body.params ?? [] });
      const answers = url === PAYMASTER ? routeAnswers : url === NODE ? NODE_ANSWERS : null;
      if (!answers || !(body.method in answers)) throw new Error(`Unexpected request ${body.method} to ${url}`);
      const answer = answers[body.method];
      return rpcAnswer(body.id, typeof answer === 'function' ? answer(body.params ?? []) : answer);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const adapter = () =>
  paymentsEVMAdapter(createConfig({ chains: [baseSepolia], transports: { [baseSepolia.id]: http(NODE) } }));

const routeRequests = (method: string) => requests.filter((r) => r.url === PAYMASTER && r.method === method);

describe('paymentsEVMAdapter: the one-time account of a gasless payment', () => {
  it('sends the authorized call from a new account delegated to Simple7702, through the paymaster route', async () => {
    const send = adapter().sendOneTimeRelay!;
    await expect(send({ chainId: 'eip155:84532', call: CALL, paymasterUrl: PAYMASTER })).resolves.toBe(USER_OP_HASH);

    // The route answers it all: the price, the sponsorship, the gas and the bundler; the chain the nonce and the code
    expect(requests.filter((r) => r.url === PAYMASTER).map((r) => r.method)).toEqual([
      'pimlico_getUserOperationGasPrice',
      'pm_getPaymasterStubData',
      'eth_estimateUserOperationGas',
      'pm_getPaymasterData',
      'eth_sendUserOperation',
    ]);
    expect(requests.every((r) => r.url === PAYMASTER || r.url === NODE)).toBe(true);
    expect(
      requests
        .filter((r) => r.url === NODE)
        .map((r) => r.method)
        .sort(),
    ).toEqual(['eth_call', 'eth_getCode']);
    expect(reads.map((read) => read.to)).toEqual([entryPoint08Address]);

    const [sent] = routeRequests('eth_sendUserOperation');
    const [op, entryPoint] = sent.params as [UserOperation, Address];
    expect(sent.params).toHaveLength(2);
    expect(entryPoint).toBe(entryPoint08Address);
    // One call, exactly the authorized one, from the account itself
    expect(decodeFunctionData({ abi: EXECUTE, data: op.callData }).args).toEqual([CALL.to, 0n, CALL.data]);
    expect(op).toMatchObject({ nonce: '0x0', factory: '0x7702', paymaster: PIMLICO_PAYMASTER });
    // The bundler's fast price
    expect(op).toMatchObject(gasPrice(6_000_000n, 1_200_000n));
    // The new key delegates its own account to Simple7702, on this chain only
    const auth = op.eip7702Auth!;
    expect(getAddress(auth.address)).toBe(SIMPLE_7702);
    expect(hexToNumber(auth.chainId)).toBe(baseSepolia.id);
    expect(hexToNumber(auth.nonce)).toBe(0);
    const signer = await recoverAuthorizationAddress({
      authorization: {
        address: auth.address,
        chainId: hexToNumber(auth.chainId),
        nonce: hexToNumber(auth.nonce),
        r: auth.r,
        s: auth.s,
        yParity: hexToNumber(auth.yParity),
      },
    });
    expect(signer).toBe(getAddress(op.sender));

    // The paymaster requests carry the chain; the bundler's are in the standard form
    for (const method of ['pm_getPaymasterStubData', 'pm_getPaymasterData']) {
      const [request] = routeRequests(method);
      expect(request.params.slice(1, 3)).toEqual([entryPoint08Address, numberToHex(baseSepolia.id)]);
      expect((request.params[0] as UserOperation).sender).toBe(op.sender);
    }
    expect(routeRequests('eth_estimateUserOperationGas')[0].params).toHaveLength(2);
  });

  it('makes a new account for each payment', async () => {
    const send = adapter().sendOneTimeRelay!;
    await send({ chainId: 'eip155:84532', call: CALL, paymasterUrl: PAYMASTER });
    await send({ chainId: 'eip155:84532', call: CALL, paymasterUrl: PAYMASTER });
    const senders = routeRequests('eth_sendUserOperation').map((r) => (r.params[0] as UserOperation).sender);
    expect(senders).toHaveLength(2);
    expect(senders[0]).not.toBe(senders[1]);
  });

  it('sends nothing the paymaster refused to sponsor, and throws its refusal', async () => {
    routeAnswers.pm_getPaymasterStubData = new Error('not_the_authorized_transfer');
    const send = adapter().sendOneTimeRelay!;
    await expect(send({ chainId: 'eip155:84532', call: CALL, paymasterUrl: PAYMASTER })).rejects.toThrow(
      /not_the_authorized_transfer/,
    );
    expect(routeRequests('eth_sendUserOperation')).toEqual([]);
  });

  it("throws when the bundler's price cannot be read, before it asks for a sponsorship", async () => {
    routeAnswers.pimlico_getUserOperationGasPrice = new Error('no_quote');
    const send = adapter().sendOneTimeRelay!;
    await expect(send({ chainId: 'eip155:84532', call: CALL, paymasterUrl: PAYMASTER })).rejects.toThrow('no_quote');
    expect(routeRequests('eth_sendUserOperation')).toEqual([]);
  });

  it('refuses a network the app has not configured', async () => {
    const send = adapter().sendOneTimeRelay!;
    const refused = await send({ chainId: 'eip155:8453', call: CALL, paymasterUrl: PAYMASTER }).catch((e) => e);
    expect(walletErrorKind(refused)).toBe('unsupported');
    expect(requests).toEqual([]);
  });
});
