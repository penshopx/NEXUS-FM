import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

function registryColumns() {
  return {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  };
}

export const facilitiesTable = pgTable("facilities", {
  ...registryColumns(),
}, (table) => [
  unique("facilities_id_organization_unique").on(table.id, table.organizationId),
  index("facilities_organization_idx").on(table.organizationId),
  index("facilities_organization_name_id_idx").on(table.organizationId, table.name, table.id),
]);

export const buildingsTable = pgTable("buildings", {
  ...registryColumns(),
  facilityId: uuid("facility_id").notNull(),
}, (table) => [
  unique("buildings_id_organization_unique").on(table.id, table.organizationId),
  unique("buildings_id_facility_organization_unique").on(table.id, table.facilityId, table.organizationId),
  foreignKey({
    columns: [table.facilityId, table.organizationId],
    foreignColumns: [facilitiesTable.id, facilitiesTable.organizationId],
    name: "buildings_facility_organization_fk",
  }).onDelete("cascade"),
  index("buildings_organization_facility_idx").on(table.organizationId, table.facilityId),
  index("buildings_organization_name_id_idx").on(table.organizationId, table.name, table.id),
]);

export const spacesTable = pgTable("spaces", {
  ...registryColumns(),
  facilityId: uuid("facility_id").notNull(),
  buildingId: uuid("building_id").notNull(),
}, (table) => [
  unique("spaces_id_organization_unique").on(table.id, table.organizationId),
  unique("spaces_id_building_facility_organization_unique").on(table.id, table.buildingId, table.facilityId, table.organizationId),
  foreignKey({
    columns: [table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [buildingsTable.id, buildingsTable.facilityId, buildingsTable.organizationId],
    name: "spaces_building_facility_organization_fk",
  }).onDelete("cascade"),
  index("spaces_organization_building_idx").on(table.organizationId, table.buildingId),
  index("spaces_organization_name_id_idx").on(table.organizationId, table.name, table.id),
]);

export const systemsTable = pgTable("systems", {
  ...registryColumns(),
  facilityId: uuid("facility_id").notNull(),
  buildingId: uuid("building_id").notNull(),
  spaceId: uuid("space_id").notNull(),
}, (table) => [
  unique("systems_id_organization_unique").on(table.id, table.organizationId),
  unique("systems_id_space_building_facility_organization_unique").on(table.id, table.spaceId, table.buildingId, table.facilityId, table.organizationId),
  foreignKey({
    columns: [table.spaceId, table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [spacesTable.id, spacesTable.buildingId, spacesTable.facilityId, spacesTable.organizationId],
    name: "systems_space_building_facility_organization_fk",
  }).onDelete("cascade"),
  index("systems_organization_space_idx").on(table.organizationId, table.spaceId),
  index("systems_organization_name_id_idx").on(table.organizationId, table.name, table.id),
]);

export const assetsTable = pgTable("assets", {
  ...registryColumns(),
  facilityId: uuid("facility_id").notNull(),
  buildingId: uuid("building_id").notNull(),
  spaceId: uuid("space_id").notNull(),
  systemId: uuid("system_id"),
}, (table) => [
  unique("assets_id_organization_unique").on(table.id, table.organizationId),
  foreignKey({
    columns: [table.spaceId, table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [spacesTable.id, spacesTable.buildingId, spacesTable.facilityId, spacesTable.organizationId],
    name: "assets_space_building_facility_organization_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.systemId, table.spaceId, table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [systemsTable.id, systemsTable.spaceId, systemsTable.buildingId, systemsTable.facilityId, systemsTable.organizationId],
    name: "assets_system_space_building_facility_organization_fk",
  }).onDelete("restrict"),
  index("assets_organization_space_idx").on(table.organizationId, table.spaceId),
  index("assets_organization_name_id_idx").on(table.organizationId, table.name, table.id),
]);

export type Facility = typeof facilitiesTable.$inferSelect;
export type Building = typeof buildingsTable.$inferSelect;
export type Space = typeof spacesTable.$inferSelect;
export type System = typeof systemsTable.$inferSelect;
export type Asset = typeof assetsTable.$inferSelect;