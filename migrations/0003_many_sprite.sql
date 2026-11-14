CREATE TABLE "service_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"deployment_id" uuid,
	"ts" timestamp (3) NOT NULL,
	"stream" text DEFAULT 'stdout' NOT NULL,
	"level" text,
	"message" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_logs" ADD CONSTRAINT "service_logs_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_logs_service_ts_idx" ON "service_logs" USING btree ("service_id","ts");--> statement-breakpoint
CREATE INDEX "service_logs_service_level_idx" ON "service_logs" USING btree ("service_id","level","id");