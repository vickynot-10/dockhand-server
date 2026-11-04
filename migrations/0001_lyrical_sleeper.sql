ALTER TABLE "services" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "deploy_type" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "repo_id" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "repo_full_name" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "root_directory" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "build_command" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "output_directory" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "env_vars" jsonb;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "image_url" text;