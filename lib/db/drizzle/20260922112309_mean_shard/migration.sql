CREATE TABLE "vendor_assignment_memberships" (
	"vendor_assignment_id" uuid,
	"organization_id" uuid,
	"user_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_assignment_memberships_pkey" PRIMARY KEY("vendor_assignment_id","organization_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "vendor_assignment_memberships_organization_user_idx" ON "vendor_assignment_memberships" ("organization_id","user_id");--> statement-breakpoint
ALTER TABLE "vendor_assignment_memberships" ADD CONSTRAINT "vendor_assignment_memberships_assignment_organization_fk" FOREIGN KEY ("vendor_assignment_id","organization_id") REFERENCES "vendor_assignments"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "vendor_assignment_memberships" ADD CONSTRAINT "vendor_assignment_memberships_user_organization_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "memberships"("user_id","organization_id") ON DELETE CASCADE;