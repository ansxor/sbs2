import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static assets (icons, fonts, markup2 scripts/styles, reused CSS) live under app/public/ and are
// served normally by Vite; no fs.allow override is needed.
export default defineConfig({
  root: __dirname,
  base: './', // relative base = BASE_URL parity (new URL("./", location))
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0, // do not inline; keep asset URLs stable
  },
})
