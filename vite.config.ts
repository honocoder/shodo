import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Shodo — Writing Studio",
        short_name: "Shodo",
        description: "A quiet, local-first studio for long-form fiction.",
        theme_color: "#f3efe7",
        background_color: "#f3efe7",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [],
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
});
