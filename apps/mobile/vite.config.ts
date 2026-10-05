import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Manifest colours are config values: ink for the status bar, the canvas behind the splash screen.
const INK = '#101112'
const CANVAS = '#f1f0f1'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Commerce OS Seller',
        short_name: 'Seller',
        description: 'Your personal store, your leads and customers, and the sales they bring in.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: INK,
        background_color: CANVAS,
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        navigateFallback: '/index.html',
        // The seed chunk is large, so leave room for a bigger dataset.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    // The seed JSON is one chunk that only changes when the generator runs, so an app update
    // leaves it in the service worker cache.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('/packages/fixtures/data/') ? 'seed' : undefined),
      },
    },
  },
})
