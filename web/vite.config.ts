import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Regenerate the gitignored buildInfo.ts files before any test loads.
    // Without this, a fresh clone (or CI running `npx vitest run` directly,
    // bypassing pretest hooks) would import-fail at test time.
    globalSetup: ['./vitest.global-setup.mjs'],
  },
})
