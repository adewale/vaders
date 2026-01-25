import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      // Mock Cloudflare-specific imports
      'cloudflare:workers': '/home/user/vaders/worker/src/mocks/cloudflare-workers.ts',
    },
  },
})
