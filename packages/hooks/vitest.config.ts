import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Only collect source tests; compiled copies in dist/ must not be picked up.
    include: ['src/**/*.test.{ts,tsx}'],
  },

  // Writes coverage/coverage-summary.json, which scripts/coverage-report.mjs merges
  // into the per-package coverage report posted on pull requests.
  coverage: {
    provider: 'v8',
    reporter: ['text-summary', 'json-summary'],
    reportsDirectory: './coverage',
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/**/generated/**'],
  },
});
