// From guides/queries.md "Exposing an endpoint"
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";

const authUrl = process.env.NEON_AUTH_BASE_URL!;
const origin = new URL(authUrl).origin;
const jwks = createRemoteJWKSet(new URL(`${authUrl}/.well-known/jwks.json`));

async function verifyUserId(token: string): Promise<string | undefined> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: origin,
      audience: origin,
    });

    return payload.sub;
  } catch {
    return undefined;
  }
}

export async function getUser(
  headers: Headers,
): Promise<{ id: string } | undefined> {
  const header = headers.get("Authorization");
  const token = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : undefined;
  const userId = token ? await verifyUserId(token) : undefined;

  return userId ? { id: userId } : undefined;
}

export async function requireUser(c: Context): Promise<{ id: string }> {
  const user = await getUser(c.req.raw.headers);

  if (!user) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }

  return user;
}
