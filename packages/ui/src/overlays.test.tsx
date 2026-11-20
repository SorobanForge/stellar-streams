import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Popover, Tooltip } from './overlays';

const ADDRESS = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

function tooltipBubble(trigger: HTMLElement) {
  const describedBy = trigger.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  const bubble = document.getElementById(describedBy as string);
  expect(bubble).not.toBeNull();
  return bubble as HTMLElement;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Tooltip', () => {
  it('is keyboard focusable and describes the trigger with the tooltip id', () => {
    render(<Tooltip content={ADDRESS}>CDLZ…GCYSC</Tooltip>);

    const trigger = screen.getByText('CDLZ…GCYSC');
    expect(trigger.getAttribute('tabindex')).toBe('0');

    const bubble = tooltipBubble(trigger);
    expect(bubble.getAttribute('role')).toBe('tooltip');
    expect(bubble.textContent).toBe(ADDRESS);
    expect(bubble.hasAttribute('hidden')).toBe(true);
  });

  it('reveals the full value on focus and hides it on blur', () => {
    render(<Tooltip content={ADDRESS}>CDLZ…GCYSC</Tooltip>);

    const trigger = screen.getByText('CDLZ…GCYSC');
    const bubble = tooltipBubble(trigger);

    act(() => trigger.focus());
    expect(bubble.hasAttribute('hidden')).toBe(false);
    expect(screen.getByRole('tooltip').textContent).toBe(ADDRESS);

    act(() => trigger.blur());
    expect(bubble.hasAttribute('hidden')).toBe(true);
  });

  it('reveals after the hover delay and clears the timer on leave', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Full value" delay={200}>
        Hover me
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me');
    const bubble = tooltipBubble(trigger);

    fireEvent.pointerEnter(trigger);
    expect(bubble.hasAttribute('hidden')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(bubble.hasAttribute('hidden')).toBe(false);

    fireEvent.pointerLeave(trigger);
    expect(bubble.hasAttribute('hidden')).toBe(true);
  });

  it('closes on Escape without leaving focus stranded', () => {
    render(<Tooltip content={ADDRESS}>CDLZ…GCYSC</Tooltip>);

    const trigger = screen.getByText('CDLZ…GCYSC');
    const bubble = tooltipBubble(trigger);

    act(() => trigger.focus());
    expect(bubble.hasAttribute('hidden')).toBe(false);

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(bubble.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('flips below and clamps horizontally when the anchor hugs an edge', () => {
    render(
      <Tooltip content="Full value" align="end">
        Trigger
      </Tooltip>,
    );

    const trigger = screen.getByText('Trigger');
    const bubble = tooltipBubble(trigger);
    const viewportWidth = window.innerWidth;

    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: viewportWidth - 10,
      y: 20,
      top: 20,
      left: viewportWidth - 10,
      right: viewportWidth,
      bottom: 40,
      width: 10,
      height: 20,
      toJSON: () => ({}),
    });
    Object.defineProperty(bubble, 'offsetWidth', { configurable: true, value: 200 });
    Object.defineProperty(bubble, 'offsetHeight', { configurable: true, value: 50 });

    act(() => trigger.focus());

    // No room above (top 20 - 50 - 8 < 8), so the bubble flips below the anchor.
    expect(bubble.style.top).toBe('48px');
    // An end-aligned bubble would overflow the right edge; clamp to the padding.
    expect(bubble.style.left).toBe(`${viewportWidth - 200 - 8}px`);
  });

  it('keeps the bubble out of the document flow', () => {
    render(<Tooltip content={ADDRESS}>CDLZ…GCYSC</Tooltip>);

    const trigger = screen.getByText('CDLZ…GCYSC');
    const bubble = tooltipBubble(trigger);

    // Portalled to the body, so the bubble can never grow the page's layout.
    expect(bubble.parentElement).toBe(document.body);
    expect(bubble.style.position).toBe('fixed');
    expect(bubble.className).toContain('pointer-events-none');
  });
});

describe('Popover', () => {
  function renderPopover(props: Partial<React.ComponentProps<typeof Popover>> = {}) {
    return render(
      <Popover label="Contract address" trigger="Details" {...props}>
        <p>{ADDRESS}</p>
      </Popover>,
    );
  }

  it('starts closed and toggles from the trigger', () => {
    renderPopover();

    const trigger = screen.getByRole('button', { name: 'Details' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog', { name: 'Contract address' })).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('dialog', { name: 'Contract address' });
    expect(panel.textContent).toContain(ADDRESS);
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(document.activeElement).toBe(panel);

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and restores focus to the trigger', () => {
    renderPopover();

    const trigger = screen.getByRole('button', { name: 'Details' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Contract address' })).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog', { name: 'Contract address' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on an outside pointer press but not on a press inside the panel', () => {
    renderPopover();

    const trigger = screen.getByRole('button', { name: 'Details' });
    fireEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Contract address' });

    fireEvent.pointerDown(panel);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('honours a controlled open state without owning it', () => {
    const onOpenChange = vi.fn();
    const { rerender } = renderPopover({ open: false, onOpenChange });

    const trigger = screen.getByRole('button', { name: 'Details' });
    fireEvent.click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog', { name: 'Contract address' })).toBeNull();

    rerender(
      <Popover label="Contract address" trigger="Details" open onOpenChange={onOpenChange}>
        <p>{ADDRESS}</p>
      </Popover>,
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Contract address' })).not.toBeNull();
  });

  it('portals the panel and keeps it fixed so revealing it causes no layout shift', () => {
    renderPopover();

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    const panel = screen.getByRole('dialog', { name: 'Contract address' });

    expect(panel.parentElement).toBe(document.body);
    expect(panel.style.position).toBe('fixed');
    expect(panel.className).toContain('max-w-[calc(100vw-1rem)]');
  });
});
