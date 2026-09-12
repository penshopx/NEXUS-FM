import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const roleStatusValues = ["ACTIVE", "DEPRECATED"] as const;
export const permissionStatusValues = ["ACTIVE", "DEPRECATED"] as const;
export const permissionEffectValues = ["ALLOW", "DENY"] as const;
export const bindingStatusValues = ["ACTIVE", "SUSPENDED", "EXPIRED"] as const;
export const scopeTypeValues = [
  "PLATFORM",
  "ORGANIZATION",
  "PORTFOLIO",
  "FACILITY",
  "BUILDING",
  "SPACE",
  "ASSET",
  "ASSIGNED",
  "TEAM",
  "VENDOR_ASSIGNMENT",
  "OWNED_REQUEST",
] as const;

export const roleStatusEnum = pgEnum("authorization_role_status", roleStatusValues);
export const permissionStatusEnum = pgEnum("authorization_permission_status", permissionStatusValues);
export const permissionEffectEnum = pgEnum("authorization_permission_effect", permissionEffectValues);
export const bindingStatusEnum = pgEnum("authorization_binding_status", bindingStatusValues);
export const scopeTypeEnum = pgEnum("authorization_scope_type", scopeTypeValues);

/** Canonical role registry. The existing memberships.role remains unchanged. */
export const rolesTable = pgTable("authorization_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  status: roleStatusEnum("status").notNull().default("ACTIVE"),
  policyVersion: uuid("policy_version").notNull().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const permissionsTable = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  resource: text("resource").notNull(),
  action: text("action").notNull(),
  description: text("description").notNull().default(""),
  status: permissionStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const rolePermissionsTable = pgTable("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissionsTable.id, { onDelete: "restrict" }),
  defaultScopeType: scopeTypeEnum("default_scope_type").notNull(),
  effect: permissionEffectEnum("effect").notNull().default("ALLOW"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("role_permissions_role_permission_scope_unique").on(
    table.roleId,
    table.permissionId,
    table.defaultScopeType,
  ),
]);

export const userRoleBindingsTable = pgTable("user_role_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => rolesTable.id, { onDelete: "restrict" }),
  version: uuid("version").notNull().defaultRandom(),
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
    table.roleId,
    table.scopeType,
    table.scopeId,
  ).nullsNotDistinct(),
]);

// This table is intentionally separate from general audit_events so authorization
// decisions can be queried without exposing foundation audit payloads.
export const authorizationAuditLogsTable = pgTable("authorization_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  decision: text("decision").notNull(),
  reasonCode: text("reason_code").notNull(),
  scopeEvaluated: text("scope_evaluated"),
  requestId: text("request_id"),
  beforeState: text("before_state"),
  afterState: text("after_state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuthorizationRole = typeof rolesTable.$inferSelect;
export type Permission = typeof permissionsTable.$inferSelect;
export type UserRoleBinding = typeof userRoleBindingsTable.$inferSelect;