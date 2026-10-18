import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `useStream` and friends are React hooks: they need a DOM and the timer
    // APIs that jsdom provides. `globals: true` also lets Testing Library
    // register its automatic cleanup between tests.
    environment: 'jsdom',
    globals: true,
  },
});
