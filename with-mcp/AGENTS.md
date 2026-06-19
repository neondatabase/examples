## Neon

By default, when using the Neon CLI, always use the project `[PROJECT NAME]` (id: `[PROJECT ID]`).

## Mandatory Feature Workflow

For any feature, bug fix, or investigation that may touch app code using the database:

1. Before editing application code, create a git feature branch.
2. Before querying, migrating, or running database-backed app code, create a Neon branch in project `[PROJECT NAME]` (`[PROJECT ID]`).
3. Set the Neon branch to expire after 7 days unless the user explicitly asks for a longer-lived branch.
4. Update local `.env` so `DATABASE_URL` points to the new Neon branch.
5. Apply schema changes only to the Neon feature branch, never production.