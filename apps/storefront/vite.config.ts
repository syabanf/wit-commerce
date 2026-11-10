import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command, isPreview }) => ({
  // Store hosts (lari.commerce.reddie.id) serve the build at the root: STOREFRONT_BASE=/. A single-host
  // deployment serves it under https://commerce.reddie.id/shop, so builds and previews default to /shop/.
  // Dev always serves at the root.
  base: command === 'build' || isPreview ? (process.env.STOREFRONT_BASE ?? '/shop/') : '/',
  plugins: [react(), tailwindcss()],
  server: {
    // http://lari.localhost:5375 opens the lari store the way lari.commerce.reddie.id does in production.
    allowedHosts: ['.localhost'],
    // Same-origin API calls from any store host, as nginx proxies /api/ in production (VITE_API_URL=/api).
    proxy: { '/api': 'http://localhost:8787' },
  },
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
