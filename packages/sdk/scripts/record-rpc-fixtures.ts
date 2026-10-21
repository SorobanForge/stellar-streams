/**
 * Record public, read-only Soroban RPC responses for the SDK fixture suite.
 *
 * Covered scenarios (kept in sync with src/rpc-fixtures.test.ts):
 * - health: getHealth reports endpoint readiness and ledger retention.
 * - network: getNetwork reports the network passphrase and protocol version.
 * - latest-ledger: getLatestLedger reports the latest ledger envelope.
 *
 * Run with pnpm --filter @stellar-starter-kit/sdk fixtures:record.
 * Set SOROBAN_RPC_URL to record from another RPC endpoint. --check is used
 * in CI and fails when any covered fixture is missing or malformed.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Scenario = { id: string; method: string; description: string };
const scenarios: Scenario[] = [
  { id: 'health', method: 'getHealth', description: 'RPC health and ledger retention.' },
  { id: 'network', method: 'getNetwork', description: 'Network passphrase and protocol version.' },
  { id: 'latest-ledger', method: 'getLatestLedger', description: 'Latest ledger metadata.' },
];
const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'rpc',
);
const rpcUrl = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

async function checkFixtures(): Promise<void> {
  for (const scenario of scenarios) {
    const path = resolve(fixtureDir, `${scenario.id}.json`);
    let fixture: unknown;
    try {
      fixture = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw new Error(`Missing or invalid RPC fixture: ${scenario.id}.json`);
    }
    const value = fixture as {
      scenario?: unknown;
      request?: { method?: unknown };
      response?: object;
    };
    if (
      value.scenario !== scenario.id ||
      value.request?.method !== scenario.method ||
      !('result' in (value.response ?? {}))
    ) {
      throw new Error(`RPC fixture does not match scenario ${scenario.id}`);
    }
  }
  console.log(`Validated ${scenarios.length} recorded Soroban RPC fixtures.`);
}

async function recordFixtures(): Promise<void> {
  await mkdir(fixtureDir, { recursive: true });
  for (const scenario of scenarios) {
    const request = { jsonrpc: '2.0', id: scenario.id, method: scenario.method, params: {} };
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error(`${scenario.method} failed with HTTP ${response.status}`);
    const body = (await response.json()) as { result?: unknown; error?: unknown };
    if (body.error || body.result === undefined) {
      throw new Error(`${scenario.method} returned an RPC error: ${JSON.stringify(body.error)}`);
    }
    const fixture = {
      schemaVersion: 1,
      scenario: scenario.id,
      description: scenario.description,
      recordedAt: new Date().toISOString(),
      request,
      response: body,
    };
    await writeFile(
      resolve(fixtureDir, `${scenario.id}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
    console.log(`Recorded ${scenario.id}.json`);
  }
}

if (process.argv.includes('--check')) await checkFixtures();
else await recordFixtures();
