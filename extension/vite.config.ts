import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './src/manifest.json'

const isTest = process.env['VITEST'] === 'true' || process.env['NODE_ENV'] === 'test'

export default defineConfig({
  plugins: isTest ? [react()] : [react(), crx({ manifest })],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
