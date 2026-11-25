import { afterEach, describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { resolveContractId, resolveNetwork, resolveSecretKey } from './config.js';
import { assertSchedule, jsonReplacer, parseAmount, parseTimestamp } from './format.js';

describe('parseAmount', () => {
  it('keeps base units as a normalized string', () => {
    expect(parseAmount('0001250')).toBe('1250');
    expect(parseAmount('1_000_000')).toBe('1000000');
  });

  it('rejects decimals and zero', () => {
    expect(() => parseAmount('1.5')).toThrow(/whole number/);
    expect(() => parseAmount('0')).toThrow(/positive/);
  });
});

describe('parseTimestamp', () => {
  it('accepts unix seconds and ISO dates', () => {
    expect(parseTimestamp('1790000000')).toBe(1790000000);
    expect(parseTimestamp('2026-12-31T00:00:00Z')).toBe(1798675200);
  });

  it('rejects unparseable input', () => {
    expect(() => parseTimestamp('tomorrow')).toThrow(/ISO 8601/);
  });
});

describe('assertSchedule', () => {
  it('accepts a valid schedule and rejects inverted or out-of-range cliffs', () => {
    expect(() => assertSchedule(10, 20, 10)).not.toThrow();
    expect(() => assertSchedule(10, 10, 10)).toThrow(/end time/);
    expect(() => assertSchedule(10, 20, 21)).toThrow(/cliff/);
  });
});

describe('network and signing configuration', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('resolves networks from the shared constants', () => {
    expect(resolveNetwork('testnet').sorobanRpcUrl).toBe('https://soroban-testnet.stellar.org');
    expect(() => resolveNetwork('devnet')).toThrow(/Unknown network/);
  });

  it('reads the contract id from the environment and validates it', () => {
    process.env.STREAMS_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    expect(resolveContractId(undefined)).toMatch(/^C/);
    expect(() => resolveContractId('not-a-contract')).toThrow(/valid contract id/);
  });

  it('reads the secret key from the environment', () => {
    const secret = Keypair.random().secret();
    process.env.STREAMS_SECRET_KEY = secret;
    expect(resolveSecretKey(undefined)).toBe(secret);
    expect(() => resolveSecretKey('SINVALID')).toThrow(/secret seed/);
  });
});

describe('jsonReplacer', () => {
  it('serializes bigint values as decimal strings', () => {
    expect(JSON.stringify({ total: 10n }, jsonReplacer)).toBe('{"total":"10"}');
  });
});
