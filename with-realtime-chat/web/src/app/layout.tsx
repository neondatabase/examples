import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neon Realtime Chat",
  description: "A shared realtime chat on Neon Functions (WebSockets) + Neon Auth.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
