import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import UiGallery from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/**
 * Rules that cannot be evaluated in jsdom, with the reason each exception is
 * unavoidable. Keep this list as small as possible and prefer fixing the
 * markup: anything not listed here fails the suite with its rule id and the
 * offending nodes.
 */
const ALLOWED_RULES: Readonly<Record<string, string>> = {
  'color-contrast':
    'jsdom has no layout engine or canvas, so axe cannot compute rendered text size and colors. Contrast on /ui is covered by visual review, not this sweep.',
};

/** Sections expected to be mounted, so the sweep can never pass on an empty tree. */
const GALLERY_SECTIONS = [
  'Buttons',
  'Form controls',
  'Badges & status chips',
  'Alerts',
  'Cards & surfaces',
  'Typography',
  'Formatted data',
] as const;

function axeOptions() {
  return {
    rules: Object.fromEntries(Object.keys(ALLOWED_RULES).map((rule) => [rule, { enabled: false }])),
  };
}

/**
 * Formats violations so a CI failure names the rule and every offending node
 * instead of only reporting a count.
 */
function describeViolations(violations: Awaited<ReturnType<typeof axe>>['violations']) {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `    target: ${node.target.join(' ')}\n    html: ${node.html}`)
        .join('\n    ---\n');

      return `[${violation.id}] ${violation.help} (impact: ${violation.impact ?? 'unknown'})\n${nodes}`;
    })
    .join('\n\n');
}

describe('UI gallery accessibility', () => {
  it('mounts every gallery section', () => {
    render(<UiGallery />);

    for (const title of GALLERY_SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeDefined();
    }
  });

  it('has no axe violations', async () => {
    const { container } = render(<UiGallery />);

    expect(screen.getByRole('main')).toBeDefined();

    const results = await axe(container, axeOptions());
    const details = describeViolations(results.violations);

    expect(results.violations.length, `Accessibility violations found:\n\n${details}`).toBe(0);
  });
});
