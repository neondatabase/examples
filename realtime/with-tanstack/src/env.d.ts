/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Set in `.env.local` as `VITE_NEON_REALTIME_URL=$NEON_REALTIME_URL`.
  // Vite inlines it into both the browser and the server build.
  readonly VITE_NEON_REALTIME_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
