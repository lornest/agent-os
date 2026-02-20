import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Default test run: unit tests only (no Docker required).
    // E2E tests require NATS + Redis and run via: pnpm test:e2e
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**/*.test.ts'],
  },
});
