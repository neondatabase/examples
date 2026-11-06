import { createMiddleware, createServerFn } from "@tanstack/react-start";
import {
  setResponseHeader,
  setResponseStatus,
} from "@tanstack/react-start/server";
import { z } from "zod";

import { auth } from "./auth.server";

// Only what the UI needs. The root `beforeLoad` result is serialized into the HTML.
export type SessionUser = { id: string; email: string; name: string };

// Reads the session from the request's cookies. Signed out is `user: null`.
export const sessionMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { data, error } = await auth.getSession();
    // If Managed Better Auth can't be reached, treat the request as signed out.
    if (error) console.warn("[auth] getSession failed", error.code);
    const user: SessionUser | null = data?.user
      ? { id: data.user.id, email: data.user.email, name: data.user.name }
      : null;
    return next({ context: { user } });
  },
);

// The data boundary: every todo server function uses this, whatever the
// route guards do. The page sends the user id it was loaded for, so a session
// for another user (signed in from another tab) counts as signed out. The
// schema is loose, so the function's own fields reach its validator.
export const requireUser = createMiddleware({ type: "function" })
  .middleware([sessionMiddleware])
  .validator(z.looseObject({ userId: z.string() }))
  .server(({ next, context, data }) => {
    if (context.user?.id !== data.userId) {
      setResponseStatus(401);
      throw new Error("UNAUTHENTICATED");
    }
    return next({ context: { user: context.user } });
  });

// The one GET server function, so it sets its own Cache-Control.
export const getSessionUser = createServerFn({ method: "GET" })
  .middleware([sessionMiddleware])
  .handler(({ context }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return context.user;
  });
