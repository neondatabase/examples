CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "category_id" uuid;
--> statement-breakpoint
INSERT INTO "categories" ("name", "color") VALUES
	('Work', '#3b82f6'),
	('Personal', '#10b981'),
	('Shopping', '#f59e0b'),
	('Health', '#ef4444'),
	('Learning', '#a855f7')
ON CONFLICT ("name") DO NOTHING;
