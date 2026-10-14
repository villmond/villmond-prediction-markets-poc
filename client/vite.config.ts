import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
      },
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "I bet U",
        short_name: "I bet U",
        description: "Zero-knowledge, closed-loop VILCOIN prediction markets",
        theme_color: "#0b0a14",
        background_color: "#0b0a14",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        // o1js (real on-chain zkApp calls, no server) is a large WASM-backed
        // dependency; its bundle exceeds workbox's 2 MiB default precache
        // limit. See DEPLOYMENT.md / README for the bundle-size tradeoff.
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
});
