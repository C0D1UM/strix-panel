-- Everyone who joined before approval existed is approved.
UPDATE "user" SET "approved_at" = "created_at" WHERE "approved_at" IS NULL;
