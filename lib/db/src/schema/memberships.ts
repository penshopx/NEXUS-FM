import { pgEnum, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const canonicalRoleValues = [
  "PLATFORM_ADMIN",
  "FACILITY_MANAGER",
  "FACILITY_SUPERVISOR",
  "INSPECTOR",
  "MAINTENANCE_TECHNICIAN",
  "WAREHOUSE_SUPERVISOR",
  "VENDOR",
] as const;

export const canonicalRoleEnum = pgEnum("canonical_role", canonicalRoleValues);

export const membershipsTable = pgTable("memberships", {
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  role: canonicalRoleEnum("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.organizationId] })]);