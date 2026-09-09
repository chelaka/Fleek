import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

/**
 * The web build. Same renderer sources as the desktop app -- the only thing
 * that differs is which platform adapter `@/platform` picks at runtime, and
 * that is decided by whether the Electron preload bridge exists.
 *
 * Output is a plain static SPA, which is all Vercel needs.
 */
export default defineConfig({
  root: 'src/renderer',
  base: '/',
  plugins: [react()],
  // The SDK resolves its frame-metadata worker relative to import.meta.url.
  // Prebundling moves that URL into .vite/deps without copying the worker.
  optimizeDeps: {
    exclude: ['@decartai/sdk'],
    include: ['@decartai/sdk > p-retry', '@decartai/sdk > livekit-client']
  },
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  define: {
    __FLEEK_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    sourcemap: false
  },
  server: { port: 5174 }
})
