import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Real-runtime lane: runs runtime-test/** inside workerd (via Miniflare) with
// the real Durable Object bindings from wrangler.jsonc, instead of the
// hand-rolled `cloudflare:workers` mock that vitest.config.ts aliases in.
// Every behaviour the mock had to be taught (alarm min-merge via getAlarm,
// WebSocket auto-response, waitUntil, RPC stubs) is a candidate for a test
// here. See Lessons_learned.md §21-22.
export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    include: ['runtime-test/**/*.test.ts'],
  },
})
