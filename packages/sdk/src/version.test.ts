import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { nativeToScVal } from '@stellar/stellar-sdk';
import { SUPPORTED_CONTRACT_VERSION, describeVersionMismatch } from './index.js';
import {
  CONTRACT_ID,
  fakeTransport,
  invokedCall,
  makeClient,
  makeEscrowClient,
  simulateByMethod,
} from './test-helpers';

/** `CONTRACT_VERSION` lives in Rust; this is the SDK's only copy of the number. */
const VERSION_CRATE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'contracts',
  'version',
  'src',
  'lib.rs',
);

/** Scripts a `version()` simulation to return `value`. */
function versionTransport(value: number) {
  const rpc = fakeTransport();
  rpc.simulateTransaction.mockImplementation(
    simulateByMethod({ version: nativeToScVal(value, { type: 'u32' }) }),
  );
  return rpc;
}

describe('reading the on-chain contract version', () => {
  let rpc: ReturnType<typeof fakeTransport>;

  beforeEach(() => {
    rpc = versionTransport(SUPPORTED_CONTRACT_VERSION);
  });

  it('StreamsClient.getVersion returns the u32 the contract reports', async () => {
    expect(await makeClient({ transport: rpc }).getVersion()).toBe(SUPPORTED_CONTRACT_VERSION);
  });

  it('EscrowClient.getVersion reads the same view from its own contract', async () => {
    expect(await makeEscrowClient({ transport: rpc }).getVersion()).toBe(
      SUPPORTED_CONTRACT_VERSION,
    );
  });

  it('simulates version() with no arguments on the configured contract', async () => {
    await makeClient({ transport: rpc }).getVersion();
    const tx = rpc.simulateTransaction.mock.calls[0]![0];
    expect(invokedCall(tx)).toEqual({ contractId: CONTRACT_ID, method: 'version' });
  });

  it('reports whatever version the deployment runs, not the constant', async () => {
    const newer = versionTransport(SUPPORTED_CONTRACT_VERSION + 2);
    expect(await makeClient({ transport: newer }).getVersion()).toBe(
      SUPPORTED_CONTRACT_VERSION + 2,
    );
  });
});

describe('describeVersionMismatch', () => {
  it('says nothing when the contract matches the SDK', () => {
    expect(describeVersionMismatch(SUPPORTED_CONTRACT_VERSION)).toBeNull();
  });

  it('names both versions when the contract is newer than the SDK', () => {
    const message = describeVersionMismatch(SUPPORTED_CONTRACT_VERSION + 1);
    expect(message).toContain(`interface version ${SUPPORTED_CONTRACT_VERSION + 1}`);
    expect(message).toContain(`built against (${SUPPORTED_CONTRACT_VERSION})`);
    expect(message).toContain('newer');
  });

  it('names both versions when the contract is older than the SDK', () => {
    const message = describeVersionMismatch(0, 3);
    expect(message).toContain('interface version 0');
    expect(message).toContain('built against (3)');
    expect(message).toContain('older');
  });

  it('turns a real read into a readable problem', async () => {
    const client = makeClient({ transport: versionTransport(SUPPORTED_CONTRACT_VERSION + 7) });
    const problem = describeVersionMismatch(await client.getVersion());
    expect(problem).toContain(`interface version ${SUPPORTED_CONTRACT_VERSION + 7}`);
  });
});

describe('the exported constant', () => {
  it('matches CONTRACT_VERSION in the version crate the contracts build against', async () => {
    const source = await readFile(VERSION_CRATE, 'utf8');
    const declared = /CONTRACT_VERSION:\s*u32\s*=\s*(\d+)/.exec(source);
    expect(declared, `no CONTRACT_VERSION found in ${VERSION_CRATE}`).not.toBeNull();
    expect(SUPPORTED_CONTRACT_VERSION).toBe(Number(declared![1]));
  });
});
