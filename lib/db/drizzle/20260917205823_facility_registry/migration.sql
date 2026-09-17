CREATE TABLE IF NOT EXISTS "facilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "facilities_id_organization_unique" UNIQUE ("id", "organization_id")
);
CREATE INDEX IF NOT EXISTS "facilities_organization_idx" ON "facilities" ("organization_id");

CREATE TABLE IF NOT EXISTS "buildings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "facility_id" uuid NOT NULL,
  CONSTRAINT "buildings_id_organization_unique" UNIQUE ("id", "organization_id"),
  CONSTRAINT "buildings_id_facility_organization_unique" UNIQUE ("id", "facility_id", "organization_id"),
  CONSTRAINT "buildings_facility_organization_fk" FOREIGN KEY ("facility_id", "organization_id")
    REFERENCES "facilities" ("id", "organization_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "buildings_organization_facility_idx" ON "buildings" ("organization_id", "facility_id");

CREATE TABLE IF NOT EXISTS "spaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "facility_id" uuid NOT NULL,
  "building_id" uuid NOT NULL,
  CONSTRAINT "spaces_id_organization_unique" UNIQUE ("id", "organization_id"),
  CONSTRAINT "spaces_id_building_facility_organization_unique" UNIQUE ("id", "building_id", "facility_id", "organization_id"),
  CONSTRAINT "spaces_building_facility_organization_fk" FOREIGN KEY ("building_id", "facility_id", "organization_id")
    REFERENCES "buildings" ("id", "facility_id", "organization_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "spaces_organization_building_idx" ON "spaces" ("organization_id", "building_id");

CREATE TABLE IF NOT EXISTS "systems" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "facility_id" uuid NOT NULL,
  "building_id" uuid NOT NULL,
  "space_id" uuid NOT NULL,
  CONSTRAINT "systems_id_organization_unique" UNIQUE ("id", "organization_id"),
  CONSTRAINT "systems_id_space_building_facility_organization_unique" UNIQUE ("id", "space_id", "building_id", "facility_id", "organization_id"),
  CONSTRAINT "systems_space_building_facility_organization_fk" FOREIGN KEY ("space_id", "building_id", "facility_id", "organization_id")
    REFERENCES "spaces" ("id", "building_id", "facility_id", "organization_id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "systems_organization_space_idx" ON "systems" ("organization_id", "space_id");

CREATE TABLE IF NOT EXISTS "assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "facility_id" uuid NOT NULL,
  "building_id" uuid NOT NULL,
  "space_id" uuid NOT NULL,
  "system_id" uuid,
  CONSTRAINT "assets_id_organization_unique" UNIQUE ("id", "organization_id"),
  CONSTRAINT "assets_space_building_facility_organization_fk" FOREIGN KEY ("space_id", "building_id", "facility_id", "organization_id")
    REFERENCES "spaces" ("id", "building_id", "facility_id", "organization_id") ON DELETE CASCADE,
  CONSTRAINT "assets_system_space_building_facility_organization_fk" FOREIGN KEY ("system_id", "space_id", "building_id", "facility_id", "organization_id")
    REFERENCES "systems" ("id", "space_id", "building_id", "facility_id", "organization_id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "assets_organization_space_idx" ON "assets" ("organization_id", "space_id");