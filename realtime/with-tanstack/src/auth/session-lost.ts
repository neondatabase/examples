// Browser only. A full page load drops the DbClient, the Realtime socket and
// any optimistic rows. Then `_authed` sends a signed-out visitor to sign-in,
// and a different user lands on their own list.
export function leaveSession() {
  window.location.assign("/");
}

// For server function calls. Always rethrows, so TanStack DB rolls the change
// back.
export function leaveIfSignedOut(error: unknown): never {
  if (String(error).includes("UNAUTHENTICATED")) leaveSession();
  throw error;
}
