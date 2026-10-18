import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // The shared testing package is consumed from source so `vitest run` works
      // without building it first; its `dist` is not produced by the test job.
      '@stellar-starter-kit/testing': fileURLToPath(
        new URL('../testing/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
  },
});
