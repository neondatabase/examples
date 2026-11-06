import { defineConfig } from '@neon/config/v1'

/**
 * Neon infrastructure-as-code for Atlas.
 *
 * This declares the Neon services the app needs beyond Postgres (which ships
 * with every branch, so it isn't listed here). `neon deploy` provisions them on
 * the linked branch and pulls their env vars locally:
 *
 *   - Neon Auth      → NEON_AUTH_BASE_URL + NEON_AUTH_JWKS_URL (the JWT the
 *                      backend verifies every request against)
 *   - Object Storage → the `photos` bucket + the AWS_* S3 credentials
 *
 * Left out on purpose:
 *   - dataApi   — every read/write goes through a JWT-checked server function,
 *                 not the Data API (see src/lib/server, src/routes/api).
 *   - functions — the app itself deploys to Vercel, not Neon Functions.
 *   - aiGateway — CLIP and the caption model are self-hosted via transformers.js.
 *
 * See the README ("Setting up locally") for the full `neon link` / `neon deploy`
 * / `neon env pull` flow.
 */
export default defineConfig({
  auth: true,
  preview: {
    buckets: {
      // Private: the app serves objects through short-lived presigned URLs, so
      // the bucket never needs anonymous reads.
      photos: { access: 'private' },
    },
  },
})