import { and, eq } from "drizzle-orm";

import { leads } from "~/db/schema";
import { UserError } from "~/functions/validation";
import { DEMO_USER_ID, DEMO_WORKSPACE_ID, DEMO_WORKSPACE_NAME } from "~/lib/constants";

import { db } from "./db.server";

// The single seam where authentication will plug in later: Neon Auth or Better
// Auth will resolve the session's workspace here. Until then there's no
// sign-in, so every caller gets the seeded demo workspace. Server
// functions take the workspace ID only from here, so adding auth changes
// neither the data model nor the queries.
export async function requireWorkspace(): Promise<{ workspaceId: string; workspaceName: string; userId: string }> {
  return {
    workspaceId: DEMO_WORKSPACE_ID,
    workspaceName: DEMO_WORKSPACE_NAME,
    userId: DEMO_USER_ID,
  };
}

// Throws if the lead isn't in the workspace. Call it before acting on a lead ID
// that came from the browser, so that a lead in another workspace is
// indistinguishable from one that doesn't exist. A `UserError`, so the message
// reaches the UI.
export async function assertLeadInWorkspace(leadId: string, workspaceId: string): Promise<void> {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, workspaceId)));
  if (!row) throw new UserError("Lead not found");
}
