import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button, Card, Input, NumberInput, Spinner } from './primitives';
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
