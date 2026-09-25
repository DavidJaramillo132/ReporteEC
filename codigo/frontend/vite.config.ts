import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MapLibre starts its worker as an ES module.
  worker: { format: 'es' },
  optimizeDeps: {
    // MapLibre 6 loads its worker relative to its own module URL; pre-bundling
    // moves the module and breaks that path in development.
    exclude: ['maplibre-gl'],
  },
})
