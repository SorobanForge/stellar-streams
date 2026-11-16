# Testing with Injected Transports

This guide explains how to unit-test applications and client workflows using `StreamsTransport` and `transportFactory`.

The SDK routes all network interactions through `StreamsTransport`. By injecting a fake transport into `StreamsClient`, test suites can exercise contract simulations, writes, reads, and multi-endpoint RPC failover without running a local Soroban node or connecting to a live network.

---

## The `StreamsTransport` Interface

A fake transport implements the `StreamsTransport` interface, defining the RPC methods the client invokes:

| Method                | Parameters                | Return Type                            | Description                                                                       |
| :-------------------- | :------------------------ | :------------------------------------- | :-------------------------------------------------------------------------------- |
| `getAccount`          | `(address: string)`       | `Promise<Account>`                     | Loads the account object and sequence number for building transactions.           |
| `simulateTransaction` | `(tx: Transaction)`       | `Promise<SimulateTransactionResponse>` | Returns resource consumption, auth entries, and simulated contract return values. |
| `prepareTransaction`  | `(tx: Transaction)`       | `Promise<Transaction>`                 | Assembles footprint, resource limits, and fees onto the transaction.              |
| `sendTransaction`     | `(tx: Transaction)`       | `Promise<SendTransactionResponse>`     | Submits the signed envelope to the network; returns status such as `PENDING`.     |
| `getTransaction`      | `(hash: string)`          | `Promise<GetTransactionResponse>`      | Polls transaction execution status (`SUCCESS`, `FAILED`, `NOT_FOUND`).            |
| `getLatestLedger`     | `()`                      | `Promise<GetLatestLedgerResponse>`     | Returns the latest ledger sequence and protocol version.                          |
| `getEvents`           | `(req: GetEventsRequest)` | `Promise<GetEventsResponse>`           | Returns contract events matching the requested topic filters.                     |

---

## Copy-Pasteable Fake Transport Example

The following example defines a fake transport using Vitest, configures a test `StreamsClient`, and exercises a simulated write without any network calls:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Account, Keypair, Transaction, xdr } from '@stellar/stellar-sdk';
import { StreamsClient, type StreamsTransport } from '@stellar-starter-kit/sdk';

class FakeTransport implements StreamsTransport {
  readonly getAccount = vi.fn(async (address: string) => {
    return new Account(address, '100');
  });

  readonly simulateTransaction = vi.fn(async (tx: Transaction) => {
    return {
      status: 'success',
      results: [{ auth: [], xdr: xdr.ScVal.scvVoid().toXDR('base64') }],
      cost: { cpuInsns: '1000', memBytes: '100' },
      minResourceFee: '100',
    } as any;
  });

  readonly prepareTransaction = vi.fn(async (tx: Transaction) => tx);

  readonly sendTransaction = vi.fn(async (tx: Transaction) => {
    return { status: 'PENDING', hash: 'tx-hash-12345' } as any;
  });

  readonly getTransaction = vi.fn(async (hash: string) => {
    return {
      status: 'SUCCESS',
      ledger: 1000,
      createdAt: Math.floor(Date.now() / 1000),
      resultMetaXdr: xdr.TransactionMeta.fromXDR('AAAAAA==', 'base64'),
    } as any;
  });

  readonly getLatestLedger = vi.fn(async () => ({
    id: 'ledger-hash',
    sequence: 1000,
    protocolVersion: '22',
  }));

  readonly getEvents = vi.fn(async () => ({
    latestLedger: 1000,
    events: [],
  }));
}

describe('Testing with FakeTransport', () => {
  it('executes client writes in-memory without a network', async () => {
    const fake = new FakeTransport();
    const testKeypair = Keypair.random();

    const client = new StreamsClient({
      contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      rpcUrl: 'https://soroban-mock.local',
      networkPassphrase: 'Test SDF Network ; September 2015',
      publicKey: testKeypair.publicKey(),
      signTransaction: async (envelopeXdr) => envelopeXdr,
      transportFactory: () => fake,
    });

    const result = await client.withdraw('1');
    expect(result.hash).toBe('tx-hash-12345');
    expect(fake.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(fake.sendTransaction).toHaveBeenCalledTimes(1);
    expect(fake.getTransaction).toHaveBeenCalledTimes(1);
  });
});
```

---

## Testing RPC Failover with `transportFactory`

When `rpcUrls` contains multiple endpoints, `StreamsClient` rotates to the next host when it encounters network errors (such as `ECONNREFUSED`, `ETIMEDOUT`, or HTTP 5xx). You can test this behavior deterministically by returning distinct transport fakes per endpoint:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Account } from '@stellar/stellar-sdk';
import { StreamsClient } from '@stellar-starter-kit/sdk';

describe('RPC Failover Testing', () => {
  it('switches to the secondary endpoint when the primary fails', async () => {
    const primary = new FakeTransport();
    const secondary = new FakeTransport();

    // Primary transport fails with a network connection error
    primary.getAccount.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), {
        code: 'ECONNREFUSED',
      }),
    );

    // Secondary transport succeeds
    secondary.getAccount.mockResolvedValue(
      new Account('GBJHG7V6W73G6J4Y73QZ6H66ZKV4HJZB7H6P6CXZ7W477O6ZKV4HJZB7', '200'),
    );

    const onFailover = vi.fn();

    const client = new StreamsClient({
      contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      rpcUrls: ['https://primary.rpc', 'https://secondary.rpc'],
      networkPassphrase: 'Test SDF Network ; September 2015',
      transportFactory: (url) => (url === 'https://primary.rpc' ? primary : secondary),
      onRpcFailover: onFailover,
    });

    // The client attempts primary, encounters connection failure, and falls back to secondary
    expect(client.activeRpcUrl).toBe('https://primary.rpc');

    // Subsequent successful request routes through the new healthy host
    expect(onFailover).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'https://primary.rpc',
        to: 'https://secondary.rpc',
      }),
    );
    expect(client.activeRpcUrl).toBe('https://secondary.rpc');
  });
});
```
