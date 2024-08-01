import './globals.css'
import { cn } from '@/lib/utils'
import type { Metadata } from 'next'
import { Toaster } from '@/components/ui/toaster'
import { Inter as FontSans } from 'next/font/google'

const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Chatbot Playground',
  icons: { icon: [{ url: 'https://neon.tech/favicon/favicon.png' }] },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={cn('min-h-screen bg-background font-sans antialiased', fontSans.variable)}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
