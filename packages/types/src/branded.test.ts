import { describe, expect, it } from 'vitest';
import { asAddress, asContractId, asStroops, isAddress, isContractId, isStroops } from './branded';

const ACCOUNT = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const CONTRACT = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

describe('asStroops', () => {
  it('brands bigint, safe integer, and decimal string amounts', () => {
    expect(asStroops(0n)).toBe(0n);
    expect(asStroops(10_000_000)).toBe(10_000_000n);
    expect(asStroops('10000000')).toBe(10_000_000n);
  });

  it('rejects negative amounts', () => {
    expect(() => asStroops(-1n)).toThrow(TypeError);
    expect(() => asStroops(-1)).toThrow(TypeError);
    expect(() => asStroops('-1')).toThrow(TypeError);
  });

  it('rejects fractional, unsafe, and non-numeric amounts', () => {
    expect(() => asStroops(1.5)).toThrow(TypeError);
    expect(() => asStroops(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
    expect(() => asStroops('1.5')).toThrow(TypeError);
    expect(() => asStroops('not-a-number')).toThrow(TypeError);
    expect(() => asStroops(undefined)).toThrow(TypeError);
  });
});

describe('asAddress', () => {
  it('brands a valid Stellar account address', () => {
    expect(asAddress(ACCOUNT)).toBe(ACCOUNT);
  });

  it('rejects malformed and non-account values', () => {
    expect(() => asAddress('')).toThrow(TypeError);
    expect(() => asAddress('not-an-address')).toThrow(TypeError);
    expect(() => asAddress(` ${ACCOUNT}`)).toThrow(TypeError);
    expect(() => asAddress(CONTRACT)).toThrow(TypeError);
    expect(() => asAddress(ACCOUNT.slice(0, -1))).toThrow(TypeError);
  });
});

describe('asContractId', () => {
  it('brands a valid Soroban contract id', () => {
    expect(asContractId(CONTRACT)).toBe(CONTRACT);
  });

  it('rejects malformed and non-contract values', () => {
    expect(() => asContractId('')).toThrow(TypeError);
    expect(() => asContractId('not-a-contract')).toThrow(TypeError);
    expect(() => asContractId(`${CONTRACT} `)).toThrow(TypeError);
    expect(() => asContractId(ACCOUNT)).toThrow(TypeError);
    expect(() => asContractId(CONTRACT.slice(0, -1))).toThrow(TypeError);
  });
});

describe('type guards', () => {
  it('accept branded values and reject invalid ones without throwing', () => {
    expect(isStroops(1n)).toBe(true);
    expect(isStroops(-1n)).toBe(false);
    expect(isAddress(ACCOUNT)).toBe(true);
    expect(isAddress(CONTRACT)).toBe(false);
    expect(isContractId(CONTRACT)).toBe(true);
    expect(isContractId(ACCOUNT)).toBe(false);
  });
});
