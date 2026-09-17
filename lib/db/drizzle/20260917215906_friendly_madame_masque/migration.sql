CREATE INDEX "assets_organization_name_id_idx" ON "assets" ("organization_id","name","id");--> statement-breakpoint
CREATE INDEX "buildings_organization_name_id_idx" ON "buildings" ("organization_id","name","id");--> statement-breakpoint
CREATE INDEX "facilities_organization_name_id_idx" ON "facilities" ("organization_id","name","id");--> statement-breakpoint
CREATE INDEX "spaces_organization_name_id_idx" ON "spaces" ("organization_id","name","id");--> statement-breakpoint
CREATE INDEX "systems_organization_name_id_idx" ON "systems" ("organization_id","name","id");