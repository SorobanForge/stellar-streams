import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn class merging utility', () => {
  it('should merge classes correctly', () => {
    expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white');
  });

  it('should override conflicting tailwind classes', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8');
  });

  it('should filter out falsy conditions', () => {
    const hidden = false;
    expect(cn('btn', hidden && 'hidden', 'visible')).toBe('btn visible');
  });
});
