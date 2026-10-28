import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // v0.13.0's UMD bundle throws when imported under Node; alias it to a
      // test-only stub. Runtime code still uses the real package.
      '@albedo-link/intent': fileURLToPath(new URL('./test/albedo.stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Only collect source tests; the compiled copies in dist/ would otherwise
    // be picked up by Vitest 4's narrower default excludes.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
