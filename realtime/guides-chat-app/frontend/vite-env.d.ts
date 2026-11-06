// vite.config.ts defines these from the NEON_* values in .env.local
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEON_AUTH_URL: string;
  readonly VITE_NEON_REALTIME_URL: string;
}
