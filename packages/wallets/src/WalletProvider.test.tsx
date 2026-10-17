import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WalletProvider, useWallet } from './WalletProvider';
import * as freighter from '@stellar/freighter-api';
import albedo from '@albedo-link/intent';

// Mock Freighter API
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

// Mock Albedo API
vi.mock('@albedo-link/intent', () => ({
  default: {
    publicKey: vi.fn(),
    tx: vi.fn(),
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
  } = useWallet();

  return (
    <div>
      <div data-testid="address">{activeAddress || 'null'}</div>
      <div data-testid="provider">{activeProvider || 'null'}</div>
      <div data-testid="connected">{isConnected ? 'true' : 'false'}</div>
      <div data-testid="connecting">{isConnecting ? 'true' : 'false'}</div>
      <div data-testid="restoring">{isRestoring ? 'true' : 'false'}</div>
      <div data-testid="error">{error || 'null'}</div>
      <button onClick={() => connect('freighter')}>Connect Freighter</button>
      <button onClick={() => connect('albedo')}>Connect Albedo</button>
      <button onClick={() => connect('rabe')}>Connect Rabet</button>
      <button onClick={() => connect('hana')}>Connect Hana</button>
      <button onClick={disconnect}>Disconnect</button>
      <button onClick={() => signTransaction('mock-xdr')}>Sign</button>
    </div>
  );
}

describe('WalletProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Clear global window properties
    delete (window as Window & { rabet?: unknown }).rabet;
    delete (window as Window & { hanaWallet?: unknown }).hanaWallet;
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
});
