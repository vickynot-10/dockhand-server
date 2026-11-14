ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "webhook_id" bigint;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "webhook_secret" text;