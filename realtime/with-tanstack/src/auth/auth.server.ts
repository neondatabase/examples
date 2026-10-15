import {
  createAuthServer,
  extractNeonAuthCookies,
} from "@neondatabase/auth/server";
import { getRequest, setCookie } from "@tanstack/react-start/server";

import { authCookieSecret, env } from "../env.server";

// The only importer of `@neondatabase/auth/server`: a small Managed Better Auth
// adapter for TanStack Start. Shared by the server functions and the
// `/api/auth` proxy.
export const authConfig = {
  baseUrl: env.auth.baseUrl,
  cookieSecret: authCookieSecret,
};

export const auth = createAuthServer({
  ...authConfig,
  // Called on every `auth.*` call, so `getRequest()` is the current request:
  // the document request during SSR, or the server function request.
  context: () => {
    const request = getRequest();
    return {
      getCookies: () => extractNeonAuthCookies(request.headers),
      // One call per cookie. `setResponseHeader` would replace earlier ones.
      setCookie: (name, value, options) => setCookie(name, value, options),
      getHeader: (name) => request.headers.get(name),
      getOrigin: () =>
        request.headers.get("origin") ?? new URL(request.url).origin,
      getFramework: () => "tanstack-start",
    };
  },
});
