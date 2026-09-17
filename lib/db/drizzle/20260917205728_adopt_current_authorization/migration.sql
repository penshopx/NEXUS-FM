-- Forward adoption of the originally generated authorization tables.
-- This migration is intentionally additive and preserves existing foundation
-- and authorization rows while converging old generated names to the schema.
CREATE TYPE "public"."authorization_role_status" AS ENUM('ACTIVE', 'DEPRECATED');--> statement-breakpoint
CREATE TYPE "public"."authorization_permission_status" AS ENUM('ACTIVE', 'DEPRECATED');--> statement-breakpoint
CREATE TYPE "public"."authorization_permission_effect" AS ENUM('ALLOW', 'DENY');--> statement-breakpoint
CREATE TYPE "public"."authorization_binding_status" AS ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."authorization_scope_type" AS ENUM('PLATFORM', 'ORGANIZATION', 'PORTFOLIO', 'FACILITY', 'BUILDING', 'SPACE', 'ASSET', 'ASSIGNED', 'TEAM', 'VENDOR_ASSIGNMENT', 'OWNED_REQUEST');--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "authorization_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "status" "authorization_role_status" DEFAULT 'ACTIVE' NOT NULL,
  "policy_version" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "authorization_roles_code_unique" UNIQUE("code")
);--> statement-breakpoint

ALTER TABLE "permissions" ALTER COLUMN "description" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "status" TYPE "authorization_permission_status" USING "status"::text::"authorization_permission_status";--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"authorization_permission_status";--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "role_id" uuid;--> statement-breakpoint
INSERT INTO "authorization_roles" ("code")
SELECT DISTINCT "role"::text FROM "role_permissions"
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "authorization_roles" ("code")
SELECT enumlabel FROM pg_enum
JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
WHERE pg_type.typname = 'canonical_role'
  AND NOT EXISTS (SELECT 1 FROM "authorization_roles" WHERE "authorization_roles"."code" = enumlabel)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "role_permissions" rp
SET "role_id" = ar."id"
FROM "authorization_roles" ar
WHERE ar."code" = rp."role"::text
  AND rp."role_id" IS NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "default_scope_type" TYPE "authorization_scope_type" USING "default_scope_type"::text::"authorization_scope_type";--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "effect" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "effect" TYPE "authorization_permission_effect" USING "effect"::text::"authorization_permission_effect";--> statement-breakpoint
ALTER TABLE "role_permissions" ALTER COLUMN "effect" SET DEFAULT 'ALLOW'::"authorization_permission_effect";--> statement-breakpoint
ALTER TABLE "role_permissions" DROP COLUMN IF EXISTS "role";--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

ALTER TABLE "user_role_bindings" ADD COLUMN IF NOT EXISTS "role_id" uuid;--> statement-breakpoint
ALTER TABLE "user_role_bindings" ADD COLUMN IF NOT EXISTS "version" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
INSERT INTO "authorization_roles" ("code")
SELECT DISTINCT "role"::text FROM "user_role_bindings"
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "user_role_bindings" ub
SET "role_id" = ar."id"
FROM "authorization_roles" ar
WHERE ar."code" = ub."role"::text
  AND ub."role_id" IS NULL;--> statement-breakpoint
ALTER TABLE "user_role_bindings" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_role_bindings" ALTER COLUMN "scope_type" TYPE "authorization_scope_type" USING "scope_type"::text::"authorization_scope_type";--> statement-breakpoint
ALTER TABLE "user_role_bindings" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user_role_bindings" ALTER COLUMN "status" TYPE "authorization_binding_status"
USING (CASE WHEN "status"::text = 'REVOKED' THEN 'EXPIRED' ELSE "status"::text END)::"authorization_binding_status";--> statement-breakpoint
ALTER TABLE "user_role_bindings" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"authorization_binding_status";--> statement-breakpoint
ALTER TABLE "user_role_bindings" DROP COLUMN IF EXISTS "role";--> statement-breakpoint

ALTER TABLE "authorization_audit_logs" ADD COLUMN IF NOT EXISTS "action" text;--> statement-breakpoint
UPDATE "authorization_audit_logs"
SET "action" = COALESCE(NULLIF("permission", ''), 'AUTHORIZATION_DECISION')
WHERE "action" IS NULL;--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" ALTER COLUMN "action" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" ALTER COLUMN "decision" TYPE text USING "decision"::text;--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" ADD COLUMN IF NOT EXISTS "request_id" text;--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" ADD COLUMN IF NOT EXISTS "before_state" text;--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" ADD COLUMN IF NOT EXISTS "after_state" text;--> statement-breakpoint
UPDATE "authorization_audit_logs"
SET "before_state" = "request_context"::text
WHERE "before_state" IS NULL AND "request_context" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" DROP COLUMN IF EXISTS "role";--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" DROP COLUMN IF EXISTS "permission";--> statement-breakpoint
ALTER TABLE "authorization_audit_logs" DROP COLUMN IF EXISTS "request_context";--> statement-breakpoint

ALTER TABLE "role_permissions" DROP CONSTRAINT IF EXISTS "role_permissions_permission_id_permissions_id_fk";--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_authorization_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."authorization_roles"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "user_role_bindings" DROP CONSTRAINT IF EXISTS "user_role_bindings_role_id_authorization_roles_id_fk";--> statement-breakpoint
ALTER TABLE "user_role_bindings" ADD CONSTRAINT "user_role_bindings_role_id_authorization_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."authorization_roles"("id") ON DELETE restrict;--> statement-breakpoint

DROP INDEX IF EXISTS "role_permission_scope_unique";--> statement-breakpoint
ALTER TABLE "role_permissions" DROP CONSTRAINT IF EXISTS "role_permissions_role_permission_scope_unique";--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_permission_scope_unique" UNIQUE("role_id", "permission_id", "default_scope_type");--> statement-breakpoint
ALTER TABLE "user_role_bindings" DROP CONSTRAINT IF EXISTS "user_role_binding_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "user_role_binding_unique";--> statement-breakpoint
ALTER TABLE "user_role_bindings" ADD CONSTRAINT "user_role_binding_unique" UNIQUE NULLS NOT DISTINCT("user_id", "organization_id", "role_id", "scope_type", "scope_id");--> statement-breakpoint

DROP TYPE IF EXISTS "public"."binding_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."permission_effect";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."permission_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."scope_type";--> statement-breakpoint