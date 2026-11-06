/**
 * The public demo account, hard-coded on purpose.
 *
 * Cloning this repo and running `npm run setup` creates this account, seeds the demo
 * library into it, and the "Try the demo account" button signs in with these exact
 * credentials, all with zero configuration. Both the setup script and the browser
 * button import from here, so there is a single source of truth and nothing to set in
 * `.env`.
 *
 * It is a throwaway, sandboxed account whose whole library is the seeded demo photos,
 * and these values are compiled into the client bundle by design. They are public, not
 * a secret. Keep the password free of quotes and spaces so it needs no shell escaping.
 */
export const DEMO_EMAIL = 'demo@atlas.app'
export const DEMO_PASSWORD = 'TryAtlasDemo2025'
