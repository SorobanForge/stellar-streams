import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrKey } from 'stellar-sdk';
import type { EscrowClient } from '@stellar-starter-kit/sdk';
import { normalizeEscrowSchedule, type Escrow } from '@stellar-starter-kit/types';
import { ArbiterReleasePanel } from './ArbiterReleasePanel';

const RECIPIENT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const ARBITER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));
const OTHER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5));
const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 4));
const NOW = 1_700_000_000;

const escrow: Escrow = {
  id: '7',
  payer: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3)),
  payee: RECIPIENT,
  arbiter: ARBITER,
  token: TOKEN,
  amount: '1000000000',
  deadline: String(NOW + 86_400),
  status: 'funded',
};

const pendingSchedule = normalizeEscrowSchedule([400_000_000n, 600_000_000n], [false, false]);

function mockClient(overrides: Partial<EscrowClient> = {}): EscrowClient {
  return {
    getEscrow: vi.fn(async () => escrow),
    getMilestones: vi.fn(async () => pendingSchedule),
    getRemainingAmount: vi.fn(async () => 1_000_000_000n),
    releaseMilestone: vi.fn(async () => ({ hash: 'abc1234567890' })),
    ...overrides,
  } as unknown as EscrowClient;
}

function renderPanel(
  client = mockClient(),
  { activeAddress = ARBITER as string | null, now = NOW } = {},
) {
  return render(
    <ArbiterReleasePanel
      client={client}
      isConnected={activeAddress !== null}
      activeAddress={activeAddress}
      expertUrl="https://stellar.expert/explorer/testnet"
      initialEscrowId="7"
      nowSeconds={() => now}
    />,
  );
}

describe('ArbiterReleasePanel', () => {
  it('shows the live remaining, refundable and released amounts', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId('remaining-amount').textContent).toBe('100');
    });
    expect(screen.getByTestId('refundable-amount').textContent).toBe('100');
    expect(screen.getByText('Released')).toBeDefined();
  });

  it('requires an explicit confirmation before releasing a milestone', async () => {
    const client = mockClient();
    renderPanel(client);

    const first = await screen.findByText('#1');
    const row = first.closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /release/i }));

    expect(await screen.findByTestId('release-confirmation')).toBeDefined();
    expect(client.releaseMilestone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByTestId('release-confirmation')).toBeNull();
    expect(client.releaseMilestone).not.toHaveBeenCalled();
  });

  it('releases exactly the confirmed milestone as the arbiter', async () => {
    const client = mockClient();
    renderPanel(client);

    const row = (await screen.findByText('#1')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: /release/i }));
    fireEvent.click(await screen.findByRole('button', { name: /confirm release/i }));

    await waitFor(() => {
      expect(client.releaseMilestone).toHaveBeenCalledWith({
        id: '7',
        index: 0,
        caller: ARBITER,
      });
    });
    // The escrow is reloaded after a confirmed release, so the live totals
    // reflect the new contract state.
    expect(await screen.findByText(/milestone released/i)).toBeDefined();
    expect(client.getEscrow).toHaveBeenCalledTimes(2);
  });

  it('only makes the next pending milestone releasable', async () => {
    renderPanel();

    const firstRow = (await screen.findByText('#1')).closest('li')!;
    const secondRow = screen.getByText('#2').closest('li')!;
    expect(
      within(firstRow)
        .getByRole('button', { name: /release/i })
        .hasAttribute('disabled'),
    ).toBe(false);
    expect(
      within(secondRow)
        .getByRole('button', { name: /release/i })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('blocks release for a wallet that is not the arbiter', async () => {
    renderPanel(mockClient(), { activeAddress: OTHER });

    expect(
      await screen.findByText(/only the escrow arbiter can release milestones/i),
    ).toBeDefined();
    const row = screen.getByText('#1').closest('li')!;
    expect(
      within(row)
        .getByRole('button', { name: /release/i })
        .hasAttribute('disabled'),
    ).toBe(true);
  });

  it('blocks release after the deadline', async () => {
    renderPanel(mockClient(), { now: NOW + 86_400 + 1 });

    expect(await screen.findByText(/deadline has passed/i)).toBeDefined();
  });

  it('explains a malformed escrow id without calling the client', async () => {
    const client = mockClient();
    render(
      <ArbiterReleasePanel
        client={client}
        isConnected
        activeAddress={ARBITER}
        expertUrl="https://example.test"
        initialEscrowId=""
        nowSeconds={() => NOW}
      />,
    );

    fireEvent.change(screen.getByRole('spinbutton', { name: /escrow id/i }), {
      target: { value: '1e5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load escrow/i }));

    expect(await screen.findByText(/whole number/i)).toBeDefined();
    expect(client.getEscrow).not.toHaveBeenCalled();
  });

  it('reports a missing escrow', async () => {
    renderPanel(mockClient({ getEscrow: vi.fn(async () => null) as never }));

    expect(await screen.findByText(/no escrow found with id 7/i)).toBeDefined();
  });
});
