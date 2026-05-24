import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'TukTrack',
        short_name: 'TukTrack',
        description: 'Gestão de Frotas Inteligente',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false, // disable sourcemaps in production APK
    // ✅ Do NOT set base to a URL — Capacitor requires relative asset paths
    // base: '/', is correct (default); never set base to http://localhost:xxxx
  },

  // ✅ server block is ONLY for local development; it does NOT affect the built APK.
  // Never import or reference server.url / server.hostname from here into capacitor.config.ts.
  server: {
    port: 5173,
    host: true,
  },

  // ✅ Ensures env variables with VITE_ prefix are embedded at build time.
  // Never use process.env.* in frontend code — use import.meta.env.VITE_* instead.
  envPrefix: 'VITE_',
}));
