import { describe, it, expect } from 'vitest';
import { NETWORKS, getNetworkConfig } from './networks';

describe('NETWORKS registry', () => {
  it('should define testnet configuration', () => {
    expect(NETWORKS.testnet).toBeDefined();
    expect(NETWORKS.testnet.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    expect(NETWORKS.testnet.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(NETWORKS.testnet.passphrase).toBe('Test SDF Network ; September 2015');
  });

  it('should define mainnet configuration', () => {
    expect(NETWORKS.mainnet).toBeDefined();
    expect(NETWORKS.mainnet.rpcUrl).toBe('https://soroban-rpc.stellar.org');
    expect(NETWORKS.mainnet.horizonUrl).toBe('https://horizon.stellar.org');
    expect(NETWORKS.mainnet.passphrase).toBe(
      'Public Global Stellar Network ; September 2015',
    );
  });

  it('should define local configuration', () => {
    expect(NETWORKS.local).toBeDefined();
    expect(NETWORKS.local.rpcUrl).toBe('http://localhost:8000');
    expect(NETWORKS.local.horizonUrl).toBe('http://localhost:8000');
    expect(NETWORKS.local.passphrase).toBe('Standalone Network ; February 2021');
  });

  it('should have all three networks as keys', () => {
    const keys = Object.keys(NETWORKS).sort();
    expect(keys).toEqual(['local', 'mainnet', 'testnet']);
  });
});

describe('getNetworkConfig', () => {
  it('should return testnet config', () => {
    const config = getNetworkConfig('testnet');
    expect(config).toBe(NETWORKS.testnet);
  });

  it('should return mainnet config', () => {
    const config = getNetworkConfig('mainnet');
    expect(config).toBe(NETWORKS.mainnet);
  });

  it('should return local config', () => {
    const config = getNetworkConfig('local');
    expect(config).toBe(NETWORKS.local);
  });

  it('should throw error for unknown network', () => {
    expect(() => {
      // @ts-expect-error - intentionally passing invalid network
      getNetworkConfig('unknown');
    }).toThrow(/Unknown network/);
  });

  it('should include network name in error message', () => {
    expect(() => {
      // @ts-expect-error - intentionally passing invalid network
      getNetworkConfig('production');
    }).toThrow(/production/);
  });
});
