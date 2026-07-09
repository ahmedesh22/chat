import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ─────────────────────────────────────────────────────────────────────────────
// Vite config for the Electron renderer process
//
// Key points:
//   - base: './'  → relative asset paths so Electron can load the built files
//   - target: 'electron-renderer' in build → enables Node.js built-ins if needed
//   - During dev: Vite serves on port 5173, Electron loads that URL
//   - During build: Vite outputs to dist/, Electron loads dist/index.html
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
