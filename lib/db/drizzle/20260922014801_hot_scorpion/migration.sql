CREATE INDEX "assets_organization_code_idx" ON "assets" ("organization_id","code");--> statement-breakpoint
CREATE INDEX "buildings_organization_code_idx" ON "buildings" ("organization_id","code");--> statement-breakpoint
CREATE INDEX "facilities_organization_code_idx" ON "facilities" ("organization_id","code");--> statement-breakpoint
CREATE INDEX "spaces_organization_code_idx" ON "spaces" ("organization_id","code");--> statement-breakpoint
CREATE INDEX "systems_organization_code_idx" ON "systems" ("organization_id","code");