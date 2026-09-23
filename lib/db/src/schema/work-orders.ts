import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizationsTable } from "./organizations";
import { teamsTable, vendorAssignmentsTable } from "./access-scope-directories";
import { usersTable } from "./users";

export const workOrdersTable = pgTable("work_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull(),
  vendorAssignmentId: uuid("vendor_assignment_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("OPEN"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  check("work_orders_status_check", sql`${table.status} IN ('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED')`),
  foreignKey({
    columns: [table.teamId, table.organizationId],
    foreignColumns: [teamsTable.id, teamsTable.organizationId],
    name: "work_orders_team_organization_fk",
  }).onDelete("restrict"),
  foreignKey({
    columns: [table.vendorAssignmentId, table.organizationId],
    foreignColumns: [vendorAssignmentsTable.id, vendorAssignmentsTable.organizationId],
    name: "work_orders_vendor_assignment_organization_fk",
  }).onDelete("restrict"),
  index("work_orders_team_list_idx").on(table.organizationId, table.teamId, table.createdAt, table.id),
  index("work_orders_vendor_list_idx").on(table.organizationId, table.vendorAssignmentId, table.createdAt, table.id),
]);

export const insertWorkOrderSchema = createInsertSchema(workOrdersTable).omit({
  id: true, createdAt: true, updatedAt: true, completedAt: true,
});
export type InsertWorkOrder = z.infer<typeof insertWorkOrderSchema>;
export type WorkOrder = typeof workOrdersTable.$inferSelect;