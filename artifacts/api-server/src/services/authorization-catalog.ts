import type { canonicalRoleValues } from "@workspace/db";

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
    ...rules(["FACILITY"], ["VIEW", "UPDATE", "MANAGE"], "FACILITY"),
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