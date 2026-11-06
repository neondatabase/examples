import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Neon Realtime Todos",
  description:
    "A per-user todo list: server-rendered, live across tabs, with optimistic updates. Built on Neon's Managed Better Auth and Neon Realtime.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
