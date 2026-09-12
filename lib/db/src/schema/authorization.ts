import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { canonicalRoleEnum } from "./memberships";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const permissionStatusEnum = pgEnum("permission_status", ["ACTIVE", "DEPRECATED"]);
export const permissionEffectEnum = pgEnum("permission_effect", ["ALLOW", "DENY"]);
export const scopeTypeEnum = pgEnum("scope_type", [
  "PLATFORM", "ORGANIZATION", "PORTFOLIO", "FACILITY", "BUILDING", "SPACE",
  "ASSET", "ASSIGNED", "TEAM", "VENDOR_ASSIGNMENT", "OWNED_REQUEST",
]);
export const bindingStatusEnum = pgEnum("binding_status", [
  "ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED",
]);

export const permissionsTable = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
  status: permissionStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const rolePermissionsTable = pgTable("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: canonicalRoleEnum("role").notNull(),
  permissionId: uuid("permission_id").notNull().references(() => permissionsTable.id, { onDelete: "restrict" }),
  defaultScopeType: scopeTypeEnum("default_scope_type").notNull(),
  effect: permissionEffectEnum("effect").notNull().default("ALLOW"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("role_permission_scope_unique").on(table.role, table.permissionId, table.defaultScopeType),
]);

export const userRoleBindingsTable = pgTable("user_role_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  role: canonicalRoleEnum("role").notNull(),
  scopeType: scopeTypeEnum("scope_type").notNull(),
  scopeId: uuid("scope_id"),
  status: bindingStatusEnum("status").notNull().default("ACTIVE"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  grantedBy: uuid("granted_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("user_role_binding_unique").on(
    table.userId,
    table.organizationId,
    table.role,
    table.scopeType,
    table.scopeId,
  ).nullsNotDistinct(),
]);

export const authorizationAuditLogsTable = pgTable("authorization_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  role: canonicalRoleEnum("role"),
  permission: text("permission").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  decision: permissionEffectEnum("decision").notNull(),
  reasonCode: text("reason_code").notNull(),
  scopeEvaluated: text("scope_evaluated"),
  requestContext: jsonb("request_context").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});