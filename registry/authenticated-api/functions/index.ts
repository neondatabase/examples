import { Hono } from "hono";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { JwtVariables } from "hono/jwt";
import { createRemoteJWKSet, jwtVerify } from "jose";

const authUrl = process.env.NEON_AUTH_BASE_URL;
const jwksUrl = process.env.NEON_AUTH_JWKS_URL;

if (!authUrl || !jwksUrl) {
	throw new Error(
		"Managed Better Auth is not configured. Set auth: true in neon.ts or enable auth in the Neon dashboard."
	);
}

const issuer = new URL(authUrl).origin;
const jwks = createRemoteJWKSet(new URL(jwksUrl));
const app = new Hono<{ Variables: JwtVariables }>();

// Update CORS with your frontend's origin in production.
// app.use("*", cors({ origin: "https://example.com" }));
app.use("*", cors());

app.use("*", async (c, next) => {
	if (c.req.method !== "GET") {
		return c.json({ error: "Method not allowed" }, 405, { allow: "GET" });
	}
	await next();
});

app.get("/", (c) =>
	c.json({
		name: "Authenticated API with Hono and Managed Better Auth",
		protected: ["GET /me"],
	}),
);

const authMiddleware = createMiddleware<{ Variables: JwtVariables }>(
	async (c, next) => {
		const authorization = c.req.header("authorization");
		const token = authorization?.startsWith("Bearer ")
			? authorization.slice("Bearer ".length)
			: undefined;
		if (!token) {
			return c.json({ error: "Unauthorized" }, 401, {
				"www-authenticate": "Bearer",
			});
		}

		try {
			const { payload } = await jwtVerify(token, jwks, {
				issuer,
				audience: issuer,
				algorithms: ["EdDSA"],
			});
			c.set("jwtPayload", payload);
		} catch {
			return c.json({ error: "Unauthorized" }, 401, {
				"www-authenticate": "Bearer",
			});
		}

		await next();
	},
);

app.get("/me", authMiddleware, (c) => {
	const payload = c.get("jwtPayload");
	if (!payload.sub) {
		return c.json({ error: "Unauthorized" }, 401, {
			"www-authenticate": "Bearer",
		});
	}

	return c.json({
		user: {
			id: payload.sub,
			email: payload.email,
			name: payload.name,
		},
	});
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
