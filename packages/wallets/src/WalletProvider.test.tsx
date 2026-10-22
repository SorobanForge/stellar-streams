import React, { useState } from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WalletProvider, useWallet } from './WalletProvider';
import * as freighter from '@stellar/freighter-api';
import albedo from '@albedo-link/intent';

// Mock Freighter API. The source imports the CommonJS package's default export,
// while these tests assert on the named ones, so both point at the same mocks.
vi.mock('@stellar/freighter-api', () => {
  const isConnected = vi.fn();
  const getAddress = vi.fn();
  const requestAccess = vi.fn();
  const signTransaction = vi.fn();
  const signAuthEntry = vi.fn();
  const api = { isConnected, getAddress, requestAccess, signTransaction, signAuthEntry };
  return { ...api, default: api };
});

// Mock Albedo API
vi.mock('@albedo-link/intent', () => ({
  default: {
    publicKey: vi.fn(),
    tx: vi.fn(),
  },
}));

// Ledger's device packages are imported dynamically by the adapter; mock them so
// the provider test never needs a device (or WebHID).
const ledgerMocks = vi.hoisted(() => {
  const close = vi.fn(async () => {});
  const create = vi.fn(async () => ({ close }));
  return { close, create };
});

vi.mock('@ledgerhq/hw-transport-webhid', () => ({ default: { create: ledgerMocks.create } }));
vi.mock('@ledgerhq/hw-app-str', () => ({
  default: class MockStellarApp {
    async getPublicKey() {
      return { rawPublicKey: new Uint8Array(32).fill(1) };
    }
  },
}));

// Helper component to access useWallet hooks in tests
function TestComponent() {
  const {
    activeAddress,
    activeProvider,
    isConnected,
    isConnecting,
    isRestoring,
    error,
    connect,
    disconnect,
    signTransaction,
    signAuthEntry,
  } = useWallet();
  const [signError, setSignError] = useState('none');
  const [signErrorName, setSignErrorName] = useState('none');
  const [authResult, setAuthResult] = useState('none');
  const [authError, setAuthError] = useState('none');

  return (
    <div>
      <div data-testid="address">{activeAddress || 'null'}</div>
      <div data-testid="provider">{activeProvider || 'null'}</div>
      <div data-testid="connected">{isConnected ? 'true' : 'false'}</div>
      <div data-testid="connecting">{isConnecting ? 'true' : 'false'}</div>
      <div data-testid="restoring">{isRestoring ? 'true' : 'false'}</div>
      <div data-testid="error">{error || 'null'}</div>
      <div data-testid="sign-error">{signError}</div>
      <div data-testid="sign-error-name">{signErrorName}</div>
      <div data-testid="auth-result">{authResult}</div>
      <div data-testid="auth-error">{authError}</div>
      <button onClick={() => connect('freighter').catch(() => {})}>Connect Freighter</button>
      <button onClick={() => connect('albedo').catch(() => {})}>Connect Albedo</button>
      <button onClick={() => connect('rabe').catch(() => {})}>Connect Rabet</button>
      <button onClick={() => connect('hana').catch(() => {})}>Connect Hana</button>
      <button onClick={() => connect('ledger').catch(() => {})}>Connect Ledger</button>
      <button onClick={disconnect}>Disconnect</button>
      <button
        onClick={() =>
          signTransaction('mock-xdr').catch((err: Error) => {
            setSignError(err.message);
            setSignErrorName(err.name);
          })
        }
      >
        Sign
      </button>
      <button
        onClick={() =>
          signAuthEntry('mock-entry-xdr').then(
            (signed) => setAuthResult(signed),
            (err: Error) => setAuthError(`${err.name}: ${err.message}`),
          )
        }
      >
        Sign Auth Entry
      </button>
    </div>
  );
}

describe('WalletProvider', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Clear global window properties
    delete (window as Window & { rabet?: unknown }).rabet;
    delete (window as Window & { hanaWallet?: unknown }).hanaWallet;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('should initialize with default disconnected state', () => {
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('provider').textContent).toBe('null');
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('restoring').textContent).toBe('false');
  });

  it('should not report a stored session as connected until verified', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    // While verification is pending the stored address must not be exposed.
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('restoring').textContent).toBe('true');
  });

  it('should auto-reconnect from localStorage after verifying the session', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: 'GA123...' });

    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });

    expect(screen.getByTestId('address').textContent).toBe('GA123...');
    expect(screen.getByTestId('provider').textContent).toBe('freighter');
    expect(screen.getByTestId('restoring').textContent).toBe('false');
  });

  it('should clear the stored session when the extension is missing', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: false });

    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('false');
    });

    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('provider').textContent).toBe('null');
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBeNull();
  });

  it('should not report connected when the wallet is unavailable', async () => {
    vi.mocked(freighter.isConnected).mockRejectedValue(new Error('network down'));

    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('false');
    });

    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('provider').textContent).toBe('null');
  });

  it('should invalidate a stored session whose address no longer matches', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: 'GB_DIFFERENT' });

    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('false');
    });

    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('provider').textContent).toBe('null');
    expect(localStorage.getItem('stellar_starter_kit_wallet_address')).toBeNull();
  });

  it('should connect to Freighter successfully', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });

    expect(screen.getByTestId('address').textContent).toBe('GB_FREIGHTER');
    expect(screen.getByTestId('provider').textContent).toBe('freighter');
    expect(screen.getByTestId('connected').textContent).toBe('true');
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBe('freighter');
    expect(localStorage.getItem('stellar_starter_kit_wallet_address')).toBe('GB_FREIGHTER');
  });

  it('should connect to Albedo successfully', async () => {
    vi.mocked(albedo.publicKey).mockResolvedValue({
      pubkey: 'GB_ALBEDO',
      signature: 'mock_signature',
      signed_message: 'mock_signed_message',
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Albedo').click();
    });

    expect(screen.getByTestId('address').textContent).toBe('GB_ALBEDO');
    expect(screen.getByTestId('provider').textContent).toBe('albedo');
    expect(screen.getByTestId('connected').textContent).toBe('true');
  });

  it('should connect to Rabet successfully', async () => {
    (window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
      sign: vi.fn(),
    };

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Rabet').click();
    });

    expect(screen.getByTestId('address').textContent).toBe('GB_RABET');
    expect(screen.getByTestId('provider').textContent).toBe('rabe');
    expect(screen.getByTestId('connected').textContent).toBe('true');
  });

  it('should connect to Hana successfully', async () => {
    (window as Window & { hanaWallet?: unknown }).hanaWallet = {
      send: vi.fn().mockResolvedValue({ publicKey: 'GB_HANA' }),
    };

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Hana').click();
    });

    expect(screen.getByTestId('address').textContent).toBe('GB_HANA');
    expect(screen.getByTestId('provider').textContent).toBe('hana');
    expect(screen.getByTestId('connected').textContent).toBe('true');
  });

  it('should connect to Ledger and release the transport on disconnect', async () => {
    Object.defineProperty(navigator, 'hid', { value: {}, configurable: true });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Ledger').click();
    });

    expect(screen.getByTestId('provider').textContent).toBe('ledger');
    expect(screen.getByTestId('address').textContent).toMatch(/^G[A-Z0-9]{55}$/);
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBe('ledger');

    await act(async () => {
      screen.getByText('Disconnect').click();
    });

    expect(ledgerMocks.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('connected').textContent).toBe('false');

    delete (navigator as Navigator & { hid?: unknown }).hid;
  });

  it('should surface a missing Freighter extension without persisting a session', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: false });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });

    expect(screen.getByTestId('error').textContent).toBe(
      'Freighter wallet extension is not installed or enabled.',
    );
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBeNull();
    expect(localStorage.getItem('stellar_starter_kit_wallet_address')).toBeNull();
  });

  it('should surface a missing Rabet extension', async () => {
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Rabet').click();
    });

    expect(screen.getByTestId('error').textContent).toBe(
      'Rabet wallet extension is not installed.',
    );
    expect(screen.getByTestId('connected').textContent).toBe('false');
  });

  it('should disconnect successfully', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: 'GA123...' });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });

    await act(async () => {
      screen.getByText('Disconnect').click();
    });

    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('provider').textContent).toBe('null');
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBeNull();
    expect(localStorage.getItem('stellar_starter_kit_wallet_address')).toBeNull();
  });

  it('should end the Rabet extension session on disconnect', async () => {
    const rabetDisconnect = vi.fn().mockResolvedValue(undefined);
    (window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
      sign: vi.fn(),
      disconnect: rabetDisconnect,
    };

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Rabet').click();
    });

    expect(screen.getByTestId('address').textContent).toBe('GB_RABET');

    await act(async () => {
      screen.getByText('Disconnect').click();
    });

    expect(rabetDisconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBeNull();
  });

  it('should clear both storage keys and the error state on disconnect', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockRejectedValue(new Error('Popup closed'));
    vi.mocked(freighter.getAddress).mockRejectedValue(new Error('Popup closed'));

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });

    expect(screen.getByTestId('error').textContent).toBe('Popup closed');
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    await act(async () => {
      screen.getByText('Disconnect').click();
    });

    expect(screen.getByTestId('error').textContent).toBe('null');
    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('provider').textContent).toBe('null');
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBeNull();
    expect(localStorage.getItem('stellar_starter_kit_wallet_address')).toBeNull();
  });

  it('should delegate signTransaction to active wallet provider', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    vi.mocked(freighter.signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-freighter-xdr',
      signerAddress: 'GB_FREIGHTER',
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });

    await act(async () => {
      screen.getByText('Sign').click();
    });

    expect(freighter.signTransaction).toHaveBeenCalledWith('mock-xdr', {
      networkPassphrase: 'Test SDF Network ; September 2015',
      address: 'GB_FREIGHTER',
    });
  });

  it('should surface a user rejection without logging a scary error', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    vi.mocked(freighter.signTransaction).mockRejectedValue(new Error('User rejected the request.'));

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });

    await act(async () => {
      screen.getByText('Sign').click();
    });

    expect(screen.getByTestId('sign-error').textContent).toBe('User rejected the request.');
    expect(warnSpy).toHaveBeenCalledWith(
      'transaction signing cancelled by user:',
      expect.any(Error),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should surface a Rabet rejection as a typed rejection error', async () => {
    (window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
      sign: vi.fn().mockRejectedValue({ error: 'User rejected the request.' }),
    };

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Rabet').click();
    });

    await act(async () => {
      screen.getByText('Sign').click();
    });

    expect(screen.getByTestId('sign-error-name').textContent).toBe('WalletRejectedError');
    expect(screen.getByTestId('sign-error').textContent).toBe('User rejected the request.');
    expect(warnSpy).toHaveBeenCalledWith(
      'transaction signing cancelled by user:',
      expect.any(Error),
    );
  });

  it('should surface a Rabet cancellation distinctly from a rejection', async () => {
    (window as Window & { rabet?: unknown }).rabet = {
      connect: vi.fn().mockResolvedValue({ publicKey: 'GB_RABET' }),
      sign: vi.fn().mockRejectedValue(new Error('Request cancelled by the user.')),
    };

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Rabet').click();
    });

    await act(async () => {
      screen.getByText('Sign').click();
    });

    expect(screen.getByTestId('sign-error-name').textContent).toBe('WalletCancelledError');
    expect(screen.getByTestId('sign-error').textContent).toBe('Request cancelled by the user.');
  });

  it('should delegate signAuthEntry to Freighter', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    vi.mocked(freighter.signAuthEntry).mockResolvedValue({
      signedAuthEntry: 'signed-auth-entry-xdr',
      signerAddress: 'GB_FREIGHTER',
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });

    await act(async () => {
      screen.getByText('Sign Auth Entry').click();
    });

    expect(screen.getByTestId('auth-result').textContent).toBe('signed-auth-entry-xdr');
    expect(freighter.signAuthEntry).toHaveBeenCalledWith('mock-entry-xdr', {
      networkPassphrase: 'Test SDF Network ; September 2015',
      address: 'GB_FREIGHTER',
    });
  });

  it('should throw NotSupportedError for wallets without auth-entry signing', async () => {
    vi.mocked(albedo.publicKey).mockResolvedValue({
      pubkey: 'GB_ALBEDO',
      signature: '',
      signed_message: '',
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Albedo').click();
    });

    await act(async () => {
      screen.getByText('Sign Auth Entry').click();
    });

    expect(screen.getByTestId('auth-error').textContent).toBe(
      'NotSupportedError: Albedo does not support signAuthEntry.',
    );
  });
});
