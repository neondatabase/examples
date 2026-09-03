import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import '@dotenvx/dotenvx/config'
import { defineConfig } from 'vite'
import viteFont from 'vite-font'

export default defineConfig(() => {
  // Derive the browser-facing Neon URLs from the vars `neon env pull` writes
  // (NEON_AUTH_BASE_URL), so neither VITE_NEON_URL nor VITE_NEON_AUTH_URL has to
  // be set by hand. An explicit VITE_ value in the env still wins.
  const authUrl = process.env.NEON_AUTH_BASE_URL
  if (authUrl) {
    process.env.VITE_NEON_AUTH_URL = authUrl
    // Compute base = the auth URL without the `neonauth.` subdomain and the
    // trailing `/auth` (e.g. `.../neondb/auth` -> `.../neondb`).
    process.env.VITE_NEON_URL = authUrl.replace('.neonauth.', '.').replace(/\/auth$/, '')
  }
  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      tailwindcss(),
      viteFont({
        injectHtml: false,
        config: [
          {
            name: 'Google Sans',
            weight: ['400', '500', '700'],
            subsets: ['latin'],
            fetch: true,
            preload: true,
            display: 'swap',
            cssVariable: 'font-google-sans',
            fallback: 'sans-serif',
          },
        ],
      }),
      nitro(),
      tanstackStart({
        prerender: { enabled: true, crawlLinks: false },
        pages: [{ path: '/', prerender: { enabled: true } }],
      }),
      viteReact(),
    ],
  }
})
