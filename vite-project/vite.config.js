import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // `host: true` binds to 0.0.0.0 so a phone on the same Wi-Fi can load the
    // app from http://<your-lan-ip>:5173. Without it Vite binds to localhost
    // only and the site is simply unreachable on a mobile device.
    host: true,
    // Vite 5.4+ rejects requests whose Host header is not allow-listed, which
    // breaks access via a LAN IP or a machine hostname. This is a local dev
    // server bound to the LAN, so allow the host header through.
    allowedHosts: true,
    port: 5173,
    // Fail fast instead of silently moving to 5174 - a phone bookmarked to
    // 5173 must not be served by a different origin.
    strictPort: true,
    proxy: {
      // Forward SMS calls to OUR OWN backend (server/index.js), which holds the
      // provider API key. The browser never talks to the provider directly and
      // never sees the key.
      '/api': {
        target: `http://127.0.0.1:${process.env.PORT || 8787}`,
        changeOrigin: true,
        // A phone on flaky mobile data needs the request to fail fast rather
        // than hang, so the UI can show a real message.
        timeout: 20000,
      },
    },
  },
  preview: {
    // `vite preview` serves the production build; it must also be reachable
    // from a phone for testing a real deployment.
    host: true,
    allowedHosts: true,
    port: 4173,
  },
})
