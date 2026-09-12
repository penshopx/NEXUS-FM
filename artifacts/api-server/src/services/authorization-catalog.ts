import {
  canonicalRoleValues,
  db,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  type AuthorizationRole,
  type Permission,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type CanonicalRole = (typeof canonicalRoleValues)[number];
export type ScopeType =
  | "PLATFORM" | "ORGANIZATION" | "PORTFOLIO" | "FACILITY" | "BUILDING"
  | "SPACE" | "ASSET" | "ASSIGNED" | "TEAM" | "VENDOR_ASSIGNMENT"
  | "OWNED_REQUEST";

type RoleRule = {
  resource: string;
  actions: string[];
  scope: ScopeType;
};

const foundation: Record<CanonicalRole, RoleRule[]> = {
  PLATFORM_ADMIN: [
    { resource: "ORGANIZATION", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "USER", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "ROLE", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "PERMISSION", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "SESSION", actions: ["MANAGE"], scope: "PLATFORM" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT", "EXPORT"], scope: "PLATFORM" },
  ],
  FACILITY_MANAGER: [
    { resource: "ORGANIZATION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "USER", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT"], scope: "ORGANIZATION" },
  ],
  FACILITY_SUPERVISOR: [
    { resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT"], scope: "TEAM" },
  ],
  INSPECTOR: [{ resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" }],
  MAINTENANCE_TECHNICIAN: [{ resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" }],
  WAREHOUSE_SUPERVISOR: [
    { resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" },
    { resource: "AUDIT_LOG", actions: ["VIEW_AUDIT"], scope: "BUILDING" },
  ],
  VENDOR: [{ resource: "SESSION", actions: ["VIEW"], scope: "ORGANIZATION" }],
};

const operational: Record<CanonicalRole, RoleRule[]> = {
  PLATFORM_ADMIN: [
    { resource: "REPORT", actions: ["VIEW"], scope: "PLATFORM" },
    { resource: "NOTIFICATION", actions: ["VIEW", "UPDATE"], scope: "PLATFORM" },
    { resource: "DOCUMENT", actions: ["VIEW"], scope: "PLATFORM" },
    { resource: "VENDOR", actions: ["MANAGE"], scope: "PLATFORM" },
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
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION"),
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
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION"),
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
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION"),
  ],
  MAINTENANCE_TECHNICIAN: [
    ...rules(["FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET"], ["VIEW"], "ASSIGNED"),
    ...rules(["INSPECTION", "FINDING", "ISSUE", "INCIDENT", "WORK_REQUEST", "WORK_ORDER"], ["VIEW"], "ASSIGNED"),
    ...rules(["WORK_ORDER"], ["EXECUTE", "SUBMIT"], "ASSIGNED"),
    ...rules(["EVIDENCE"], ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "ASSIGNED"),
    ...rules(["COST"], ["CREATE"], "ASSIGNED"),
    ...rules(["PROJECT", "COMPLIANCE", "DOCUMENT", "REPORT"], ["VIEW"], "ASSIGNED"),
    ...rules(["DOCUMENT"], ["CREATE"], "ASSIGNED"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION"),
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
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION"),
  ],
  VENDOR: [
    ...rules(["FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET", "WORK_REQUEST", "WORK_ORDER"], ["VIEW"], "VENDOR_ASSIGNMENT"),
    ...rules(["WORK_ORDER"], ["EXECUTE", "SUBMIT"], "VENDOR_ASSIGNMENT"),
    ...rules(["EVIDENCE"], ["VIEW", "CREATE", "UPDATE", "SUBMIT"], "VENDOR_ASSIGNMENT"),
    ...rules(["PROJECT", "DOCUMENT", "COMPLIANCE", "VENDOR", "CONTRACT", "COST", "REPORT"], ["VIEW"], "VENDOR_ASSIGNMENT"),
    ...rules(["DOCUMENT"], ["CREATE", "SUBMIT"], "VENDOR_ASSIGNMENT"),
    ...rules(["NOTIFICATION"], ["VIEW", "UPDATE"], "ORGANIZATION"),
  ],
};

function rules(resources: string[], actions: string[], scope: ScopeType): RoleRule[] {
  return resources.map((resource) => ({ resource, actions, scope }));
}

export const rolePermissionCatalog = (Object.keys(foundation) as CanonicalRole[])
  .flatMap((role) => [...foundation[role], ...operational[role]].flatMap((rule) =>
    rule.actions.map((action) => ({
      role,
      code: `${rule.resource}.${action}`,
      resource: rule.resource,
      action,
      scope: rule.scope,
      effect: "ALLOW" as const,
    })),
  ));

export const permissionCatalog = [...new Map(rolePermissionCatalog.map((item) => [
  item.code,
  {
    code: item.code,
    resource: item.resource,
    action: item.action,
    description: `${item.action} ${item.resource.toLowerCase().replaceAll("_", " ")}`,
  },
])).values()];

export const AUTHORIZATION_ACTIONS = [
  "VIEW", "CREATE", "UPDATE", "DELETE", "ASSIGN", "EXECUTE", "SUBMIT",
  "APPROVE", "VERIFY", "CLOSE", "MANAGE", "EXPORT", "VIEW_AUDIT",
] as const;

export type AuthorizationAction = typeof AUTHORIZATION_ACTIONS[number];

type MatrixRow = readonly [AuthorizationResource, string, AuthorizationAction[], string];

export function isPlatformOperationalPermission(permissionCode: string) {
  return operationalResources.has(permissionCode.split(".")[0] ?? "");
}

export function isPermissionInRoleMatrix(roleCode: string, permissionCode: string) {
  return matrix.some(([resource, role, actions]) =>
    role === roleCode && actions.some((action) => `${resource}.${action}` === permissionCode));
}

export async function roleForCode(code: string): Promise<AuthorizationRole | undefined> {
  const [role] = await db.select().from(rolesTable).where(and(eq(rolesTable.code, code), eq(rolesTable.status, "ACTIVE")));
  return role;
}

export type PermissionCode = `${AuthorizationResource}.${AuthorizationAction}`;

export function isRolePermissionConfigurationAllowed(roleCode: string, permissionCode: string, scopeType: string) {
  return matrix.some(([resource, role, actions, defaultScope]) =>
    role === roleCode && defaultScope === scopeType &&
    actions.some((action) => `${resource}.${action}` === permissionCode));
}

const operationalResources = new Set([
  "FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET", "INSPECTION", "FINDING",
  "ISSUE", "INCIDENT", "WORK_REQUEST", "WORK_ORDER", "EVIDENCE", "VERIFICATION",
  "PROJECT", "COMPLIANCE", "CONTRACT", "BUDGET", "COST",
]);

let catalogSeedPromise: Promise<{ roles: AuthorizationRole[]; permissions: Permission[] }> | undefined;

export async function seedAuthorizationCatalog(options: { force?: boolean } = {}) {
  if (options.force) return seedAuthorizationCatalogOnce();
  if (catalogSeedPromise) return catalogSeedPromise;
  catalogSeedPromise = seedAuthorizationCatalogOnce();
  try {
    return await catalogSeedPromise;
  } catch (error) {
    catalogSeedPromise = undefined;
    throw error;
  }
}

export const AUTHORIZATION_RESOURCES = [
  "ORGANIZATION", "USER", "ROLE", "PERMISSION", "SESSION", "AUDIT_LOG",
  "FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET", "INSPECTION",
  "FINDING", "ISSUE", "INCIDENT", "WORK_REQUEST", "WORK_ORDER", "EVIDENCE",
  "VERIFICATION", "PROJECT", "DOCUMENT", "COMPLIANCE", "VENDOR", "CONTRACT",
  "BUDGET", "COST", "REPORT", "NOTIFICATION",
] as const;

export type AuthorizationResource = typeof AUTHORIZATION_RESOURCES[number];

async function seedAuthorizationCatalogOnce() {
  for (const code of canonicalRoleValues) {
    await db.insert(rolesTable).values({ code, description: `${code} canonical role` }).onConflictDoNothing({ target: rolesTable.code });
  }
  for (const code of canonicalPermissions) {
    const [resource, action] = code.split(".") as [AuthorizationResource, AuthorizationAction];
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
        roleId: role.id,
        permissionId: permission.id,
        defaultScopeType: scopeType as "PLATFORM",
        effect: "ALLOW",
      }).onConflictDoNothing();
    }
  }
  return { roles, permissions };
}

const matrix: MatrixRow[] = [
  ["ORGANIZATION", "PLATFORM_ADMIN", ["MANAGE"], "PLATFORM"],
  ["ORGANIZATION", "FACILITY_MANAGER", ["VIEW"], "ORGANIZATION"],
  ["USER", "PLATFORM_ADMIN", ["MANAGE"], "PLATFORM"],
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
  ["NOTIFICATION", "VENDOR", ["VIEW", "UPDATE"], "VENDOR_ASSIGNMENT"],
];

export const canonicalPermissions = [...new Set(
  matrix.flatMap(([resource, _role, actions]) => actions.map((action) => `${resource}.${action}`)),
)] as PermissionCode[];

export const roleCapabilityRows = matrix;
