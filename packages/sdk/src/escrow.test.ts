import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Address, Keypair, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import type { EscrowStatus } from '@stellar-starter-kit/types';
import { EscrowError } from './index';
import {
  CONTRACT_ID,
  PUBLIC_KEY,
  escrowScVal,
  fakeTransport,
  invokedCall,
  makeEscrowClient,
  sendResponse,
  simulationError,
  simulationSuccess,
  txResponse,
} from './test-helpers';

const { GetTransactionStatus } = SorobanRpc.Api;

const PAYEE = Keypair.random().publicKey();
const ARBITER = Keypair.random().publicKey();

/** The contract arguments of the first operation of `tx`. */
function callArgs(tx: unknown): xdr.ScVal[] {
  const op = (tx as { operations: Array<{ func: xdr.HostFunction }> }).operations[0];
  return op!.func.invokeContract().args();
}

describe('EscrowClient reads', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
    rpc.simulateTransaction.mockImplementation(
      async (tx: Parameters<ReturnType<typeof fakeTransport>['simulateTransaction']>[0]) => {
        if (invokedCall(tx).method !== 'get_escrow') {
          throw new Error(`Unexpected simulation of ${invokedCall(tx).method}`);
        }
        return simulationSuccess(xdr.ScVal.scvVoid());
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes an escrow into the domain shape with its status name', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationSuccess(
        escrowScVal({
          id: 42n,
          payee: PAYEE,
          arbiter: ARBITER,
          amount: 500_000_000n,
          deadline: 2_000n,
          status: 1,
        }),
      ),
    );

    await expect(makeEscrowClient({ transport: rpc }).getEscrow(42)).resolves.toEqual({
      id: '42',
      payer: PUBLIC_KEY,
      payee: PAYEE,
      arbiter: ARBITER,
      token: CONTRACT_ID,
      amount: '500000000',
      deadline: '2000',
      status: 'funded',
    });
  });

  it.each([
    [0, 'created'],
    [1, 'funded'],
    [2, 'released'],
    [3, 'refunded'],
    [4, 'cancelled'],
  ] as Array<[number, EscrowStatus]>)('maps contract status %i to %s', async (index, name) => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(escrowScVal({ status: index })));

    const escrow = await makeEscrowClient({ transport: rpc }).getEscrow(1);
    expect(escrow?.status).toBe(name);
  });

  it('returns null for an escrow that does not exist', async () => {
    await expect(makeEscrowClient({ transport: rpc }).getEscrow(99)).resolves.toBeNull();
  });

  it('fails loudly on a status index the contract does not define yet', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(escrowScVal({ status: 9 })));

    await expect(makeEscrowClient({ transport: rpc }).getEscrow(1)).rejects.toThrow(
      'Unknown escrow status index: 9',
    );
  });

  it('addresses the read to the configured escrow contract', async () => {
    await makeEscrowClient({ transport: rpc })
      .getEscrow(1)
      .catch(() => undefined);

    expect(invokedCall(rpc.simulateTransaction.mock.calls[0]![0])).toEqual({
      contractId: CONTRACT_ID,
      method: 'get_escrow',
    });
  });

  it('decodes an ordered milestone schedule to bigints', async () => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationSuccess(nativeToScVal([400n, 600n], { type: 'i128' })),
    );

    await expect(makeEscrowClient({ transport: rpc }).getMilestones(42)).resolves.toEqual([
      400n,
      600n,
    ]);
    expect(invokedCall(rpc.simulateTransaction.mock.calls[0]![0])).toEqual({
      contractId: CONTRACT_ID,
      method: 'get_milestones',
    });
  });

  it('returns null when the escrow has no milestone schedule', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));

    await expect(makeEscrowClient({ transport: rpc }).getMilestones(42)).resolves.toBeNull();
  });
});

describe('EscrowClient writes', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = fakeTransport();
    rpc.simulateTransaction.mockResolvedValue(simulationSuccess(xdr.ScVal.scvVoid()));
    rpc.sendTransaction.mockResolvedValue(sendResponse('PENDING'));
    rpc.getTransaction.mockResolvedValue(txResponse(GetTransactionStatus.SUCCESS));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('funds an escrow through the shared write pipeline', async () => {
    await expect(makeEscrowClient({ transport: rpc }).fundEscrow(7)).resolves.toEqual({
      hash: 'abc123',
    });
    expect(invokedCall(rpc.simulateTransaction.mock.calls[0]![0])).toEqual({
      contractId: CONTRACT_ID,
      method: 'fund_escrow',
    });
    expect(scValToNative(callArgs(rpc.prepareTransaction.mock.calls[0]![0])[0]!)).toBe(7n);
  });

  it('passes every create_escrow parameter through in contract order', async () => {
    await makeEscrowClient({ transport: rpc }).createEscrow({
      id: '5',
      payer: PUBLIC_KEY,
      payee: PAYEE,
      arbiter: ARBITER,
      token: CONTRACT_ID,
      amount: '500000000',
      deadline: '2000',
    });

    const args = callArgs(rpc.prepareTransaction.mock.calls[0]![0]);
    expect(scValToNative(args[0]!)).toBe(5n);
    expect(Address.fromScVal(args[1]!).toString()).toBe(PUBLIC_KEY);
    expect(Address.fromScVal(args[2]!).toString()).toBe(PAYEE);
    expect(Address.fromScVal(args[3]!).toString()).toBe(ARBITER);
    expect(Address.fromScVal(args[4]!).toString()).toBe(CONTRACT_ID);
    expect(scValToNative(args[5]!)).toBe(500_000_000n);
    expect(scValToNative(args[6]!)).toBe(2_000n);
  });

  it('encodes the milestone schedule as an ordered Vec<i128>', async () => {
    await makeEscrowClient({ transport: rpc }).setMilestones({
      id: 7n,
      caller: ARBITER,
      amounts: [400n, '600'],
    });

    const tx = rpc.prepareTransaction.mock.calls[0]![0];
    const args = callArgs(tx);
    expect(invokedCall(tx)).toEqual({ contractId: CONTRACT_ID, method: 'set_milestones' });
    expect(scValToNative(args[0]!)).toBe(7n);
    expect(Address.fromScVal(args[1]!).toString()).toBe(ARBITER);
    expect(scValToNative(args[2]!)).toEqual([400n, 600n]);
  });

  it('rejects a token that is not a contract id before touching the RPC', async () => {
    await expect(
      makeEscrowClient({ transport: rpc }).createEscrow({
        id: '5',
        payer: PUBLIC_KEY,
        payee: PAYEE,
        arbiter: ARBITER,
        token: PUBLIC_KEY, // a G... account, not a token contract
        amount: '1',
        deadline: '2000',
      }),
    ).rejects.toThrow('Invalid token contract id');
    expect(rpc.calls()).toBe(0);
  });

  it.each([
    ['releaseEscrow', 'release_escrow'],
    ['refundEscrow', 'refund_escrow'],
    ['cancelEscrow', 'cancel_escrow'],
  ] as Array<['releaseEscrow' | 'refundEscrow' | 'cancelEscrow', string]>)(
    '%s invokes %s with the caller and payout id',
    async (method, contractMethod) => {
      await makeEscrowClient({ transport: rpc })[method](7, ARBITER);

      const args = callArgs(rpc.prepareTransaction.mock.calls[0]![0]);
      expect(invokedCall(rpc.prepareTransaction.mock.calls[0]![0])).toEqual({
        contractId: CONTRACT_ID,
        method: contractMethod,
      });
      expect(scValToNative(args[0]!)).toBe(7n);
      expect(Address.fromScVal(args[1]!).toString()).toBe(ARBITER);
    },
  );

  it('maps a failed simulation through the escrow error codes', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationError('HostError: Error(Contract, #1)'));

    const error = (await makeEscrowClient({ transport: rpc })
      .releaseEscrow(7, ARBITER)
      .catch((e: unknown) => e)) as EscrowError;

    expect(error).toBeInstanceOf(EscrowError);
    expect(error.code).toBe('ESCROW_NOT_FOUND');
    expect(error.contractCode).toBe(1);
    expect(error.message).toBe(
      'Simulation of release_escrow failed: ESCROW_NOT_FOUND (contract error #1) — HostError: Error(Contract, #1)',
    );
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it('surfaces a rejected milestone schedule through EscrowError.code', async () => {
    rpc.simulateTransaction.mockResolvedValue(simulationError('HostError: Error(Contract, #13)'));

    const error = (await makeEscrowClient({ transport: rpc })
      .setMilestones({ id: 7, caller: ARBITER, amounts: [400n, 500n] })
      .catch((e: unknown) => e)) as EscrowError;

    expect(error).toBeInstanceOf(EscrowError);
    expect(error.code).toBe('MILESTONE_SCHEDULE_INVALID');
    expect(error.contractCode).toBe(13);
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it.each([
    [1, 'ESCROW_NOT_FOUND'],
    [2, 'ESCROW_ALREADY_EXISTS'],
    [3, 'INVALID_AMOUNT'],
    [4, 'UNAUTHORIZED_OPERATION'],
    [5, 'INVALID_STATE_TRANSITION'],
    [6, 'DEADLINE_NOT_REACHED'],
    [7, 'DEADLINE_EXPIRED'],
    [8, 'ALREADY_FINALIZED'],
    [9, 'INVALID_DEADLINE'],
    [10, 'MILESTONE_SCHEDULE_NOT_FOUND'],
    [11, 'MILESTONE_INDEX_OUT_OF_RANGE'],
    [12, 'MILESTONE_ALREADY_RELEASED'],
    [13, 'MILESTONE_SCHEDULE_INVALID'],
  ] as const)('maps escrow contract error #%i to %s', async (contractCode, code) => {
    rpc.simulateTransaction.mockResolvedValue(
      simulationError(`HostError: Error(Contract, #${contractCode})`),
    );

    const error = (await makeEscrowClient({ transport: rpc })
      .releaseEscrow(7, ARBITER)
      .catch((e: unknown) => e)) as EscrowError;

    expect(error).toBeInstanceOf(EscrowError);
    expect(error.code).toBe(code);
    expect(error.contractCode).toBe(contractCode);
  });
});
