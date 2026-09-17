CREATE TYPE "public"."binding_status" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."permission_effect" AS ENUM('ALLOW', 'DENY');--> statement-breakpoint
CREATE TYPE "public"."permission_status" AS ENUM('ACTIVE', 'DEPRECATED');--> statement-breakpoint
CREATE TYPE "public"."scope_type" AS ENUM('PLATFORM', 'ORGANIZATION', 'PORTFOLIO', 'FACILITY', 'BUILDING', 'SPACE', 'ASSET', 'ASSIGNED', 'TEAM', 'VENDOR_ASSIGNMENT', 'OWNED_REQUEST');--> statement-breakpoint
CREATE TABLE "authorization_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"role" "canonical_role",
	"permission" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"decision" "permission_effect" NOT NULL,
	"reason_code" text NOT NULL,
	"scope_evaluated" text,
	"request_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"description" text NOT NULL,
	"status" "permission_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "canonical_role" NOT NULL,
	"permission_id" uuid NOT NULL,
	"default_scope_type" "scope_type" NOT NULL,
	"effect" "permission_effect" DEFAULT 'ALLOW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_role_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "canonical_role" NOT NULL,
	"scope_type" "scope_type" NOT NULL,
	"scope_id" uuid,
	"status" "binding_status" DEFAULT 'ACTIVE' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" ADD CONSTRAINT "authorization_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" ADD CONSTRAINT "authorization_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_bindings" ADD CONSTRAINT "user_role_bindings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_bindings" ADD CONSTRAINT "user_role_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_bindings" ADD CONSTRAINT "user_role_bindings_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_permission_scope_unique" ON "role_permissions" USING btree ("role","permission_id","default_scope_type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_binding_unique" ON "user_role_bindings" USING btree ("user_id","organization_id","role","scope_type","scope_id");