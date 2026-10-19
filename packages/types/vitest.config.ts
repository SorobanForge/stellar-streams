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
});
