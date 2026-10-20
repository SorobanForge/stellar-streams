import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@stellar-starter-kit/utils': fileURLToPath(
        new URL('../utils/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Only collect source tests; the compiled copies in dist/ would otherwise
    // be picked up by Vitest 4's narrower default excludes.
    include: ['src/**/*.test.ts'],
  },
});
