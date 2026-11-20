import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Alert,
  Button,
  Card,
  Input,
  ProgressBar,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type AlertTone,
} from './primitives';
import { cn } from './utils';

describe('cn', () => {
  it('merges conflicting classes and keeps the last value', () => {
    expect(cn('p-4', 'p-8', 'text-red-500', 'text-blue-500')).toBe('p-8 text-blue-500');
  });

  it('accepts custom className overrides', () => {
    expect(cn('rounded', 'custom-class')).toContain('custom-class');
  });
});

describe('Button', () => {
  it('supports custom className and click interaction', () => {
    const onClick = vi.fn();
    render(
      <Button className="custom-button" onClick={onClick}>
        Click me
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button.classList.contains('custom-button')).toBe(true);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Input', () => {
  it('renders label and error state', () => {
    render(<Input label="Recipient" aria-invalid error="Must be a valid address." />);

    const input = screen.getByRole('textbox', { name: 'Recipient' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Must be a valid address.').textContent).toBe(
      'Must be a valid address.',
    );
  });
});

describe('Card', () => {
  it('accepts a custom className', () => {
    render(<Card className="custom-card">Body</Card>);
    expect(screen.getByText('Body').classList.contains('custom-card')).toBe(true);
  });
});

describe('StatusBadge', () => {
  it.each([
    ['scheduled', 'Scheduled'],
    ['streaming', 'Streaming'],
    ['completed', 'Completed'],
    ['cancelled', 'Cancelled'],
    ['paused', 'Paused'],
  ] as const)('renders the %s status with its label', (status, label) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge.getAttribute('data-status')).toBe(status);
  });

  it('gives every known status a distinct colour recipe', () => {
    const statuses = ['scheduled', 'streaming', 'completed', 'cancelled', 'paused'] as const;
    const { container } = render(
      <>
        {statuses.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </>,
    );
    const colours = new Set(
      Array.from(container.querySelectorAll('span')).map((badge) => badge.className),
    );
    expect(colours.size).toBe(statuses.length);
  });

  it.each(['expired', 'constructor', 'toString'])('falls back for the %s status', (status) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText('Unknown');
    expect(badge.getAttribute('data-status')).toBe('unknown');
    expect(badge.className).toContain('text-slate-300');
  });

  it('accepts a custom className', () => {
    render(<StatusBadge status="streaming" className="custom-badge" />);
    expect(screen.getByText('Streaming').classList.contains('custom-badge')).toBe(true);
  });
});

describe('ProgressBar', () => {
  it.each([
    [0, '0'],
    [50, '50'],
    [100, '100'],
  ] as const)('renders %i as a determinate bar', (value, expected) => {
    render(<ProgressBar value={value} label="Vested" />);
    const bar = screen.getByRole('progressbar', { name: 'Vested' });
    expect(bar.getAttribute('aria-valuenow')).toBe(expected);
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe(`${expected}%`);
  });

  it('clamps values outside 0-100', () => {
    const { unmount } = render(<ProgressBar value={150} label="Over" />);
    expect(screen.getByRole('progressbar', { name: 'Over' }).getAttribute('aria-valuenow')).toBe(
      '100',
    );
    unmount();

    render(<ProgressBar value={-20} label="Under" />);
    const bar = screen.getByRole('progressbar', { name: 'Under' });
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('0%');
  });

  it('renders an indeterminate state for NaN', () => {
    render(<ProgressBar value={Number.NaN} label="Vested" />);
    const bar = screen.getByRole('progressbar', { name: 'Vested' });
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.getAttribute('aria-valuetext')).toBe('Indeterminate');
    expect(bar.hasAttribute('data-indeterminate')).toBe(true);
  });
});

describe('Skeleton', () => {
  it('renders a pulsing, reduced-motion-safe placeholder', () => {
    render(<Skeleton width={120} height="1rem" rounded="full" data-testid="skeleton" />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton.className).toContain('animate-pulse');
    expect(skeleton.className).toContain('motion-reduce:animate-none');
    expect(skeleton.className).toContain('rounded-full');
    expect(skeleton.style.width).toBe('120px');
    expect(skeleton.style.height).toBe('1rem');
  });
});

describe('Alert', () => {
  it.each([
    ['info', 'status'],
    ['success', 'status'],
    ['warning', 'status'],
    ['error', 'alert'],
  ] as const)('renders the %s tone with role=%s', (tone, role) => {
    render(
      <Alert tone={tone as AlertTone} title={`${tone} title`}>
        {tone} message
      </Alert>,
    );
    const alert = screen.getByRole(role);
    expect(alert.textContent).toContain(`${tone} title`);
    expect(alert.textContent).toContain(`${tone} message`);
    expect(alert.querySelector('svg')).not.toBeNull();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(
      <Alert tone="error" title="Transaction failed" onDismiss={onDismiss}>
        Try again.
      </Alert>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('omits the dismiss button when no handler is supplied', () => {
    render(<Alert tone="info">Nothing to dismiss.</Alert>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Tabs', () => {
  it('moves focus and selection with arrow keys, wrapping around enabled tabs', () => {
    render(
      <Tabs defaultValue="active">
        <TabsList aria-label="Stream status">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="paused" disabled>
            Paused
          </TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value="active">Active streams</TabsContent>
        <TabsContent value="paused">Paused streams</TabsContent>
        <TabsContent value="completed">Completed streams</TabsContent>
      </Tabs>,
    );

    const activeTab = screen.getByRole('tab', { name: 'Active' });
    const completedTab = screen.getByRole('tab', { name: 'Completed' });
    expect(activeTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toBe('Active streams');

    fireEvent.keyDown(activeTab, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(completedTab);
    expect(completedTab.getAttribute('aria-selected')).toBe('true');
    expect(activeTab.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tabpanel').textContent).toBe('Completed streams');

    fireEvent.keyDown(completedTab, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(activeTab);
    expect(activeTab.getAttribute('aria-selected')).toBe('true');
  });

  it('supports controlled selection and reports requested values', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Tabs value="active" onValueChange={onValueChange}>
        <TabsList aria-label="Stream status">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value="active">Active streams</TabsContent>
        <TabsContent value="completed">Completed streams</TabsContent>
      </Tabs>,
    );

    const completedTab = screen.getByRole('tab', { name: 'Completed' });
    fireEvent.focus(completedTab);
    fireEvent.click(completedTab);
    expect(onValueChange).toHaveBeenCalledWith('completed');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tabpanel').textContent).toBe('Active streams');

    rerender(
      <Tabs value="completed" onValueChange={onValueChange}>
        <TabsList aria-label="Stream status">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
        <TabsContent value="active">Active streams</TabsContent>
        <TabsContent value="completed">Completed streams</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel').textContent).toBe('Completed streams');
  });
});
