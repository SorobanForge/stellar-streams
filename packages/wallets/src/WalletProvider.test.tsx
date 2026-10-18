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
    isCheckingWallet,
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
      <div data-testid="checking">{isCheckingWallet ? 'true' : 'false'}</div>
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
  });

  it('re-authorizes a stored session and only then reports it as connected', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA_STORED');
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GA_GRANTED' });

    await act(async () => {
      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
    });

    // The address comes from the grant, not from localStorage.
    expect(screen.getByTestId('address').textContent).toBe('GA_GRANTED');
    expect(screen.getByTestId('provider').textContent).toBe('freighter');
    expect(screen.getByTestId('checking').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
    expect(localStorage.getItem('stellar_starter_kit_wallet_address')).toBe('GA_GRANTED');
  });

  it('reports a checking state while the stored wallet decides', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA_STORED');
    type Access = Awaited<ReturnType<typeof freighter.requestAccess>>;
    let grant: (value: Access) => void = () => {};
    const pending = new Promise<Access>((resolve) => {
      grant = resolve;
    });
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockImplementation(() => pending);

    await act(async () => {
      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
    });

    expect(screen.getByTestId('checking').textContent).toBe('true');
    expect(screen.getByTestId('connected').textContent).toBe('false');

    await act(async () => {
      grant({ address: 'GA_GRANTED' });
    });

    expect(screen.getByTestId('checking').textContent).toBe('false');
    expect(screen.getByTestId('connected').textContent).toBe('true');
  });

  it('stays disconnected without an error when access is denied', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA_STORED');
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockRejectedValue(new Error('User declined access'));
    vi.mocked(freighter.getAddress).mockRejectedValue(new Error('User declined access'));

    await act(async () => {
      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
    });

    expect(screen.getByTestId('checking').textContent).toBe('false');
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('error').textContent).toBe('null');
    expect(localStorage.getItem('stellar_starter_kit_wallet_address')).toBeNull();
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBeNull();
  });

  it('stays disconnected without an error when the wallet is unavailable', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA_STORED');
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: false });

    await act(async () => {
      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
    });

    expect(screen.getByTestId('checking').textContent).toBe('false');
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
    expect(freighter.requestAccess).not.toHaveBeenCalled();
  });

  it('stays disconnected without an error when the saved wallet rejects the request', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'albedo');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GB_ALBEDO');
    vi.mocked(albedo.publicKey).mockRejectedValue(new Error('User refused'));

    await act(async () => {
      render(
        <WalletProvider>
          <TestComponent />
        </WalletProvider>,
      );
    });

    expect(screen.getByTestId('checking').textContent).toBe('false');
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
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
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GA123...' });

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
