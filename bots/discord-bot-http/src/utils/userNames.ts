import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { commandUsage, profiles } from "../db/schema.js";

export type CommandUsageSummary = {
  commandName: string;
  runCount: number;
};

export const setStoredName = async (discordUserId: string, name: string): Promise<void> => {
  const db = getDb();

  await db
    .insert(profiles)
    .values({ userId: discordUserId, name })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        name,
        updatedAt: new Date(),
      },
    });
};

export const getStoredName = async (discordUserId: string): Promise<string | undefined> => {
  const db = getDb();
  const rows = await db
    .select({ name: profiles.name })
    .from(profiles)
    .where(eq(profiles.userId, discordUserId))
    .limit(1);

  return rows[0]?.name;
};

export const trackCommandRun = async (discordUserId: string, commandName: string): Promise<void> => {
  const db = getDb();

  await db
    .insert(commandUsage)
    .values({
      userId: discordUserId,
      commandName,
      runCount: 1,
      lastRunAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [commandUsage.userId, commandUsage.commandName],
      set: {
        runCount: sql`${commandUsage.runCount} + 1`,
        lastRunAt: new Date(),
      },
    });
};

export const getCommandUsage = async (discordUserId: string): Promise<CommandUsageSummary[]> => {
  const db = getDb();

  return db
    .select({
      commandName: commandUsage.commandName,
      runCount: commandUsage.runCount,
    })
    .from(commandUsage)
    .where(eq(commandUsage.userId, discordUserId));
};
