import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The seed JSON is one large chunk that only changes when the generator runs.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('/packages/fixtures/data/') ? 'seed' : undefined),
      },
    },
  },
})
