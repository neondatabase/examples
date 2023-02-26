import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Next.js + Prisma + Neon',
  description:
    'Next.js example app with Prisma as the ORM and Neon as the Postgres database',
};

type RouteLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RouteLayoutProps) {
  return (
    <html lang="en" className={inter.className}>
      <body>{children}</body>
    </html>
  );
}
