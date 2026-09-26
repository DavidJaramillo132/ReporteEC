/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // View-only PWA (see PRODUCT.md): registers only in the production
      // build, never in `vite dev` -- leaving this off keeps dev's own hot
      // reload from ever fighting a cached service worker.
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ReporteEC',
        short_name: 'ReporteEC',
        description: 'Registro público de incidentes de seguridad en Ecuador.',
        lang: 'es-EC',
        theme_color: '#1d4a73',
        background_color: '#edf0ee',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Workbox's generateSW routes only ever match GET requests unless a
        // route explicitly opts into another method (none do below), so a
        // POST is never served from -- or written into -- any of these caches.
        runtimeCaching: [
          {
            // GET /api/*: short-timeout network-first, so a slow or offline
            // connection falls back to the last good response instead of
            // hanging (see App.tsx's `offline` state for the UI side of this).
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'reporteec-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Martin's own vector tiles (map_incidents / map_detentions /
            // map_cantons): re-validated in the background on every repeat
            // visit, since the underlying data changes with each ingestion run.
            urlPattern: ({ url }) => /\/(map_incidents|map_detentions|map_cantons)\//.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'reporteec-local-tiles',
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // OpenFreeMap's basemap tiles and glyphs: change far less often,
            // so a plain cache-first is a bigger offline win than revalidating.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'reporteec-basemap-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Self-hosted Archivo Variable font files (@fontsource-variable/archivo).
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'reporteec-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // MapLibre starts its worker as an ES module.
  worker: { format: 'es' },
  optimizeDeps: {
    // MapLibre 6 loads its worker relative to its own module URL; pre-bundling
    // moves the module and breaks that path in development.
    exclude: ['maplibre-gl'],
  },
  test: {
    // Pure-function unit tests only; no DOM needed.
    environment: 'node',
  },
})
