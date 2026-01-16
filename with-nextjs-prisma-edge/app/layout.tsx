import './globals.css'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Neon Postgres on Vercel Edge with Prisma ORM',
  description: 'Demo with Neon, Prisma, and Next.js App Router on the edge',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
