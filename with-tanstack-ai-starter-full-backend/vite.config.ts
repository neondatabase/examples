import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import viteFont from 'vite-font'

export default defineConfig({
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
})
