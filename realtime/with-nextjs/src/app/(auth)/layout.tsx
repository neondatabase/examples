import type { ReactNode } from "react";

import { Providers } from "@/auth/provider";

import "@/auth/auth-ui.css";

// The Managed Better Auth UI provider and styles, for the auth pages only. The todos page has its own sign-out.
export default function AuthLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <Providers>{children}</Providers>;
}
