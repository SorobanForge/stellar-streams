import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Only collect source tests; compiled copies in dist/ must not be picked up.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
