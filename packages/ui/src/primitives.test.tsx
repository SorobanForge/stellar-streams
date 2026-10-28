import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button, Card, Input } from './primitives';
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
