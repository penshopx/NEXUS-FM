import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { membershipsTable } from "./memberships";
import { organizationsTable } from "./organizations";

function accessScopeDirectoryColumns() {
  return {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  };
}

export const teamsTable = pgTable("teams", {
  ...accessScopeDirectoryColumns(),
}, (table) => [
  unique("teams_id_organization_unique").on(table.id, table.organizationId),
  index("teams_organization_idx").on(table.organizationId),
  index("teams_organization_name_id_idx").on(table.organizationId, table.name, table.id),
]);

export const vendorAssignmentsTable = pgTable("vendor_assignments", {
  ...accessScopeDirectoryColumns(),
}, (table) => [
  unique("vendor_assignments_id_organization_unique").on(table.id, table.organizationId),
  index("vendor_assignments_organization_idx").on(table.organizationId),
  index("vendor_assignments_organization_name_id_idx").on(table.organizationId, table.name, table.id),
]);

export const vendorAssignmentMembershipsTable = pgTable("vendor_assignment_memberships", {
  vendorAssignmentId: uuid("vendor_assignment_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  userId: uuid("user_id").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  primaryKey({ columns: [table.vendorAssignmentId, table.organizationId, table.userId] }),
  foreignKey({
    columns: [table.vendorAssignmentId, table.organizationId],
    foreignColumns: [vendorAssignmentsTable.id, vendorAssignmentsTable.organizationId],
    name: "vendor_assignment_memberships_assignment_organization_fk",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.organizationId],
    foreignColumns: [membershipsTable.userId, membershipsTable.organizationId],
    name: "vendor_assignment_memberships_user_organization_fk",
  }).onDelete("cascade"),
  index("vendor_assignment_memberships_organization_user_idx").on(table.organizationId, table.userId),
]);

export type Team = typeof teamsTable.$inferSelect;
export type VendorAssignment = typeof vendorAssignmentsTable.$inferSelect;
export type VendorAssignmentMembership = typeof vendorAssignmentMembershipsTable.$inferSelect;