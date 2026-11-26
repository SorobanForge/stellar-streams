import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrKey } from 'stellar-sdk';
import type { EscrowClient } from '@stellar-starter-kit/sdk';
import { MilestoneEscrowWizard } from './MilestoneEscrowWizard';

const RECIPIENT = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const ARBITER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));
const PAYER = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
const TOKEN = StrKey.encodeContract(Buffer.alloc(32, 4));
const NOW = 1_700_000_000;

function mockClient(overrides: Partial<EscrowClient> = {}): EscrowClient {
  return {
    createMilestoneEscrow: vi.fn(async () => ({ id: 9n, hash: 'abc123' })),
    ...overrides,
  } as unknown as EscrowClient;
}

function renderWizard(client = mockClient(), connected = true) {
  return {
    client,
    ...render(
      <MilestoneEscrowWizard
        client={client}
        tokenContractId={TOKEN}
        isConnected={connected}
        activeAddress={connected ? PAYER : null}
        nowSeconds={() => NOW}
      />,
    ),
  };
}

async function fillAgreement() {
  fireEvent.change(screen.getByRole('textbox', { name: /recipient/i }), {
    target: { value: RECIPIENT },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /arbiter/i }), {
    target: { value: ARBITER },
  });
}

async function goToMilestones() {
  await fillAgreement();
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  await screen.findByRole('spinbutton', { name: 'Milestone 1' });
}

describe('MilestoneEscrowWizard', () => {
  it('blocks the first step until the agreement details are valid', async () => {
    renderWizard();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/fix the highlighted agreement details/i)).toBeDefined();
    expect(screen.queryByRole('spinbutton', { name: 'Milestone 1' })).toBeNull();
  });

  it('shows live allocation while the milestones are entered', async () => {
    const { client } = renderWizard();
    await goToMilestones();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Milestone 1' }), {
      target: { value: '40' },
    });

    expect(screen.getByTestId('unallocated').textContent).toBe('60');

    fireEvent.click(screen.getByRole('button', { name: /split evenly/i }));
    expect(screen.getByTestId('unallocated').textContent).toBe('0');

    // A wrong sum cannot advance, and the wizard explains why.
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Milestone 2' }), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(
      (await screen.findAllByText(/must add up to the escrow amount/i)).length,
    ).toBeGreaterThan(0);
    expect(client.createMilestoneEscrow).not.toHaveBeenCalled();
  });

  it('reviews and submits the escrow with its milestone schedule', async () => {
    const client = mockClient();
    renderWizard(client);
    await goToMilestones();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Milestone 1' }), {
      target: { value: '40' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Milestone 2' }), {
      target: { value: '60' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const review = await screen.findByTestId('wizard-totals');
    expect(review.textContent).toContain('100');

    fireEvent.click(screen.getByRole('button', { name: /create escrow/i }));

    await waitFor(() => {
      expect(client.createMilestoneEscrow).toHaveBeenCalledTimes(1);
    });
    expect(client.createMilestoneEscrow).toHaveBeenCalledWith({
      payer: PAYER,
      payee: RECIPIENT,
      arbiter: ARBITER,
      token: TOKEN,
      amount: '1000000000',
      deadline: expect.any(String),
      milestoneAmounts: [400_000_000n, 600_000_000n],
    });

    expect(await screen.findByText(/escrow created/i)).toBeDefined();
    expect(screen.getByText(/#9/)).toBeDefined();
  });

  it('calls onCreated with the assigned id after both transactions confirm', async () => {
    const onCreated = vi.fn();
    const client = mockClient();
    render(
      <MilestoneEscrowWizard
        client={client}
        tokenContractId={TOKEN}
        isConnected
        activeAddress={PAYER}
        onCreated={onCreated}
        nowSeconds={() => NOW}
      />,
    );
    await goToMilestones();
    fireEvent.click(screen.getByRole('button', { name: /split evenly/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('button', { name: /create escrow/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ id: 9n, hash: 'abc123' });
    });
  });

  it('asks for a wallet before submitting', async () => {
    const client = mockClient();
    renderWizard(client, false);
    await goToMilestones();
    fireEvent.click(screen.getByRole('button', { name: /split evenly/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('button', { name: /create escrow/i }));

    expect(await screen.findByText(/connect a wallet to create the escrow/i)).toBeDefined();
    expect(client.createMilestoneEscrow).not.toHaveBeenCalled();
  });

  it('reports a failed create without losing the wizard state', async () => {
    const client = mockClient({
      createMilestoneEscrow: vi.fn(async () => {
        throw new Error('MilestoneScheduleInvalid');
      }) as unknown as EscrowClient['createMilestoneEscrow'],
    });
    renderWizard(client);
    await goToMilestones();
    fireEvent.click(screen.getByRole('button', { name: /split evenly/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    fireEvent.click(await screen.findByRole('button', { name: /create escrow/i }));

    expect(await screen.findByText('MilestoneScheduleInvalid')).toBeDefined();
    expect(screen.getByTestId('wizard-totals')).toBeDefined();
  });

  it('adds and removes milestone rows within the contract limits', async () => {
    renderWizard();
    await goToMilestones();

    fireEvent.click(screen.getByRole('button', { name: /add milestone/i }));
    expect(screen.getByRole('spinbutton', { name: 'Milestone 3' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Remove milestone 3' }));
    expect(screen.queryByRole('spinbutton', { name: 'Milestone 3' })).toBeNull();

    // Two rows is the contract's minimum, so removal is blocked there.
    expect(
      screen.getByRole('button', { name: 'Remove milestone 1' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
