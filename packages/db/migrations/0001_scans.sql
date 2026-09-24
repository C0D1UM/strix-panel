CREATE TABLE "scan" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text,
	"targets" text[] NOT NULL,
	"scan_mode" text NOT NULL,
	"instruction" text,
	"max_budget_usd" numeric(10, 2),
	"status" text DEFAULT 'queued' NOT NULL,
	"run_name" text,
	"error" text,
	"requests" bigint DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cached_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 4) DEFAULT 0 NOT NULL,
	"findings_critical" integer DEFAULT 0 NOT NULL,
	"findings_high" integer DEFAULT 0 NOT NULL,
	"findings_medium" integer DEFAULT 0 NOT NULL,
	"findings_low" integer DEFAULT 0 NOT NULL,
	"findings_info" integer DEFAULT 0 NOT NULL,
	"report_md" text,
	"agents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scan_id" uuid NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_finding" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scan_id" uuid NOT NULL,
	"strix_id" text NOT NULL,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"target" text,
	"endpoint" text,
	"method" text,
	"cve" text,
	"cwe" text,
	"confidence" text,
	"cvss" numeric(3, 1),
	"found_at" timestamp with time zone NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_event" ADD CONSTRAINT "scan_event_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding" ADD CONSTRAINT "scan_finding_scan_id_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."scan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scan_user_id_created_at_idx" ON "scan" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scan_event_scan_id_id_idx" ON "scan_event" USING btree ("scan_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "scan_finding_scan_id_strix_id_idx" ON "scan_finding" USING btree ("scan_id","strix_id");