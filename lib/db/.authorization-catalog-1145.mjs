// lib/db/src/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// lib/db/src/schema/access-scope-directories.ts
import {
  foreignKey,
  index,
  pgTable as pgTable4,
  primaryKey as primaryKey2,
  text as text3,
  timestamp as timestamp4,
  unique,
  uuid as uuid4
} from "drizzle-orm/pg-core";

// lib/db/src/schema/memberships.ts
import { boolean as boolean3, pgEnum, pgTable as pgTable3, primaryKey, timestamp as timestamp3, uuid as uuid3 } from "drizzle-orm/pg-core";

// lib/db/src/schema/organizations.ts
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
var organizationsTable = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
});

// lib/db/src/schema/users.ts
import { boolean as boolean2, pgTable as pgTable2, text as text2, timestamp as timestamp2, uuid as uuid2 } from "drizzle-orm/pg-core";
var usersTable = pgTable2("users", {
  id: uuid2("id").primaryKey().defaultRandom(),
  externalAuthId: text2("external_auth_id").notNull().unique(),
  displayName: text2("display_name").notNull(),
  email: text2("email").notNull(),
  isActive: boolean2("is_active").notNull().default(true),
  createdAt: timestamp2("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp2("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
});

// lib/db/src/schema/memberships.ts
var canonicalRoleValues = [
  "PLATFORM_ADMIN",
  "FACILITY_MANAGER",
  "FACILITY_SUPERVISOR",
  "INSPECTOR",
  "MAINTENANCE_TECHNICIAN",
  "WAREHOUSE_SUPERVISOR",
  "VENDOR"
];
var canonicalRoleEnum = pgEnum("canonical_role", canonicalRoleValues);
var membershipsTable = pgTable3("memberships", {
  userId: uuid3("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  organizationId: uuid3("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  role: canonicalRoleEnum("role").notNull(),
  isActive: boolean3("is_active").notNull().default(true),
  createdAt: timestamp3("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.userId, table.organizationId] })]);

// lib/db/src/schema/access-scope-directories.ts
function accessScopeDirectoryColumns() {
  return {
    id: uuid4("id").primaryKey().defaultRandom(),
    organizationId: uuid4("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text3("name").notNull(),
    code: text3("code"),
    status: text3("status").notNull().default("ACTIVE"),
    createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp4("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
  };
}
var teamsTable = pgTable4("teams", {
  ...accessScopeDirectoryColumns()
}, (table) => [
  unique("teams_id_organization_unique").on(table.id, table.organizationId),
  index("teams_organization_idx").on(table.organizationId),
  index("teams_organization_name_id_idx").on(table.organizationId, table.name, table.id)
]);
var vendorAssignmentsTable = pgTable4("vendor_assignments", {
  ...accessScopeDirectoryColumns()
}, (table) => [
  unique("vendor_assignments_id_organization_unique").on(table.id, table.organizationId),
  index("vendor_assignments_organization_idx").on(table.organizationId),
  index("vendor_assignments_organization_name_id_idx").on(table.organizationId, table.name, table.id)
]);
var vendorAssignmentMembershipsTable = pgTable4("vendor_assignment_memberships", {
  vendorAssignmentId: uuid4("vendor_assignment_id").notNull(),
  organizationId: uuid4("organization_id").notNull(),
  userId: uuid4("user_id").notNull(),
  status: text3("status").notNull().default("ACTIVE"),
  createdAt: timestamp4("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp4("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
}, (table) => [
  primaryKey2({ columns: [table.vendorAssignmentId, table.organizationId, table.userId] }),
  foreignKey({
    columns: [table.vendorAssignmentId, table.organizationId],
    foreignColumns: [vendorAssignmentsTable.id, vendorAssignmentsTable.organizationId],
    name: "vendor_assignment_memberships_assignment_organization_fk"
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.userId, table.organizationId],
    foreignColumns: [membershipsTable.userId, membershipsTable.organizationId],
    name: "vendor_assignment_memberships_user_organization_fk"
  }).onDelete("cascade"),
  index("vendor_assignment_memberships_organization_user_idx").on(table.organizationId, table.userId)
]);

// lib/db/src/schema/audit-events.ts
import { jsonb, pgTable as pgTable5, text as text4, timestamp as timestamp5, uuid as uuid5 } from "drizzle-orm/pg-core";
var auditEventsTable = pgTable5("audit_events", {
  id: uuid5("id").primaryKey().defaultRandom(),
  actorUserId: uuid5("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  organizationId: uuid5("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  action: text4("action").notNull(),
  targetType: text4("target_type").notNull(),
  targetId: text4("target_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp5("created_at", { withTimezone: true }).notNull().defaultNow()
});

// lib/db/src/schema/authorization.ts
import {
  pgEnum as pgEnum2,
  pgTable as pgTable6,
  jsonb as jsonb2,
  text as text5,
  timestamp as timestamp6,
  unique as unique2,
  uuid as uuid6
} from "drizzle-orm/pg-core";
var roleStatusValues = ["ACTIVE", "DEPRECATED"];
var permissionStatusValues = ["ACTIVE", "DEPRECATED"];
var permissionEffectValues = ["ALLOW", "DENY"];
var bindingStatusValues = ["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED"];
var scopeTypeValues = [
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
  "OWNED_REQUEST"
];
var roleStatusEnum = pgEnum2("authorization_role_status", roleStatusValues);
var permissionStatusEnum = pgEnum2("permission_status", permissionStatusValues);
var permissionEffectEnum = pgEnum2("permission_effect", permissionEffectValues);
var bindingStatusEnum = pgEnum2("binding_status", bindingStatusValues);
var scopeTypeEnum = pgEnum2("scope_type", scopeTypeValues);
var rolesTable = pgTable6("authorization_roles", {
  id: uuid6("id").primaryKey().defaultRandom(),
  code: text5("code").notNull().unique(),
  description: text5("description").notNull().default(""),
  status: roleStatusEnum("status").notNull().default("ACTIVE"),
  policyVersion: uuid6("policy_version").notNull().defaultRandom(),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp6("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
});
var permissionsTable = pgTable6("permissions", {
  id: uuid6("id").primaryKey().defaultRandom(),
  code: text5("code").notNull().unique(),
  resource: text5("resource").notNull(),
  action: text5("action").notNull(),
  description: text5("description").notNull().default(""),
  status: permissionStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp6("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
});
var rolePermissionsTable = pgTable6("role_permissions", {
  id: uuid6("id").primaryKey().defaultRandom(),
  roleId: canonicalRoleEnum("role").notNull().$type(),
  permissionId: uuid6("permission_id").notNull().references(() => permissionsTable.id, { onDelete: "restrict" }),
  defaultScopeType: scopeTypeEnum("default_scope_type").notNull(),
  effect: permissionEffectEnum("effect").notNull().default("ALLOW"),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp6("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
}, (table) => [
  unique2("role_permission_scope_unique").on(
    table.roleId,
    table.permissionId,
    table.defaultScopeType
  )
]);
var userRoleBindingsTable = pgTable6("user_role_bindings", {
  id: uuid6("id").primaryKey().defaultRandom(),
  userId: uuid6("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  organizationId: uuid6("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
  roleId: canonicalRoleEnum("role").notNull().$type(),
  version: uuid6("version").notNull().defaultRandom(),
  scopeType: scopeTypeEnum("scope_type").notNull(),
  scopeId: uuid6("scope_id"),
  status: bindingStatusEnum("status").notNull().default("ACTIVE"),
  startsAt: timestamp6("starts_at", { withTimezone: true }),
  endsAt: timestamp6("ends_at", { withTimezone: true }),
  grantedBy: uuid6("granted_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp6("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
}, (table) => [
  unique2("user_role_binding_unique").on(
    table.userId,
    table.organizationId,
    table.roleId,
    table.scopeType,
    table.scopeId
  ).nullsNotDistinct()
]);
var authorizationAuditLogsTable = pgTable6("authorization_audit_logs", {
  id: uuid6("id").primaryKey().defaultRandom(),
  organizationId: uuid6("organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  actorUserId: uuid6("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  role: canonicalRoleEnum("role"),
  permission: text5("permission").notNull().default(""),
  resource: text5("resource").notNull(),
  resourceId: text5("resource_id"),
  decision: permissionEffectEnum("decision").notNull(),
  reasonCode: text5("reason_code").notNull(),
  scopeEvaluated: text5("scope_evaluated"),
  requestContext: jsonb2("request_context").notNull().default({}),
  action: text5("action"),
  requestId: text5("request_id"),
  beforeState: text5("before_state"),
  afterState: text5("after_state"),
  createdAt: timestamp6("created_at", { withTimezone: true }).notNull().defaultNow()
});

// lib/db/src/schema/facilities.ts
import {
  foreignKey as foreignKey2,
  index as index2,
  pgTable as pgTable7,
  text as text6,
  timestamp as timestamp7,
  unique as unique3,
  uuid as uuid7
} from "drizzle-orm/pg-core";
function registryColumns() {
  return {
    id: uuid7("id").primaryKey().defaultRandom(),
    organizationId: uuid7("organization_id").notNull().references(() => organizationsTable.id, { onDelete: "cascade" }),
    name: text6("name").notNull(),
    code: text6("code"),
    description: text6("description"),
    status: text6("status").notNull().default("ACTIVE"),
    createdAt: timestamp7("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp7("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
  };
}
var facilitiesTable = pgTable7("facilities", {
  ...registryColumns()
}, (table) => [
  unique3("facilities_id_organization_unique").on(table.id, table.organizationId),
  index2("facilities_organization_idx").on(table.organizationId),
  index2("facilities_organization_code_idx").on(table.organizationId, table.code),
  index2("facilities_organization_name_id_idx").on(table.organizationId, table.name, table.id)
]);
var buildingsTable = pgTable7("buildings", {
  ...registryColumns(),
  facilityId: uuid7("facility_id").notNull()
}, (table) => [
  unique3("buildings_id_organization_unique").on(table.id, table.organizationId),
  unique3("buildings_id_facility_organization_unique").on(table.id, table.facilityId, table.organizationId),
  foreignKey2({
    columns: [table.facilityId, table.organizationId],
    foreignColumns: [facilitiesTable.id, facilitiesTable.organizationId],
    name: "buildings_facility_organization_fk"
  }).onDelete("cascade"),
  index2("buildings_organization_facility_idx").on(table.organizationId, table.facilityId),
  index2("buildings_organization_code_idx").on(table.organizationId, table.code),
  index2("buildings_organization_name_id_idx").on(table.organizationId, table.name, table.id)
]);
var spacesTable = pgTable7("spaces", {
  ...registryColumns(),
  facilityId: uuid7("facility_id").notNull(),
  buildingId: uuid7("building_id").notNull()
}, (table) => [
  unique3("spaces_id_organization_unique").on(table.id, table.organizationId),
  unique3("spaces_id_building_facility_organization_unique").on(table.id, table.buildingId, table.facilityId, table.organizationId),
  foreignKey2({
    columns: [table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [buildingsTable.id, buildingsTable.facilityId, buildingsTable.organizationId],
    name: "spaces_building_facility_organization_fk"
  }).onDelete("cascade"),
  index2("spaces_organization_building_idx").on(table.organizationId, table.buildingId),
  index2("spaces_organization_code_idx").on(table.organizationId, table.code),
  index2("spaces_organization_name_id_idx").on(table.organizationId, table.name, table.id)
]);
var systemsTable = pgTable7("systems", {
  ...registryColumns(),
  facilityId: uuid7("facility_id").notNull(),
  buildingId: uuid7("building_id").notNull(),
  spaceId: uuid7("space_id").notNull()
}, (table) => [
  unique3("systems_id_organization_unique").on(table.id, table.organizationId),
  unique3("systems_id_space_building_facility_organization_unique").on(table.id, table.spaceId, table.buildingId, table.facilityId, table.organizationId),
  foreignKey2({
    columns: [table.spaceId, table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [spacesTable.id, spacesTable.buildingId, spacesTable.facilityId, spacesTable.organizationId],
    name: "systems_space_building_facility_organization_fk"
  }).onDelete("cascade"),
  index2("systems_organization_space_idx").on(table.organizationId, table.spaceId),
  index2("systems_organization_code_idx").on(table.organizationId, table.code),
  index2("systems_organization_name_id_idx").on(table.organizationId, table.name, table.id)
]);
var assetsTable = pgTable7("assets", {
  ...registryColumns(),
  facilityId: uuid7("facility_id").notNull(),
  buildingId: uuid7("building_id").notNull(),
  spaceId: uuid7("space_id").notNull(),
  systemId: uuid7("system_id")
}, (table) => [
  unique3("assets_id_organization_unique").on(table.id, table.organizationId),
  foreignKey2({
    columns: [table.spaceId, table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [spacesTable.id, spacesTable.buildingId, spacesTable.facilityId, spacesTable.organizationId],
    name: "assets_space_building_facility_organization_fk"
  }).onDelete("cascade"),
  foreignKey2({
    columns: [table.systemId, table.spaceId, table.buildingId, table.facilityId, table.organizationId],
    foreignColumns: [systemsTable.id, systemsTable.spaceId, systemsTable.buildingId, systemsTable.facilityId, systemsTable.organizationId],
    name: "assets_system_space_building_facility_organization_fk"
  }).onDelete("restrict"),
  index2("assets_organization_space_idx").on(table.organizationId, table.spaceId),
  index2("assets_organization_code_idx").on(table.organizationId, table.code),
  index2("assets_organization_name_id_idx").on(table.organizationId, table.name, table.id)
]);

// lib/db/src/schema/user-contexts.ts
import { pgTable as pgTable8, timestamp as timestamp8, uuid as uuid8 } from "drizzle-orm/pg-core";
var userContextsTable = pgTable8("user_contexts", {
  userId: uuid8("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  activeOrganizationId: uuid8("active_organization_id").references(() => organizationsTable.id, { onDelete: "set null" }),
  updatedAt: timestamp8("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => /* @__PURE__ */ new Date())
});

// lib/db/src/index.ts
var { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool });

// artifacts/api-server/src/services/authorization-catalog.ts
import { and, eq } from "drizzle-orm";
var foundation = {
  PLATFORM_ADMIN: [
    { resource: "ORGANIZATION", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "USER", actions: ["VIEW", "MANAGE"], scope: "PLATFORM" },
    { resource: "ROLE", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "PERMISSION", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "SESSION", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT", "EXPORT"], scope: "PLATFORM" }
  ],
  FACILITY_MANAGER: [
    { resource: "ORGANIZATION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "USER", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT"], scope: "ORGANIZATION" }
  ],
  FACILITY_SUPERVISOR: [
    { resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT"], scope: "TEAM" }
  ],
  INSPECTOR: [{ resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" }],
  MAINTENANCE_TECHNICIAN: [{ resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" }],
  WAREHOUSE_SUPERVISOR: [
    { resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT"], scope: "BUILDING" }
  ],
  VENDOR: [{ resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" }]
};
var operational = {
  PLATFORM_ADMIN: [
    { resource: "REPORT", actions: ["VIEW"], scope: "PLATFORM" },
    { resource: "NOTIFICATION", actions: ["VIEW", "UPDATE"], scope: "PLATFORM" },
    { resource: "DOCUMENT", actions: ["VIEW"], scope: "PLATFORM" },
    { resource: "VENDOR", actions: ["MANAGE"], scope: "PLATFORM" }
  ],
  FACILITY_MANAGER: [
    ...rules(["FACILITY"], ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"),
    ...rules(["BUILDING", "SPACE", "SYSTEM", "ASSET"], ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"),
    ...rules(["INSPECTION"], ["VIEW", "CREATE", "UPDATE", "APPROVE"], "FACILITY"),
    ...rules(["FINDING", "ISSUE", "INCIDENT"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"),
    ...rules(["WORK_REQUEST"], ["VIEW", "CREATE", "UPDATE", "APPROVE", "CLOSE"], "FACILITY"),
    ...rules(["WORK_ORDER"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"),
    ...rules(["EVIDENCE"], ["VIEW", "CREATE", "UPDATE", "VERIFY"], "FACILITY"),
    ...rules(["VERIFICATION"], ["VIEW", "VERIFY", "CLOSE"], "FACILITY"),
    ...rules(["PROJECT"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"),
    ...rules(["DOCUMENT"], ["VIEW", "CREATE", "UPDATE", "MANAGE", "EXPORT"], "ORGANIZATION"),
    ...rules(["COMPLIANCE"], ["VIEW", "CREATE", "UPDATE", "APPROVE", "CLOSE"], "FACILITY"),
    ...rules(["VENDOR"], ["VIEW", "CREATE", "UPDATE", "MANAGE"], "ORGANIZATION"),
    ...rules(["CONTRACT"], ["VIEW", "CREATE", "UPDATE", "APPROVE", "CLOSE"], "ORGANIZATION"),
    ...rules(["BUDGET"], ["VIEW", "CREATE", "UPDATE", "APPROVE", "EXPORT"], "FACILITY"),
    ...rules(["COST"], ["VIEW", "CREATE", "UPDATE", "EXPORT"], "FACILITY"),
    ...rules(["REPORT"], ["VIEW", "CREATE", "EXPORT"], "ORGANIZATION"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION")
  ],
  FACILITY_SUPERVISOR: [
    ...rules(["FACILITY"], ["VIEW", "UPDATE"], "FACILITY"),
    ...rules(["BUILDING", "SPACE", "SYSTEM", "ASSET"], ["VIEW", "CREATE", "UPDATE"], "FACILITY"),
    ...rules(["INSPECTION"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "VERIFY", "CLOSE"], "FACILITY"),
    ...rules(["FINDING"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "VERIFY", "CLOSE"], "FACILITY"),
    ...rules(["ISSUE"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "CLOSE"], "FACILITY"),
    ...rules(["INCIDENT"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "SUBMIT", "CLOSE"], "FACILITY"),
    ...rules(["WORK_REQUEST"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "CLOSE"], "FACILITY"),
    ...rules(["WORK_ORDER"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "VERIFY", "CLOSE"], "FACILITY"),
    ...rules(["EVIDENCE"], ["VIEW", "CREATE", "UPDATE", "VERIFY"], "FACILITY"),
    ...rules(["VERIFICATION"], ["VIEW", "CREATE", "UPDATE", "VERIFY", "CLOSE"], "FACILITY"),
    ...rules(["PROJECT"], ["VIEW", "UPDATE", "ASSIGN"], "FACILITY"),
    ...rules(["DOCUMENT"], ["VIEW", "CREATE", "UPDATE"], "FACILITY"),
    ...rules(["COMPLIANCE"], ["VIEW", "UPDATE", "SUBMIT"], "FACILITY"),
    ...rules(["VENDOR", "CONTRACT", "BUDGET", "COST"], ["VIEW"], "FACILITY"),
    ...rules(["REPORT"], ["VIEW", "CREATE", "EXPORT"], "FACILITY"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION")
  ],
  INSPECTOR: [
    ...rules(["FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET"], ["VIEW"], "FACILITY"),
    ...rules(["ASSET"], ["UPDATE"], "ASSIGNED"),
    ...rules(["INSPECTION"], ["VIEW", "CREATE", "UPDATE", "EXECUTE", "SUBMIT"], "ASSIGNED"),
    ...rules(["FINDING", "ISSUE", "INCIDENT"], ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"),
    ...rules(["WORK_REQUEST"], ["VIEW", "CREATE", "SUBMIT"], "ASSIGNED"),
    ...rules(["EVIDENCE", "DOCUMENT"], ["VIEW", "CREATE", "UPDATE"], "ASSIGNED"),
    ...rules(["VERIFICATION", "PROJECT"], ["VIEW"], "ASSIGNED"),
    ...rules(["COMPLIANCE"], ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"),
    ...rules(["REPORT"], ["VIEW", "CREATE", "EXPORT"], "ASSIGNED"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION")
  ],
  MAINTENANCE_TECHNICIAN: [
    ...rules(["FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET"], ["VIEW"], "ASSIGNED"),
    ...rules(["INSPECTION", "FINDING", "ISSUE", "INCIDENT", "WORK_REQUEST", "WORK_ORDER"], ["VIEW"], "ASSIGNED"),
    ...rules(["WORK_ORDER"], ["EXECUTE", "SUBMIT"], "ASSIGNED"),
    ...rules(["EVIDENCE"], ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"),
    ...rules(["COST"], ["CREATE"], "ASSIGNED"),
    ...rules(["PROJECT", "COMPLIANCE", "DOCUMENT", "REPORT"], ["VIEW"], "ASSIGNED"),
    ...rules(["DOCUMENT"], ["CREATE"], "ASSIGNED"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION")
  ],
  WAREHOUSE_SUPERVISOR: [
    ...rules(["FACILITY"], ["VIEW", "UPDATE"], "BUILDING"),
    ...rules(["BUILDING", "SPACE", "SYSTEM"], ["VIEW", "CREATE", "UPDATE"], "BUILDING"),
    ...rules(["ASSET"], ["VIEW", "CREATE", "UPDATE", "ASSIGN"], "BUILDING"),
    ...rules(["INSPECTION"], ["VIEW", "CREATE", "UPDATE", "EXECUTE", "SUBMIT"], "BUILDING"),
    ...rules(["FINDING", "ISSUE"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "SUBMIT"], "BUILDING"),
    ...rules(["INCIDENT"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "SUBMIT"], "BUILDING"),
    ...rules(["WORK_REQUEST", "WORK_ORDER"], ["VIEW", "CREATE", "UPDATE", "ASSIGN", "CLOSE"], "BUILDING"),
    ...rules(["WORK_ORDER", "EVIDENCE", "VERIFICATION"], ["VERIFY"], "BUILDING"),
    ...rules(["DOCUMENT", "REPORT"], ["VIEW", "CREATE", "UPDATE", "EXPORT"], "BUILDING"),
    ...rules(["PROJECT"], ["VIEW", "UPDATE"], "BUILDING"),
    ...rules(["COMPLIANCE"], ["VIEW", "UPDATE", "SUBMIT"], "BUILDING"),
    ...rules(["VENDOR", "CONTRACT", "BUDGET", "COST"], ["VIEW"], "BUILDING"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION")
  ],
  VENDOR: [
    ...rules(["FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET", "WORK_REQUEST", "WORK_ORDER"], ["VIEW"], "VENDOR_ASSIGNMENT"),
    ...rules(["WORK_ORDER"], ["EXECUTE", "SUBMIT"], "VENDOR_ASSIGNMENT"),
    ...rules(["EVIDENCE"], ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "VENDOR_ASSIGNMENT"),
    ...rules(["PROJECT", "DOCUMENT", "COMPLIANCE", "VENDOR", "CONTRACT", "COST", "REPORT"], ["VIEW"], "VENDOR_ASSIGNMENT"),
    ...rules(["DOCUMENT"], ["CREATE", "SUBMIT"], "VENDOR_ASSIGNMENT"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION")
  ]
};
function rules(resources, actions, scope) {
  return resources.map((resource) => ({ resource, actions, scope }));
}
var rolePermissionCatalog = Object.keys(foundation).flatMap((role) => [...foundation[role], ...operational[role]].flatMap(
  (rule) => rule.actions.map((action) => ({
    role,
    code: `${rule.resource}.${action}`,
    resource: rule.resource,
    action,
    scope: rule.scope,
    effect: "ALLOW"
  }))
));
var permissionCatalog = [...new Map(rolePermissionCatalog.map((item) => [
  item.code,
  {
    code: item.code,
    resource: item.resource,
    action: item.action,
    description: `${item.action} ${item.resource.toLowerCase().replaceAll("_", " ")}`
  }
])).values()];
var AUTHORIZATION_ACTIONS = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "DELETE",
  "ASSIGN",
  "EXECUTE",
  "SUBMIT",
  "APPROVE",
  "VERIFY",
  "CLOSE",
  "MANAGE",
  "EXPORT",
  "VIEW_AUDIT"
];
function isPlatformOperationalPermission(permissionCode) {
  return operationalResources.has(permissionCode.split(".")[0] ?? "");
}
function isPermissionInRoleMatrix(roleCode, permissionCode) {
  return matrix.some(([resource, role, actions]) => role === roleCode && actions.some((action) => `${resource}.${action}` === permissionCode));
}
async function roleForCode(code) {
  const [role] = await db.select().from(rolesTable).where(and(eq(rolesTable.code, code), eq(rolesTable.status, "ACTIVE")));
  return role;
}
function isRolePermissionConfigurationAllowed(roleCode, permissionCode, scopeType) {
  return matrix.some(([resource, role, actions, defaultScope]) => role === roleCode && defaultScope === scopeType && actions.some((action) => `${resource}.${action}` === permissionCode));
}
var operationalResources = /* @__PURE__ */ new Set([
  "FACILITY",
  "BUILDING",
  "SPACE",
  "SYSTEM",
  "ASSET",
  "INSPECTION",
  "FINDING",
  "ISSUE",
  "INCIDENT",
  "WORK_REQUEST",
  "WORK_ORDER",
  "EVIDENCE",
  "VERIFICATION",
  "PROJECT",
  "COMPLIANCE",
  "CONTRACT",
  "BUDGET",
  "COST"
]);
var catalogSeedPromise;
async function seedAuthorizationCatalog(options = {}) {
  if (options.force) return seedAuthorizationCatalogOnce();
  if (catalogSeedPromise) return catalogSeedPromise;
  catalogSeedPromise = seedAuthorizationCatalogOnce();
  try {
    return await catalogSeedPromise;
  } catch (error) {
    catalogSeedPromise = void 0;
    throw error;
  }
}
var AUTHORIZATION_RESOURCES = [
  "ORGANIZATION",
  "USER",
  "ROLE",
  "PERMISSION",
  "SESSION",
  "AUDIT_LOG",
  "FACILITY",
  "BUILDING",
  "SPACE",
  "SYSTEM",
  "ASSET",
  "INSPECTION",
  "FINDING",
  "ISSUE",
  "INCIDENT",
  "WORK_REQUEST",
  "WORK_ORDER",
  "EVIDENCE",
  "VERIFICATION",
  "PROJECT",
  "DOCUMENT",
  "COMPLIANCE",
  "VENDOR",
  "CONTRACT",
  "BUDGET",
  "COST",
  "REPORT",
  "NOTIFICATION"
];
async function seedAuthorizationCatalogOnce() {
  for (const code of canonicalRoleValues) {
    await db.insert(rolesTable).values({ code, description: `${code} canonical role` }).onConflictDoNothing({ target: rolesTable.code });
  }
  for (const code of canonicalPermissions) {
    const [resource, action] = code.split(".");
    await db.insert(permissionsTable).values({ code, resource, action, description: `${resource} ${action}` }).onConflictDoNothing({ target: permissionsTable.code });
  }
  const roles = await db.select().from(rolesTable);
  const permissions = await db.select().from(permissionsTable);
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
  for (const [resource, roleCode, actions, scopeType] of matrix) {
    const role = roleByCode.get(roleCode);
    if (!role) continue;
    for (const action of actions) {
      const permission = permissionByCode.get(`${resource}.${action}`);
      if (!permission) continue;
      await db.insert(rolePermissionsTable).values({
        // Production stores the canonical role in role_permissions.role.
        // Keep the registry UUID only as an API-facing identifier.
        roleId: role.code,
        permissionId: permission.id,
        defaultScopeType: scopeType,
        effect: "ALLOW"
      }).onConflictDoNothing();
    }
  }
  return { roles, permissions };
}
var matrix = [
  ["ORGANIZATION", "PLATFORM_ADMIN", ["MANAGE"], "PLATFORM"],
  ["ORGANIZATION", "FACILITY_MANAGER", ["VIEW"], "ORGANIZATION"],
  ["USER", "PLATFORM_ADMIN", ["VIEW", "MANAGE"], "PLATFORM"],
  ["USER", "FACILITY_MANAGER", ["VIEW"], "ORGANIZATION"],
  ["ROLE", "PLATFORM_ADMIN", ["MANAGE"], "PLATFORM"],
  ["PERMISSION", "PLATFORM_ADMIN", ["MANAGE"], "PLATFORM"],
  ["SESSION", "PLATFORM_ADMIN", ["MANAGE"], "PLATFORM"],
  ["SESSION", "FACILITY_MANAGER", ["VIEW"], "ORGANIZATION"],
  ["SESSION", "FACILITY_SUPERVISOR", ["VIEW"], "ORGANIZATION"],
  ["SESSION", "INSPECTOR", ["VIEW"], "ORGANIZATION"],
  ["SESSION", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ORGANIZATION"],
  ["SESSION", "WAREHOUSE_SUPERVISOR", ["VIEW"], "ORGANIZATION"],
  ["SESSION", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["AUDIT_LOG", "PLATFORM_ADMIN", ["VIEW_AUDIT", "EXPORT"], "PLATFORM"],
  ["AUDIT_LOG", "FACILITY_MANAGER", ["VIEW_AUDIT"], "ORGANIZATION"],
  ["AUDIT_LOG", "FACILITY_SUPERVISOR", ["VIEW_AUDIT"], "TEAM"],
  ["AUDIT_LOG", "WAREHOUSE_SUPERVISOR", ["VIEW_AUDIT"], "BUILDING"],
  ["FACILITY", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"],
  ["FACILITY", "FACILITY_SUPERVISOR", ["VIEW", "UPDATE"], "FACILITY"],
  ["FACILITY", "INSPECTOR", ["VIEW"], "ASSIGNED"],
  ["FACILITY", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["FACILITY", "WAREHOUSE_SUPERVISOR", ["VIEW", "UPDATE"], "BUILDING"],
  ["FACILITY", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["BUILDING", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"],
  ["BUILDING", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE"], "FACILITY"],
  ["BUILDING", "INSPECTOR", ["VIEW"], "ASSIGNED"],
  ["BUILDING", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["BUILDING", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE"], "BUILDING"],
  ["BUILDING", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["SPACE", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"],
  ["SPACE", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE"], "FACILITY"],
  ["SPACE", "INSPECTOR", ["VIEW"], "ASSIGNED"],
  ["SPACE", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["SPACE", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE"], "BUILDING"],
  ["SPACE", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["SYSTEM", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"],
  ["SYSTEM", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE"], "FACILITY"],
  ["SYSTEM", "INSPECTOR", ["VIEW"], "ASSIGNED"],
  ["SYSTEM", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["SYSTEM", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE"], "BUILDING"],
  ["SYSTEM", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["ASSET", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"],
  ["ASSET", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN"], "FACILITY"],
  ["ASSET", "INSPECTOR", ["VIEW", "UPDATE"], "ASSIGNED"],
  ["ASSET", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["ASSET", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN"], "BUILDING"],
  ["ASSET", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["INSPECTION", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "APPROVE"], "FACILITY"],
  ["INSPECTION", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "VERIFY", "CLOSE"], "TEAM"],
  ["INSPECTION", "INSPECTOR", ["VIEW", "CREATE", "UPDATE", "EXECUTE", "SUBMIT"], "ASSIGNED"],
  ["INSPECTION", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["INSPECTION", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "EXECUTE", "SUBMIT"], "BUILDING"],
  ["INSPECTION", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["FINDING", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"],
  ["FINDING", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "VERIFY", "CLOSE"], "TEAM"],
  ["FINDING", "INSPECTOR", ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"],
  ["FINDING", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["FINDING", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "SUBMIT"], "BUILDING"],
  ["FINDING", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["ISSUE", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"],
  ["ISSUE", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "CLOSE"], "TEAM"],
  ["ISSUE", "INSPECTOR", ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"],
  ["ISSUE", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["ISSUE", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "SUBMIT"], "BUILDING"],
  ["ISSUE", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["INCIDENT", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"],
  ["INCIDENT", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "SUBMIT", "CLOSE"], "TEAM"],
  ["INCIDENT", "INSPECTOR", ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"],
  ["INCIDENT", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["INCIDENT", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "SUBMIT"], "BUILDING"],
  ["WORK_REQUEST", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "APPROVE", "CLOSE"], "FACILITY"],
  ["WORK_REQUEST", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "CLOSE"], "TEAM"],
  ["WORK_REQUEST", "INSPECTOR", ["VIEW", "CREATE", "SUBMIT"], "ASSIGNED"],
  ["WORK_REQUEST", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["WORK_REQUEST", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "CLOSE"], "BUILDING"],
  ["WORK_REQUEST", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["WORK_ORDER", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"],
  ["WORK_ORDER", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "VERIFY", "CLOSE"], "TEAM"],
  ["WORK_ORDER", "INSPECTOR", ["VIEW"], "ASSIGNED"],
  ["WORK_ORDER", "MAINTENANCE_TECHNICIAN", ["VIEW", "EXECUTE", "SUBMIT"], "ASSIGNED"],
  ["WORK_ORDER", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "VERIFY", "CLOSE"], "BUILDING"],
  ["WORK_ORDER", "VENDOR", ["VIEW", "EXECUTE", "SUBMIT"], "VENDOR_ASSIGNMENT"],
  ["EVIDENCE", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "VERIFY"], "FACILITY"],
  ["EVIDENCE", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "VERIFY"], "TEAM"],
  ["EVIDENCE", "INSPECTOR", ["VIEW", "CREATE", "UPDATE"], "ASSIGNED"],
  ["EVIDENCE", "MAINTENANCE_TECHNICIAN", ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"],
  ["EVIDENCE", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "VERIFY"], "BUILDING"],
  ["EVIDENCE", "VENDOR", ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "VENDOR_ASSIGNMENT"],
  ["VERIFICATION", "FACILITY_MANAGER", ["VIEW", "VERIFY", "CLOSE"], "FACILITY"],
  ["VERIFICATION", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "VERIFY", "CLOSE"], "TEAM"],
  ["VERIFICATION", "INSPECTOR", ["VIEW"], "ASSIGNED"],
  ["VERIFICATION", "WAREHOUSE_SUPERVISOR", ["VIEW", "VERIFY", "CLOSE"], "BUILDING"],
  ["PROJECT", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "ASSIGN", "APPROVE", "CLOSE"], "FACILITY"],
  ["PROJECT", "FACILITY_SUPERVISOR", ["VIEW", "UPDATE", "ASSIGN"], "TEAM"],
  ["PROJECT", "INSPECTOR", ["VIEW"], "ASSIGNED"],
  ["PROJECT", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["PROJECT", "WAREHOUSE_SUPERVISOR", ["VIEW", "UPDATE"], "BUILDING"],
  ["PROJECT", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["DOCUMENT", "PLATFORM_ADMIN", ["VIEW"], "PLATFORM"],
  ["DOCUMENT", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "MANAGE", "EXPORT"], "FACILITY"],
  ["DOCUMENT", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "UPDATE"], "TEAM"],
  ["DOCUMENT", "INSPECTOR", ["VIEW", "CREATE", "UPDATE"], "ASSIGNED"],
  ["DOCUMENT", "MAINTENANCE_TECHNICIAN", ["VIEW", "CREATE"], "ASSIGNED"],
  ["DOCUMENT", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "UPDATE", "EXPORT"], "BUILDING"],
  ["DOCUMENT", "VENDOR", ["VIEW", "CREATE", "SUBMIT"], "VENDOR_ASSIGNMENT"],
  ["COMPLIANCE", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "APPROVE", "CLOSE"], "FACILITY"],
  ["COMPLIANCE", "FACILITY_SUPERVISOR", ["VIEW", "UPDATE", "SUBMIT"], "TEAM"],
  ["COMPLIANCE", "INSPECTOR", ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"],
  ["COMPLIANCE", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["COMPLIANCE", "WAREHOUSE_SUPERVISOR", ["VIEW", "UPDATE", "SUBMIT"], "BUILDING"],
  ["COMPLIANCE", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["VENDOR", "PLATFORM_ADMIN", ["MANAGE"], "PLATFORM"],
  ["VENDOR", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "MANAGE"], "FACILITY"],
  ["VENDOR", "FACILITY_SUPERVISOR", ["VIEW"], "TEAM"],
  ["VENDOR", "WAREHOUSE_SUPERVISOR", ["VIEW"], "BUILDING"],
  ["VENDOR", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["CONTRACT", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "APPROVE", "CLOSE"], "FACILITY"],
  ["CONTRACT", "FACILITY_SUPERVISOR", ["VIEW"], "TEAM"],
  ["CONTRACT", "WAREHOUSE_SUPERVISOR", ["VIEW"], "BUILDING"],
  ["CONTRACT", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["BUDGET", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "APPROVE", "EXPORT"], "FACILITY"],
  ["BUDGET", "FACILITY_SUPERVISOR", ["VIEW"], "TEAM"],
  ["BUDGET", "WAREHOUSE_SUPERVISOR", ["VIEW"], "BUILDING"],
  ["COST", "FACILITY_MANAGER", ["VIEW", "CREATE", "UPDATE", "EXPORT"], "FACILITY"],
  ["COST", "FACILITY_SUPERVISOR", ["VIEW"], "TEAM"],
  ["COST", "MAINTENANCE_TECHNICIAN", ["CREATE"], "ASSIGNED"],
  ["COST", "WAREHOUSE_SUPERVISOR", ["VIEW"], "BUILDING"],
  ["COST", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["REPORT", "PLATFORM_ADMIN", ["VIEW"], "PLATFORM"],
  ["REPORT", "FACILITY_MANAGER", ["VIEW", "CREATE", "EXPORT"], "FACILITY"],
  ["REPORT", "FACILITY_SUPERVISOR", ["VIEW", "CREATE", "EXPORT"], "TEAM"],
  ["REPORT", "INSPECTOR", ["VIEW", "CREATE", "EXPORT"], "ASSIGNED"],
  ["REPORT", "MAINTENANCE_TECHNICIAN", ["VIEW"], "ASSIGNED"],
  ["REPORT", "WAREHOUSE_SUPERVISOR", ["VIEW", "CREATE", "EXPORT"], "BUILDING"],
  ["REPORT", "VENDOR", ["VIEW"], "VENDOR_ASSIGNMENT"],
  ["NOTIFICATION", "PLATFORM_ADMIN", ["VIEW", "UPDATE"], "PLATFORM"],
  ["NOTIFICATION", "FACILITY_MANAGER", ["VIEW", "UPDATE"], "ORGANIZATION"],
  ["NOTIFICATION", "FACILITY_SUPERVISOR", ["VIEW", "UPDATE"], "TEAM"],
  ["NOTIFICATION", "INSPECTOR", ["VIEW", "UPDATE"], "ASSIGNED"],
  ["NOTIFICATION", "MAINTENANCE_TECHNICIAN", ["VIEW", "UPDATE"], "ASSIGNED"],
  ["NOTIFICATION", "WAREHOUSE_SUPERVISOR", ["VIEW", "UPDATE"], "BUILDING"],
  ["NOTIFICATION", "VENDOR", ["VIEW", "UPDATE"], "VENDOR_ASSIGNMENT"]
];
var canonicalPermissions = [...new Set(
  matrix.flatMap(([resource, _role, actions]) => actions.map((action) => `${resource}.${action}`))
)];
var roleCapabilityRows = matrix;
export {
  AUTHORIZATION_ACTIONS,
  AUTHORIZATION_RESOURCES,
  canonicalPermissions,
  isPermissionInRoleMatrix,
  isPlatformOperationalPermission,
  isRolePermissionConfigurationAllowed,
  permissionCatalog,
  roleCapabilityRows,
  roleForCode,
  rolePermissionCatalog,
  seedAuthorizationCatalog
};
