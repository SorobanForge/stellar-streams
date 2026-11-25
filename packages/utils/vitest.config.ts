import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only collect source tests; the compiled copies in dist/ would otherwise
    // be picked up by Vitest 4's narrower default excludes.
    include: ['src/**/*.test.ts'],
  },
});
