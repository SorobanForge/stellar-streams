import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Tests run directly from source without building workspace package dist files.
      '@stellar-starter-kit/types': fileURLToPath(
        new URL('../types/src/index.ts', import.meta.url),
      ),
      '@stellar-starter-kit/utils': fileURLToPath(
        new URL('../utils/src/index.ts', import.meta.url),
      ),
      // The shared testing package is consumed from source so `vitest run` works
      // without building it first; its `dist` is not produced by the test job.
      '@stellar-starter-kit/testing': fileURLToPath(
        new URL('../testing/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
