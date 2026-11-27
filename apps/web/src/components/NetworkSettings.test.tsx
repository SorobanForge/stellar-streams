import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ParseResult } from '@stellar-starter-kit/config';
import { NetworkSettings } from './NetworkSettings';

const config: ParseResult = {
  success: true,
  errors: [],
  config: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    expertUrl: 'https://stellar.expert/explorer/testnet',
    streamContractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    splitsContractId: undefined,
    escrowContractId: undefined,
    tokenContractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  },
};

describe('NetworkSettings', () => {
  it('renders the network, endpoints, passphrase and contract ids', () => {
    const html = renderToStaticMarkup(<NetworkSettings result={config} />);

    expect(html).toContain('testnet');
    expect(html).toContain('https://soroban-testnet.stellar.org');
    expect(html).toContain('https://horizon-testnet.stellar.org');
    expect(html).toContain('Test SDF Network ; September 2015');
    expect(html).toContain('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');
    // Unset contracts are called out rather than rendered blank.
    expect(html).toContain('Not configured');
  });

  it('renders validation errors instead of silent defaults', () => {
    const invalid: ParseResult = {
      success: false,
      errors: [
        {
          field: 'NEXT_PUBLIC_STELLAR_NETWORK',
          message: 'Invalid network "moon". Must be one of: local, testnet, mainnet.',
          severity: 'error',
        },
      ],
    };

    const html = renderToStaticMarkup(<NetworkSettings result={invalid} />);

    expect(html).toContain('Environment validation failed');
    expect(html).toContain('NEXT_PUBLIC_STELLAR_NETWORK');
    expect(html).toContain('Invalid network');
  });

  it('never renders non-public environment values', () => {
    const html = renderToStaticMarkup(<NetworkSettings result={config} />);

    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('PRIVATE_KEY');
  });
});
