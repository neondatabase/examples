import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Neon Realtime Todos",
  description:
    "A per-user todo list: server-rendered, live across tabs, with optimistic updates. Built on Neon Auth and Neon Realtime.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    // NeonAuthUIProvider wraps next-themes, whose pre-hydration script sets class and color-scheme on <html>
    // from the saved or system theme, which the server can't know. This suppresses <html>'s own attributes only.
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
