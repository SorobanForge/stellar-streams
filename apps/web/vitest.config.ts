import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app's tsconfig uses `jsx: "preserve"` for Next.js, so tests need an
  // explicit JSX transform.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    globals: true,
    // Only collect source tests; compiled output must not be picked up.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
