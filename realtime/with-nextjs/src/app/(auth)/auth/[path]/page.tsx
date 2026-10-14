// The Managed Better Auth sign-in pages. The code is in src/auth/auth-page.tsx.
export { default, generateStaticParams } from "@/auth/auth-page";

// Only the known auth views; anything else is a 404. Remove dynamicParams if you turn on cacheComponents.
// Segment config must be written here: Next.js ignores a re-exported one.
export const dynamicParams = false;
