import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const fixtureDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'fixtures',
  'rpc',
);
const scenarios = [
  { id: 'health', method: 'getHealth', resultKeys: ['status', 'latestLedger'] },
  { id: 'network', method: 'getNetwork', resultKeys: ['passphrase', 'protocolVersion'] },
  { id: 'latest-ledger', method: 'getLatestLedger', resultKeys: ['sequence', 'closeTime'] },
] as const;

describe('recorded Soroban RPC fixtures', () => {
  for (const scenario of scenarios) {
    it(`replays the recorded ${scenario.id} response`, async () => {
      const fixture = JSON.parse(
        await readFile(resolve(fixtureDir, `${scenario.id}.json`), 'utf8'),
      ) as {
        schemaVersion: number;
        scenario: string;
        request: { method: string };
        response: { result: Record<string, unknown> };
      };
      expect(fixture.schemaVersion).toBe(1);
      expect(fixture.scenario).toBe(scenario.id);
      expect(fixture.request.method).toBe(scenario.method);
      for (const key of scenario.resultKeys) {
        expect(fixture.response.result).toHaveProperty(key);
      }
    });
  }
});
