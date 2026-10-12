import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // Production serves the store under https://commerce.reddie.id/shop, so every build defaults to /shop/;
  // STOREFRONT_BASE=/ builds it for the root. Dev always serves at the root.
  base: command === 'build' ? (process.env.STOREFRONT_BASE ?? '/shop/') : '/',
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
