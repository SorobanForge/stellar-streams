import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The Next.js tsconfig uses `"jsx": "preserve"`, so Vitest needs an explicit
  // transform for the component tests. The pure lib tests run in the node
  // environment; none of them touch the DOM.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
