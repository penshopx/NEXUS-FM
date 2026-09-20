CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "assets_name_trgm_idx" ON "assets" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "assets_code_trgm_idx" ON "assets" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "buildings_name_trgm_idx" ON "buildings" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "buildings_code_trgm_idx" ON "buildings" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "facilities_name_trgm_idx" ON "facilities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "facilities_code_trgm_idx" ON "facilities" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "spaces_name_trgm_idx" ON "spaces" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "spaces_code_trgm_idx" ON "spaces" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "systems_name_trgm_idx" ON "systems" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "systems_code_trgm_idx" ON "systems" USING gin ("code" gin_trgm_ops);