import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command, isPreview }) => ({
  // Production serves the store under https://commerce.reddie.id/shop, so builds and previews default to
  // /shop/; STOREFRONT_BASE=/ builds and previews it at the root. Dev always serves at the root.
  base: command === 'build' || isPreview ? (process.env.STOREFRONT_BASE ?? '/shop/') : '/',
  plugins: [react(), tailwindcss()],
  build: {
    // The seed JSON is one chunk that only changes when the generator runs.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('/packages/fixtures/data/') ? 'seed' : undefined),
      },
    },
  },
}))
