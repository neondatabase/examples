import postgres from "postgres";

export interface Env {
  HYPERDRIVE: Hyperdrive;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const sql = postgres(env.HYPERDRIVE.connectionString);
    try {
      const result = await sql`SELECT * from public."Comment"`
      return Response.json({ result });
    } catch (e) {
      console.error(e);
      return Response.json(
        { error: e instanceof Error ? e.message : e },
        { status: 500 }
      );
    }
  },
} satisfies ExportedHandler<Env>;
