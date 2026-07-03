import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Vite root is app/; the reused CSS / markup2 / resource assets live OUTSIDE this
// root in the untouched old tree, so fs.allow is widened to the repo root and they
// are referenced by absolute /@fs hrefs from index.html (see ARCHITECTURE §1.5).
const rootDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  root: rootDir,
  base: './', // relative base = BASE_URL parity (new URL("./", location))
  plugins: [react()],
  server: {
    fs: { allow: [repoRoot] }, // allow importing ../src/*.css, ../markup2, ../resource
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0, // do not inline; keep asset URLs stable
  },
})
