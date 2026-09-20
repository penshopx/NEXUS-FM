CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "vendor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_assignments_id_organization_unique" UNIQUE("id","organization_id")
);
--> statement-breakpoint
CREATE INDEX "teams_organization_idx" ON "teams" ("organization_id");--> statement-breakpoint
CREATE INDEX "teams_organization_name_id_idx" ON "teams" ("organization_id","name","id");--> statement-breakpoint
CREATE INDEX "teams_name_trgm_idx" ON "teams" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "teams_code_trgm_idx" ON "teams" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vendor_assignments_organization_idx" ON "vendor_assignments" ("organization_id");--> statement-breakpoint
CREATE INDEX "vendor_assignments_organization_name_id_idx" ON "vendor_assignments" ("organization_id","name","id");--> statement-breakpoint
CREATE INDEX "vendor_assignments_name_trgm_idx" ON "vendor_assignments" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vendor_assignments_code_trgm_idx" ON "vendor_assignments" USING gin ("code" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vendor_assignments" ADD CONSTRAINT "vendor_assignments_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;