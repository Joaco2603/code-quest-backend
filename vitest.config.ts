import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.spec.ts', 'src/**/tests/**/*.spec.ts'],
    testTimeout: 30000,
  },
});
