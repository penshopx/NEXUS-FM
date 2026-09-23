CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"vendor_assignment_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "work_orders_status_check" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED'))
);
--> statement-breakpoint
CREATE INDEX "work_orders_team_list_idx" ON "work_orders" ("organization_id","team_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_orders_vendor_list_idx" ON "work_orders" ("organization_id","vendor_assignment_id","created_at","id");--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_team_organization_fk" FOREIGN KEY ("team_id","organization_id") REFERENCES "teams"("id","organization_id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vendor_assignment_organization_fk" FOREIGN KEY ("vendor_assignment_id","organization_id") REFERENCES "vendor_assignments"("id","organization_id") ON DELETE RESTRICT;