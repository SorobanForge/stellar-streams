import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Stream } from '@stellar-starter-kit/types';
import { VestingChart } from './VestingChart';

const stream: Stream = {
  id: '42',
  sender: 'GSENDER',
  recipient: 'GRECIPIENT',
  token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  totalAmount: '1000000000',
  withdrawn: '0',
  startTime: 1_000,
  endTime: 2_000,
  cliffTime: 1_300,
  cancelled: false,
  label: '',
  reference: '',
};

describe('VestingChart', () => {
  it('renders a line chart from vestingCurve with cliff and current-time markers', () => {
    const { container } = render(<VestingChart stream={stream} now={1_500} />);

    const chart = screen.getByRole('img', { name: /vesting schedule for stream #42/i });
    expect(chart).toBeDefined();

    const line = container.querySelector('polyline');
    expect(line).not.toBeNull();
    expect(line!.getAttribute('points')!.split(' ').length).toBeGreaterThan(2);
    expect(line!.getAttribute('stroke')).toBe('#22d3ee');

    expect(screen.getByTestId('vesting-now-marker')).toBeDefined();
    expect(screen.getByText('Now')).toBeDefined();
    expect(screen.getByText('Cliff')).toBeDefined();
    expect(screen.getByText('Cliff marker')).toBeDefined();
  });

  it('marks a cancelled stream with a different stroke', () => {
    const { container } = render(
      <VestingChart stream={{ ...stream, cancelled: true }} now={1_500} />,
    );

    const line = container.querySelector('polyline');
    expect(line!.getAttribute('stroke')).toBe('#fb7185');
    expect(line!.getAttribute('stroke-dasharray')).toBe('5 4');
    expect(screen.getByText('Cancelled schedule')).toBeDefined();
    expect(container.querySelector('figure')!.getAttribute('data-cancelled')).toBe('true');
  });

  it('hides the cliff marker when the cliff is at the start', () => {
    render(<VestingChart stream={{ ...stream, cliffTime: stream.startTime }} now={1_500} />);

    expect(screen.queryByText('Cliff')).toBeNull();
  });

  it('renders the same curve across mounts', () => {
    const first = render(<VestingChart stream={stream} />);
    const firstPoints = first.container.querySelector('polyline')!.getAttribute('points');

    first.unmount();
    const second = render(<VestingChart stream={stream} />);
    const secondPoints = second.container.querySelector('polyline')!.getAttribute('points');

    expect(secondPoints).toBe(firstPoints);
  });
});
