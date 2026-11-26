import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // Only collect source tests; the compiled copies in dist/ would otherwise
    // be picked up by Vitest 4's narrower default excludes.
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
