ALTER TABLE "user" ADD COLUMN "budget_usd" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "budget_window" text DEFAULT 'month' NOT NULL;