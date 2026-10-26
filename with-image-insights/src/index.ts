import { attachDatabasePool } from "@neon/functions";
import pg from "pg";
import { type Context, handle } from "./app.ts";
import { createServices } from "./services.ts";

let context: Context | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    if (!context) {
      const bucket = process.env.IMAGES_BUCKET ?? "images";
      const model = process.env.IMAGE_MODEL || "claude-haiku-4-5";
      let services: Context["services"];
      try {
        // Neon supplies the Storage and AI Gateway credentials to the function.
        services = createServices(process.env, bucket, model);
      } catch {
        return Response.json(
          { error: { code: "storage_or_ai_gateway_unavailable" } },
          { status: 503 },
        );
      }
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 2,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
        application_name: "neon-image-insights",
      });
      attachDatabasePool(pool);
      context = { pool, services, apiKey: process.env.INSIGHTS_API_KEY ?? "", bucket, model };
    }
    return handle(request, context);
  },
};
