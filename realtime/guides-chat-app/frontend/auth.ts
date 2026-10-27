// From guides/subscribing.md "Fetch from an API endpoint"
import { createAuthClient } from "@neon/auth";

export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL);
