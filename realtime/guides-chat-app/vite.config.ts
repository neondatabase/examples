import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [tailwindcss(), react()],
    // The `@/` alias from tsconfig.client.json; the Better Auth UI components import through it.
    resolve: {
      alias: { "@": fileURLToPath(new URL("./frontend", import.meta.url)) },
    },
    // The browser's VITE_* copies of the URLs `neon env pull` writes.
    // Only these two are exposed; NEON_REALTIME_SECRET stays on the server.
    define: {
      "import.meta.env.VITE_NEON_AUTH_URL": JSON.stringify(
        env.NEON_AUTH_BASE_URL ?? "",
      ),
      "import.meta.env.VITE_NEON_REALTIME_URL": JSON.stringify(
        env.NEON_REALTIME_URL ?? "",
      ),
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": "http://127.0.0.1:3001",
      },
    },
  };
});
