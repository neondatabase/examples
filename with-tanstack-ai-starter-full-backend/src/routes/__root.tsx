import { NeonAuthUIProvider } from '@neondatabase/auth-ui'
import { createRootRoute, HeadContent, Scripts, useRouter } from '@tanstack/react-router'
import { css as fontCss, preloads as fontPreloads } from 'virtual:vite-font'
import { authClient } from '@/lib/neon'
import appCss from '../styles.css?url'

const SITE_URL = 'https://with-tanstack-ai-starter-full-backend.vercel.app'
const OG_IMAGE = `${SITE_URL}/og.jpg` // served from public/og.jpg, absolute URL so previews resolve it
const TITLE = 'Atlas: search your photos by meaning and by face'
const DESCRIPTION = 'A private photo library you search by meaning and by face. Built on the Neon backend platform and hosted on Vercel.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Atlas: Image Search on Neon' },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: OG_IMAGE },
    ],
    links: [...fontPreloads.map((p) => ({ rel: 'preload', as: 'font', type: p.type, href: p.href, crossOrigin: 'anonymous' as const })), { rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  return (
    <NeonAuthUIProvider authClient={authClient} navigate={(to: string) => router.navigate({ to })} replace={(to: string) => router.navigate({ to, replace: true })} redirectTo="/">
      {children}
    </NeonAuthUIProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* @font-face rules + metric-matched fallbacks from vite-font */}
        <style dangerouslySetInnerHTML={{ __html: fontCss }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}
