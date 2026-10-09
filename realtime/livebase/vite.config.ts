import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: "src" }),
    react(),
    nitro(),
  ],
  // The browser connects to the Realtime URL from the Neon Console, so expose
  // that one variable alongside the usual `VITE_*` ones. Every other variable,
  // including `NEON_REALTIME_SECRET`, stays on the server.
  envPrefix: ["VITE_", "NEON_REALTIME_URL"],
  resolve: {
    tsconfigPaths: true,
  },
  // Start excludes its router packages from pre-bundling, so Vite finds
  // these imports of theirs only on the first page load, then re-optimizes
  // and reloads the page. Listing them pre-bundles them at startup.
  optimizeDeps: {
    include: [
      "@tanstack/router-core",
      "@tanstack/router-core/isServer",
      "@tanstack/router-core/ssr/client",
      "seroval",
    ],
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
