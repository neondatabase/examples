import { NeonAuthUIProvider } from '@neondatabase/auth-ui'
import { createRootRoute, HeadContent, Scripts, useRouter } from '@tanstack/react-router'
import { css as fontCss, preloads as fontPreloads } from 'virtual:vite-font'
import { authClient } from '@/lib/neon'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Atlas: Image Search on Neon' }],
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
