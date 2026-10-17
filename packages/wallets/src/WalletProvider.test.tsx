import React from 'react';
import { render, act, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WalletProvider,
  useWallet,
  MAINNET_PASSPHRASE,
  TESTNET_PASSPHRASE,
  type WalletType,
} from './WalletProvider';
import * as freighter from '@stellar/freighter-api';
import albedo from '@albedo-link/intent';

// Mock Freighter API
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  getNetworkDetails: vi.fn(),
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

const XBULL_PUBLIC_KEY = 'GB_XBULL';

interface XBullSdkMock {
  getAddress: ReturnType<typeof vi.fn>;
  signTransaction: ReturnType<typeof vi.fn>;
  getNetwork?: ReturnType<typeof vi.fn>;
}

/**
 * Installs a fake `window.xBullSDK` — the API the xBull extension injects —
 * and returns it so the tests can assert on the calls.
 */
function installXBull(overrides: Partial<XBullSdkMock> = {}): XBullSdkMock {
  const sdk: XBullSdkMock = {
    getAddress: vi.fn().mockResolvedValue({ address: XBULL_PUBLIC_KEY }),
    signTransaction: vi.fn().mockResolvedValue({
      signedTxXdr: 'signed-xbull-xdr',
      signerAddress: XBULL_PUBLIC_KEY,
    }),
    ...overrides,
  };
  (window as unknown as { xBullSDK?: XBullSdkMock }).xBullSDK = sdk;
  return sdk;
}

// Helper component to access useWallet hooks in tests
function TestComponent() {
  const {
    activeAddress,
    activeProvider,
    isConnected,
    isConnecting,
    network,
    walletNetworkPassphrase,
    error,
    connect,
    disconnect,
    signTransaction,
    setNetwork,
  } = useWallet();

  const [signError, setSignError] = React.useState('none');

  // `connect` and `signTransaction` re-throw after recording their error; the
  // handlers swallow the rejection so tests assert on the rendered state.
  const attempt = (provider: WalletType) => {
    void connect(provider).catch(() => undefined);
  };
  const sign = () => {
    setSignError('none');
    void signTransaction('mock-xdr').catch((err) => {
      setSignError(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <div>
      <div data-testid="address">{activeAddress || 'null'}</div>
      <div data-testid="provider">{activeProvider || 'null'}</div>
      <div data-testid="connected">{isConnected ? 'true' : 'false'}</div>
      <div data-testid="connecting">{isConnecting ? 'true' : 'false'}</div>
      <div data-testid="network">{network}</div>
      <div data-testid="wallet-network">{walletNetworkPassphrase || 'unknown'}</div>
      <div data-testid="error">{error || 'null'}</div>
      <div data-testid="sign-error">{signError}</div>
      <button onClick={() => attempt('freighter')}>Connect Freighter</button>
      <button onClick={() => attempt('albedo')}>Connect Albedo</button>
      <button onClick={() => attempt('rabe')}>Connect Rabet</button>
      <button onClick={() => attempt('hana')}>Connect Hana</button>
      <button onClick={() => attempt('xbull')}>Connect xBull</button>
      <button onClick={() => setNetwork('MAINNET')}>Set Mainnet</button>
      <button onClick={disconnect}>Disconnect</button>
      <button onClick={sign}>Sign</button>
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
    delete (window as unknown as { xBullSDK?: XBullSdkMock }).xBullSDK;
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
    expect(screen.getByTestId('wallet-network').textContent).toBe('unknown');
  });

  it('should auto-reconnect from localStorage on mount', () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    expect(screen.getByTestId('address').textContent).toBe('GA123...');
    expect(screen.getByTestId('provider').textContent).toBe('freighter');
    expect(screen.getByTestId('connected').textContent).toBe('true');
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

  it('should connect to xBull successfully', async () => {
    const xbull = installXBull();

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect xBull').click();
    });

    expect(xbull.getAddress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('address').textContent).toBe(XBULL_PUBLIC_KEY);
    expect(screen.getByTestId('provider').textContent).toBe('xbull');
    expect(screen.getByTestId('connected').textContent).toBe('true');
    expect(localStorage.getItem('stellar_starter_kit_wallet_provider')).toBe('xbull');
  });

  it('should report a clear error when the xBull extension is missing', async () => {
    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect xBull').click();
    });

    expect(screen.getByTestId('error').textContent).toBe(
      'xBull wallet extension is not installed.',
    );
    expect(screen.getByTestId('connected').textContent).toBe('false');
  });

  it('should surface an xBull connect rejection', async () => {
    installXBull({
      getAddress: vi
        .fn()
        .mockResolvedValue({ error: { code: 1, message: 'Request rejected from the wallet' } }),
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect xBull').click();
    });

    expect(screen.getByTestId('error').textContent).toBe('Request rejected from the wallet');
    expect(screen.getByTestId('connected').textContent).toBe('false');
  });

  it('should sign an xBull transaction through the injected SDK', async () => {
    const xbull = installXBull();

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect xBull').click();
    });

    await act(async () => {
      screen.getByText('Sign').click();
    });

    expect(xbull.signTransaction).toHaveBeenCalledWith({
      xdr: 'mock-xdr',
      opts: { networkPassphrase: TESTNET_PASSPHRASE, address: XBULL_PUBLIC_KEY },
    });
    expect(screen.getByTestId('sign-error').textContent).toBe('none');
  });

  it('should disconnect successfully', async () => {
    localStorage.setItem('stellar_starter_kit_wallet_provider', 'freighter');
    localStorage.setItem('stellar_starter_kit_wallet_address', 'GA123...');

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    expect(screen.getByTestId('connected').textContent).toBe('true');

    await act(async () => {
      screen.getByText('Disconnect').click();
    });

    expect(screen.getByTestId('address').textContent).toBe('null');
    expect(screen.getByTestId('provider').textContent).toBe('null');
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('wallet-network').textContent).toBe('unknown');
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
      networkPassphrase: TESTNET_PASSPHRASE,
      address: 'GB_FREIGHTER',
    });
  });

  it('should sign when the wallet network matches the configured network', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValue({
      network: 'TESTNET',
      networkUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: TESTNET_PASSPHRASE,
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    });
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

    await waitFor(() =>
      expect(screen.getByTestId('wallet-network').textContent).toBe(TESTNET_PASSPHRASE),
    );

    await act(async () => {
      screen.getByText('Sign').click();
    });

    expect(screen.getByTestId('sign-error').textContent).toBe('none');
    expect(freighter.signTransaction).toHaveBeenCalledTimes(1);
  });

  it('should read the wallet network from the xBull SDK when available', async () => {
    installXBull({
      getNetwork: vi.fn().mockResolvedValue({
        network: 'PUBLIC',
        networkPassphrase: MAINNET_PASSPHRASE,
      }),
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect xBull').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('wallet-network').textContent).toBe(MAINNET_PASSPHRASE),
    );
  });

  it('should block signing and name both networks on a mismatch', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValue({
      network: 'PUBLIC',
      networkUrl: 'https://horizon.stellar.org',
      networkPassphrase: MAINNET_PASSPHRASE,
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('wallet-network').textContent).toBe(MAINNET_PASSPHRASE),
    );

    await act(async () => {
      screen.getByText('Sign').click();
    });

    const message = screen.getByTestId('sign-error').textContent ?? '';
    expect(message).toContain('Wallet network mismatch');
    expect(message).toContain(TESTNET_PASSPHRASE);
    expect(message).toContain(MAINNET_PASSPHRASE);
    expect(message).toContain("setNetwork('MAINNET')");
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });

  it('should fall back to getNetwork when Freighter has no getNetworkDetails', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    vi.mocked(freighter.getNetworkDetails).mockRejectedValue(new Error('not supported'));
    vi.mocked(freighter.getNetwork).mockResolvedValue({
      network: 'PUBLIC',
      networkPassphrase: MAINNET_PASSPHRASE,
    });

    render(
      <WalletProvider>
        <TestComponent />
      </WalletProvider>,
    );

    await act(async () => {
      screen.getByText('Connect Freighter').click();
    });

    await waitFor(() =>
      expect(screen.getByTestId('wallet-network').textContent).toBe(MAINNET_PASSPHRASE),
    );
  });

  it('should re-read the wallet network after setNetwork', async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: true });
    vi.mocked(freighter.requestAccess).mockResolvedValue({ address: 'GB_FREIGHTER' });
    vi.mocked(freighter.getNetworkDetails).mockResolvedValue({
      network: 'PUBLIC',
      networkUrl: 'https://horizon.stellar.org',
      networkPassphrase: MAINNET_PASSPHRASE,
    });
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
    await waitFor(() =>
      expect(screen.getByTestId('wallet-network').textContent).toBe(MAINNET_PASSPHRASE),
    );

    // App on Testnet, wallet on Mainnet: signing is blocked.
    await act(async () => {
      screen.getByText('Sign').click();
    });
    expect(screen.getByTestId('sign-error').textContent).toContain('Wallet network mismatch');

    await act(async () => {
      screen.getByText('Set Mainnet').click();
    });

    expect(screen.getByTestId('network').textContent).toBe('MAINNET');

    await act(async () => {
      screen.getByText('Sign').click();
    });

    expect(screen.getByTestId('sign-error').textContent).toBe('none');
    expect(freighter.signTransaction).toHaveBeenCalledWith('mock-xdr', {
      networkPassphrase: MAINNET_PASSPHRASE,
      address: 'GB_FREIGHTER',
    });
  });
});
