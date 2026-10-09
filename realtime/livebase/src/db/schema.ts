import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// The domain schema. Drizzle is the source of truth: `db:setup` pushes it with
// drizzle-kit. Every table carries `workspace_id` so that each live query is a
// single-table equality filter. Native column types decode in the browser to
// the `$inferSelect` types below.

export const leadStage = pgEnum("lead_stage", ["new", "contacted", "qualified", "won", "lost"]);
export const leadStatus = pgEnum("lead_status", ["extracting", "enriching", "ready", "failed"]);
export const writerKind = pgEnum("writer_kind", ["user", "agent"]);
export const subjectType = pgEnum("subject_type", ["company", "person", "lead"]);
export const inputKind = pgEnum("input_kind", ["email", "profile_url", "website", "name", "notes", "mixed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// The last writer of a row, which drives the agent/user highlight.
const lastWriter = {
  updatedBy: writerKind("updated_by").notNull().default("user"),
  updatedByTraceId: text("updated_by_trace_id"),
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain"),
  description: text("description"),
  industry: text("industry"),
  sizeBand: text("size_band"),
  location: text("location"),
  website: text("website"),
  logoUrl: text("logo_url"),
  foundedYear: integer("founded_year"),
  funding: text("funding"),
  ...lastWriter,
  ...timestamps,
}, (table) => [unique("companies_workspace_domain_key").on(table.workspaceId, table.domain)]);

export const people = pgTable("people", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  name: text("name"),
  email: text("email"),
  title: text("title"),
  seniority: text("seniority"),
  profileUrl: text("profile_url"),
  // Written only by enrichment, after an image check. Not user-editable.
  // `setup.ts` keeps it inline with the other synced columns.
  avatarUrl: text("avatar_url"),
  ...lastWriter,
  ...timestamps,
}, (table) => [unique("people_workspace_email_key").on(table.workspaceId, table.email)]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  stage: leadStage("stage").notNull().default("new"),
  status: leadStatus("status").notNull().default("extracting"),
  statusDetail: text("status_detail"),
  personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  value: integer("value"),
  // On a 0–1 scale, like `findings.confidence`.
  fitScore: real("fit_score"),
  summary: text("summary"),
  nextStep: text("next_step"),
  archived: boolean("archived").notNull().default(false),
  ...lastWriter,
  ...timestamps,
}, (table) => [index("leads_workspace_idx").on(table.workspaceId)]);

export const leadInputs = pgTable("lead_inputs", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  rawText: text("raw_text").notNull(),
  kind: inputKind("kind"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("lead_inputs_workspace_idx").on(table.workspaceId),
  // A lead has at most one input.
  uniqueIndex("lead_inputs_lead_idx").on(table.leadId),
]);

// One enrichment fact with its provenance. Not user-editable. `label` is one of
// `FINDING_LABELS` for the subject type, and `value` is canonical
// (`normalizeFindingValue` in `finding-mapping.ts`).
export const findings = pgTable("findings", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  subjectType: subjectType("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  sourceUrl: text("source_url"),
  confidence: real("confidence"),
  traceId: text("trace_id"),
  // True when this finding wrote the column its label names. The fill rule
  // treats a column as the agent's own only when it equals the latest filled
  // finding, so a finding that merely repeats a user's or extraction's value
  // doesn't make that value overwritable.
  filled: boolean("filled").notNull().default(false),
  // Persist sets it to `clock_timestamp()` after the locks are held, so the
  // order is the true write order (see `insertFinding`).
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("findings_workspace_idx").on(table.workspaceId),
  index("findings_lead_idx").on(table.leadId),
  // The latest-finding and dedup lookups run inside the locked transaction on
  // every recorded fact, so they mustn't scan the workspace.
  index("findings_subject_idx").on(table.subjectId, table.label),
]);

export const DOMAIN_TABLE_NAMES = [
  "workspaces",
  "users",
  "companies",
  "people",
  "leads",
  "lead_inputs",
  "findings",
] as const;

export type Workspace = typeof workspaces.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type LeadInput = typeof leadInputs.$inferSelect;
export type Finding = typeof findings.$inferSelect;

export type LeadStage = (typeof leadStage.enumValues)[number];
export type LeadStatus = (typeof leadStatus.enumValues)[number];
export type WriterKind = (typeof writerKind.enumValues)[number];
export type SubjectType = (typeof subjectType.enumValues)[number];
export type InputKind = (typeof inputKind.enumValues)[number];
