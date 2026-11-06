import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart({ srcDirectory: "src" }), react(), nitro()],
  server: { port: 3000, strictPort: true },
  optimizeDeps: {
    // These imports appear through Start's generated client entry. Discovering
    // them late can reload the page with two React dependency cache versions.
    include: [
      "@tanstack/router-core",
      "@tanstack/router-core/isServer",
      "@tanstack/router-core/ssr/client",
      "seroval",
    ],
  },
});
