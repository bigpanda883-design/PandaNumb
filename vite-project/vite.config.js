import react from "@vitejs/plugin-react";
import process from "node:process";
import { defineConfig } from "vite";

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
      "/api": {
        target: `http://127.0.0.1:${process.env.PORT || 8787}`,
        changeOrigin: true,
        // The price catalogue is ~8.6 MB and the very first request has to be
        // fetched from upstream, which takes ~50s. A 20s cutoff aborted that
        // request before it could be served, and a browser fetch() that is
        // cut off rejects as a "network" error - the Buy page then showed
        // "Could not reach the price catalogue" even though the API was up.
        // Keep this below the client's 30s budget so the client always gets a
        // real HTTP status instead of a silent socket close.
        // NOTE: also `proxyTimeout` - Vite/http-proxy applies that to the
        // upstream socket, and a static-file route must wait for the full body.
        timeout: 25000,
        proxyTimeout: 25000,
      },
    },
  },
  preview: {
    // `vite preview` serves the production build; it must also be reachable
    // from a phone for testing a real deployment.
    host: true,
    allowedHosts: true,
    port: 4173,
    // A preview of the build must talk to a REAL backend, exactly like the dev
    // server does. Without this, `/api/...` was answered by the preview's
    // static handler, which is the same "no API" failure the deployed site
    // hits. Nothing else changes: the built bundle still carries the API URL
    // from .env.production.
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.PORT || 8787}`,
        changeOrigin: true,
        timeout: 25000,
        proxyTimeout: 25000,
      },
    },
  },
});
