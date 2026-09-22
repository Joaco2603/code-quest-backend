import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
