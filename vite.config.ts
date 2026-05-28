import { defineConfig } from 'vite'

// Keep the MVP deliberately simple: Vite's esbuild transform handles TSX.
// Avoid React Fast Refresh injection in this environment, which can fail when
// the refresh preamble is not initialized by the browser harness.
export default defineConfig({
  base: '/',
})
