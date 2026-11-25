import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Tests run directly from source without building workspace package dist files.
      '@stellar-starter-kit/utils': fileURLToPath(
        new URL('../../packages/utils/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/ui': fileURLToPath(
        new URL('../../packages/ui/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/wallets': fileURLToPath(
        new URL('../../packages/wallets/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/sdk': fileURLToPath(
        new URL('../../packages/sdk/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/hooks': fileURLToPath(
        new URL('../../packages/hooks/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/types': fileURLToPath(
        new URL('../../packages/types/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/config': fileURLToPath(
        new URL('../../packages/config/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
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
