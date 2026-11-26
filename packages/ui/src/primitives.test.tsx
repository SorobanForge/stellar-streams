import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  Alert,
  Button,
  Card,
  Modal,
  Input,
  NumberInput,
  ProgressBar,
  Skeleton,
  Spinner,
  StatusBadge,
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

describe('NumberInput', () => {
  it('sets inputMode decimal and a text input type', () => {
    render(<NumberInput label="Amount" />);
    const input = screen.getByRole('textbox', { name: 'Amount' });
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(input.getAttribute('type')).toBe('text');
  });

  it('keeps large raw strings unchanged instead of converting to a float', () => {
    const onValueChange = vi.fn();
    render(<NumberInput label="Amount" onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox', { name: 'Amount' });

    fireEvent.change(input, { target: { value: '123456789012345678901234567890' } });

    expect(onValueChange).toHaveBeenCalledWith('123456789012345678901234567890');
    expect((input as HTMLInputElement).value).toBe('123456789012345678901234567890');
  });

  it('accepts a value with exactly 7 decimal places', () => {
    const onValueChange = vi.fn();
    render(<NumberInput label="Amount" decimals={7} onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox', { name: 'Amount' });

    fireEvent.change(input, { target: { value: '1.1234567' } });

    expect(onValueChange).toHaveBeenCalledWith('1.1234567');
  });

  it('truncates an over-precise value to the token decimals', () => {
    const onValueChange = vi.fn();
    render(<NumberInput label="Amount" decimals={7} onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox', { name: 'Amount' });

    fireEvent.change(input, { target: { value: '1.123456789' } });

    expect(onValueChange).toHaveBeenCalledWith('1.1234567');
    expect((input as HTMLInputElement).value).toBe('1.1234567');
  });

  it('sanitises pasted text and rejects a second decimal separator', () => {
    const onValueChange = vi.fn();
    render(<NumberInput label="Amount" decimals={2} onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox', { name: 'Amount' });

    fireEvent.change(input, { target: { value: '  0012.3.4x ' } });

    expect(onValueChange).toHaveBeenCalledWith('12.34');
    expect((input as HTMLInputElement).value).toBe('12.34');
  });

  it('normalises leading zeros', () => {
    render(<NumberInput label="Amount" defaultValue="000" />);
    const input = screen.getByRole('textbox', { name: 'Amount' });

    expect((input as HTMLInputElement).value).toBe('0');

    fireEvent.change(input, { target: { value: '007' } });
    expect((input as HTMLInputElement).value).toBe('7');
  });
});

describe('Spinner', () => {
  it('is decorative and hidden from assistive technology by default', () => {
    render(<Spinner />);
    const spinner = document.querySelector('span');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    expect(spinner?.getAttribute('role')).toBeNull();
  });

  it('exposes a status role with the supplied label', () => {
    render(<Spinner label="Signing transaction" />);
    const spinner = screen.getByRole('status', { name: 'Signing transaction' });
    expect(spinner.getAttribute('aria-hidden')).toBeNull();
  });

  it('supports the size scale and inherits the current colour', () => {
    const { container } = render(
      <div>
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" />
      </div>,
    );
    const [sm, md, lg] = Array.from(container.querySelectorAll('span'));

    expect(sm.classList.contains('h-3')).toBe(true);
    expect(md.classList.contains('h-5')).toBe(true);
    expect(lg.classList.contains('h-8')).toBe(true);
    expect(sm.classList.contains('border-current')).toBe(true);
  });

  it('stops spinning when the user prefers reduced motion', () => {
    render(<Spinner />);
    expect(document.querySelector('span')?.classList.contains('motion-reduce:animate-none')).toBe(
      true,
    );
  });
});

describe('Card', () => {
  it('accepts a custom className', () => {
    render(<Card className="custom-card">Body</Card>);
    expect(screen.getByText('Body').classList.contains('custom-card')).toBe(true);
  });
});

describe('Modal', () => {
  it('labels the dialog, traps focus, handles Escape, and restores trigger focus', () => {
    function ModalHarness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          <Modal open={open} onOpenChange={setOpen} title="Review transaction">
            <button type="button">First action</button>
            <button type="button">Last action</button>
          </Modal>
        </>
      );
    }

    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Review transaction' });
    const firstAction = screen.getByRole('button', { name: 'First action' });
    const lastAction = screen.getByRole('button', { name: 'Last action' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(firstAction);

    fireEvent.keyDown(firstAction, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastAction);
    fireEvent.keyDown(lastAction, { key: 'Tab' });
    expect(document.activeElement).toBe(firstAction);

    fireEvent.keyDown(firstAction, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
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
