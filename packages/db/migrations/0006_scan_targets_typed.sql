-- Targets become typed so uploaded spec files can sit next to URLs: ["https://a"] → [{"type":"url","value":"https://a"}].
-- ALTER ... TYPE ... USING can't hold a subquery, hence a new column that replaces the old one.
ALTER TABLE "scan" ADD COLUMN "targets_typed" jsonb;--> statement-breakpoint
UPDATE "scan" SET "targets_typed" = (
  SELECT coalesce(jsonb_agg(jsonb_build_object('type', 'url', 'value', t.value) ORDER BY t.ord), '[]'::jsonb)
  FROM unnest("scan"."targets") WITH ORDINALITY AS t(value, ord)
);--> statement-breakpoint
ALTER TABLE "scan" DROP COLUMN "targets";--> statement-breakpoint
ALTER TABLE "scan" RENAME COLUMN "targets_typed" TO "targets";--> statement-breakpoint
ALTER TABLE "scan" ALTER COLUMN "targets" SET NOT NULL;
