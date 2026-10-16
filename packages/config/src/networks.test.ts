import { describe, it, expect } from 'vitest';
import {
  KNOWN_NETWORKS,
  getNetworkByPassphrase,
  getNetworkByRpcUrl,
  getNetworkByHorizonUrl,
  isPassphraseForNetwork,
  isRpcUrlForNetwork,
  isHorizonUrlForNetwork,
} from './networks.js';

describe('networks', () => {
  describe('KNOWN_NETWORKS', () => {
    it('should have testnet configuration', () => {
      expect(KNOWN_NETWORKS.testnet).toEqual({
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
        networkPassphrase: 'Test SDF Network ; September 2015',
        expertUrl: 'https://stellar.expert/explorer/testnet',
      });
    });

    it('should have mainnet configuration', () => {
      expect(KNOWN_NETWORKS.mainnet).toEqual({
        network: 'mainnet',
        horizonUrl: 'https://horizon.stellar.org',
        sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        expertUrl: 'https://stellar.expert/explorer/public',
      });
    });

    it('should have local configuration', () => {
      expect(KNOWN_NETWORKS.local).toEqual({
        network: 'local',
        horizonUrl: 'http://localhost:8000',
        sorobanRpcUrl: 'http://localhost:8000/soroban/rpc',
        networkPassphrase: 'Standalone Network ; February 2017',
        expertUrl: 'http://localhost:3000',
      });
    });
  });

  describe('getNetworkByPassphrase', () => {
    it('should return testnet for testnet passphrase', () => {
      const network = getNetworkByPassphrase(
        'Test SDF Network ; September 2015'
      );
      expect(network).toBe('testnet');
    });

    it('should return mainnet for mainnet passphrase', () => {
      const network = getNetworkByPassphrase(
        'Public Global Stellar Network ; September 2015'
      );
      expect(network).toBe('mainnet');
    });

    it('should return local for local passphrase', () => {
      const network = getNetworkByPassphrase('Standalone Network ; February 2017');
      expect(network).toBe('local');
    });

    it('should return undefined for unknown passphrase', () => {
      const network = getNetworkByPassphrase('Unknown Network ; Unknown 0000');
      expect(network).toBeUndefined();
    });
  });

  describe('getNetworkByRpcUrl', () => {
    it('should return testnet for testnet RPC URL', () => {
      const network = getNetworkByRpcUrl('https://soroban-testnet.stellar.org');
      expect(network).toBe('testnet');
    });

    it('should return mainnet for mainnet RPC URL', () => {
      const network = getNetworkByRpcUrl(
        'https://soroban-mainnet.stellar.org'
      );
      expect(network).toBe('mainnet');
    });

    it('should return local for local RPC URL', () => {
      const network = getNetworkByRpcUrl('http://localhost:8000/soroban/rpc');
      expect(network).toBe('local');
    });

    it('should return undefined for unknown RPC URL', () => {
      const network = getNetworkByRpcUrl('https://unknown-rpc.example.com');
      expect(network).toBeUndefined();
    });
  });

  describe('getNetworkByHorizonUrl', () => {
    it('should return testnet for testnet Horizon URL', () => {
      const network = getNetworkByHorizonUrl(
        'https://horizon-testnet.stellar.org'
      );
      expect(network).toBe('testnet');
    });

    it('should return mainnet for mainnet Horizon URL', () => {
      const network = getNetworkByHorizonUrl('https://horizon.stellar.org');
      expect(network).toBe('mainnet');
    });

    it('should return local for local Horizon URL', () => {
      const network = getNetworkByHorizonUrl('http://localhost:8000');
      expect(network).toBe('local');
    });

    it('should return undefined for unknown Horizon URL', () => {
      const network = getNetworkByHorizonUrl('https://unknown-horizon.example.com');
      expect(network).toBeUndefined();
    });
  });

  describe('isPassphraseForNetwork', () => {
    it('should return true for matching passphrase and network', () => {
      const isMatch = isPassphraseForNetwork(
        'Test SDF Network ; September 2015',
        'testnet'
      );
      expect(isMatch).toBe(true);
    });

    it('should return false for mismatched passphrase and network', () => {
      const isMatch = isPassphraseForNetwork(
        'Public Global Stellar Network ; September 2015',
        'testnet'
      );
      expect(isMatch).toBe(false);
    });
  });

  describe('isRpcUrlForNetwork', () => {
    it('should return true for matching RPC URL and network', () => {
      const isMatch = isRpcUrlForNetwork(
        'https://soroban-testnet.stellar.org',
        'testnet'
      );
      expect(isMatch).toBe(true);
    });

    it('should return false for mismatched RPC URL and network', () => {
      const isMatch = isRpcUrlForNetwork(
        'https://soroban-mainnet.stellar.org',
        'testnet'
      );
      expect(isMatch).toBe(false);
    });
  });

  describe('isHorizonUrlForNetwork', () => {
    it('should return true for matching Horizon URL and network', () => {
      const isMatch = isHorizonUrlForNetwork(
        'https://horizon-testnet.stellar.org',
        'testnet'
      );
      expect(isMatch).toBe(true);
    });

    it('should return false for mismatched Horizon URL and network', () => {
      const isMatch = isHorizonUrlForNetwork(
        'https://horizon.stellar.org',
        'testnet'
      );
      expect(isMatch).toBe(false);
    });
  });
});
