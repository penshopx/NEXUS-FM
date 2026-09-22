import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  authorizationAuditLogsTable,
  writableBindingStatusValues,
  db,
  membershipsTable,
  organizationsTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  teamsTable,
  userRoleBindingsTable,
  usersTable,
  vendorAssignmentsTable,
  scopeTypeValues,
} from "@workspace/db";
import { canonicalPermissions } from "./authorization-catalog";
import { isBindingScopeCompatible as isSharedBindingScopeCompatible } from "@workspace/api-zod";

export const AUTHORIZATION_REASON_CODES = [
  "ALLOWED", "UNAUTHENTICATED", "USER_INACTIVE", "ORGANIZATION_MISMATCH",
  "ROLE_MISSING", "PERMISSION_MISSING", "SCOPE_MISMATCH", "BINDING_INACTIVE",
  "DOMAIN_RULE_DENIED", "RESOURCE_NOT_FOUND", "EXPLICIT_DENY",
] as const;
export type AuthorizationReasonCode = typeof AUTHORIZATION_REASON_CODES[number];

export type AuthorizationRequest = {
  actorUserId?: string | null;
  organizationId?: string | null;
  permission: string;
  resourceType: string;
  resourceId?: string;
  actionContext?: Record<string, unknown>;
  /** Only populated by trusted server-side resource resolvers. */
  verifiedContext?: Record<string, unknown>;
  requestId?: string;
  /** Trusted read-only checks can suppress decision auditing when no action is taken. */
  auditDecision?: boolean;
  /** Trusted transaction connection used by mutation services. */
  database?: any;
  /**
   * Trusted bulk-import bootstrap. This only lets an organization binding use
   * its existing CREATE grant for descendants of a facility that the same
   * transaction has just been authorized to create.
   */
  allowImportedFacilityDescendantBootstrap?: boolean;
};

export type AuthorizationDecision = {
  allowed: boolean;
  reasonCode: AuthorizationReasonCode;
  permission: string;
  scopeType?: string;
};

type WorkScopeResolution =
  | { found: false }
  | { found: true; verifiedContext: Record<string, unknown> };

async function resolveActiveWorkScope(
  database: typeof db,
  table: typeof teamsTable | typeof vendorAssignmentsTable,
  organizationId: string,
  targetId: string,
) {
  const [target] = await database.select({ id: table.id })
    .from(table)
    .where(and(
      eq(table.id, targetId),
      eq(table.organizationId, organizationId),
      eq(table.status, "ACTIVE"),
    ));
  return target;
}

export async function resolveTeamWorkScope(
  database: typeof db,
  organizationId: string,
  teamId: string,
): Promise<WorkScopeResolution> {
  const team = await resolveActiveWorkScope(database, teamsTable, organizationId, teamId);
  if (!team) return { found: false };
  return {
    found: true,
    verifiedContext: {
      organizationId,
      teamId: team.id,
      scopeVerified: true,
    },
  };
}

export async function resolveVendorAssignmentWorkScope(
  database: typeof db,
  organizationId: string,
  vendorAssignmentId: string,
  vendorUserId: string,
): Promise<WorkScopeResolution> {
  const assignment = await resolveActiveWorkScope(
    database,
    vendorAssignmentsTable,
    organizationId,
    vendorAssignmentId,
  );
  if (!assignment) return { found: false };
  return {
    found: true,
    verifiedContext: {
      organizationId,
      vendorAssignmentId: assignment.id,
      vendorUserId,
      scopeVerified: true,
    },
  };
}

export class AuthorizationError extends Error {
  constructor(public readonly reasonCode: AuthorizationReasonCode) {
    super(`Authorization denied: ${reasonCode}`);
    this.name = "AuthorizationError";
  }
}

export function requireAuthenticatedUser(actorUserId?: string | null) {
  if (!actorUserId) throw new AuthorizationError("UNAUTHENTICATED");
  return actorUserId;
}

export function getAuthorizationContext(input: {
  actorUserId?: string | null;
  organizationId?: string | null;
}) {
  return {
    actorUserId: input.actorUserId ?? null,
    organizationId: input.organizationId ?? null,
  };
}

export function assertOrganizationScope(resourceOrganizationId: string | undefined, organizationId: string) {
  if (resourceOrganizationId && resourceOrganizationId !== organizationId) {
    throw new AuthorizationError("ORGANIZATION_MISMATCH");
  }
}

export function requireScope(decision: AuthorizationDecision) {
  if (!decision.allowed) throw new AuthorizationError(decision.reasonCode);
  return decision.scopeType;
}

export function isSelfRoleEscalation(actorUserId: string, targetUserId: string) {
  return actorUserId === targetUserId;
}

const objectBindingScopes = new Set([
  "FACILITY", "BUILDING", "SPACE", "ASSET", "ASSIGNED", "TEAM",
  "VENDOR_ASSIGNMENT", "OWNED_REQUEST",
]);

export type RoleBindingState = {
  scopeType: string;
  scopeId: string | null;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type RoleBindingStateValidation =
  | { valid: true; state: RoleBindingState }
  | { valid: false; error: string };

/**
 * Validates the complete state, rather than only the fields present in a
 * request. Both create and update routes use this after applying defaults or
 * merging a patch, so invalid state cannot be persisted or audited.
 */
export function validateRoleBindingState(input: {
  scopeType: unknown;
  scopeId: unknown;
  status: unknown;
  startsAt: unknown;
  endsAt: unknown;
  now?: Date;
}): RoleBindingStateValidation {
  const now = input.now ?? new Date();
  if (typeof input.scopeType !== "string" || !scopeTypeValues.includes(input.scopeType as never)) {
    return { valid: false, error: "scopeType must be a valid authorization scope" };
  }
  if (typeof input.status !== "string" || !writableBindingStatusValues.includes(input.status as never)) {
    return { valid: false, error: "status must be ACTIVE, SUSPENDED, or EXPIRED" };
  }
  let scopeId: string | null = null;
  if (input.scopeId !== null && input.scopeId !== undefined) {
    if (typeof input.scopeId !== "string" || !input.scopeId.trim()) {
      return { valid: false, error: "scopeId must be a non-empty string" };
    }
    scopeId = input.scopeId;
  }
  if (objectBindingScopes.has(input.scopeType) && !scopeId) {
    return { valid: false, error: `${input.scopeType} scope requires scopeId` };
  }
  const parseDate = (value: unknown, field: string): Date | null | string => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" && !(value instanceof Date)) return `${field} must be an ISO date`;
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? `${field} must be a valid date` : parsed;
  };
  const startsAt = parseDate(input.startsAt, "startsAt");
  const endsAt = parseDate(input.endsAt, "endsAt");
  if (typeof startsAt === "string") return { valid: false, error: startsAt };
  if (typeof endsAt === "string") return { valid: false, error: endsAt };
  if (startsAt && endsAt && startsAt >= endsAt) {
    return { valid: false, error: "startsAt must be earlier than endsAt" };
  }
  if (input.status === "ACTIVE" && endsAt && endsAt <= now) {
    return { valid: false, error: "ACTIVE bindings cannot already be ended" };
  }
  if (input.status === "EXPIRED" && (!endsAt || endsAt > now)) {
    return { valid: false, error: "EXPIRED bindings require an end time in the past" };
  }
  return { valid: true, state: { scopeType: input.scopeType, scopeId, status: input.status, startsAt, endsAt } };
}

export function isBindingScopeCompatible(defaultScope: string, bindingScope: string) {
  if (!scopeTypeValues.includes(defaultScope as never) ||
      !scopeTypeValues.includes(bindingScope as never)) {
    return false;
  }
  return isSharedBindingScopeCompatible(defaultScope as typeof scopeTypeValues[number], bindingScope as typeof scopeTypeValues[number]);
}

function redactAuditState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAuditState);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/(password|token|secret|cookie|credential)/i.test(key))
      .map(([key, child]) => [key, redactAuditState(child)]));
  }
  return value;
}

export async function recordAuthorizationConfigurationAudit(input: {
  actorUserId: string;
  organizationId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  reasonCode: string;
  requestId?: string;
}) {
  await db.insert(authorizationAuditLogsTable).values({
    actorUserId: input.actorUserId,
    organizationId: input.organizationId ?? null,
    permission: input.action,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    decision: "ALLOW",
    reasonCode: input.reasonCode,
    beforeState: input.beforeState === undefined ? null : JSON.stringify(redactAuditState(input.beforeState)),
    afterState: input.afterState === undefined ? null : JSON.stringify(redactAuditState(input.afterState)),
    requestId: input.requestId ?? null,
  });
}

function stringValue(context: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof context[key] === "string") return context[key];
  }
  return undefined;
}

async function auditDecision(request: AuthorizationRequest, decision: AuthorizationDecision) {
  // Only authorization-safe fields are persisted. Request bodies, credentials,
  // tokens and arbitrary client context are intentionally never recorded.
  if (!request.actorUserId || request.auditDecision === false) return;
  await (request.database ?? db).insert(authorizationAuditLogsTable).values({
    actorUserId: request.actorUserId,
    organizationId: request.organizationId ?? null,
    permission: request.permission,
    action: request.permission.split(".")[1] ?? "UNKNOWN",
    resource: request.resourceType,
    resourceId: request.resourceId ?? null,
    decision: decision.allowed ? "ALLOW" : "DENY",
    reasonCode: decision.reasonCode,
    scopeEvaluated: decision.scopeType ?? null,
    requestId: request.requestId ?? null,
  });
}

function denied(request: AuthorizationRequest, reasonCode: AuthorizationReasonCode): AuthorizationDecision {
  return { allowed: false, reasonCode, permission: request.permission };
}

export async function authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
  const database = request.database ?? db;
  const permission = request.permission;
  // Client supplied actionContext is intentionally diagnostic only. It never
  // proves an object relationship or assignment; services must supply a
  // server-resolved verifiedContext.
  const context = request.verifiedContext ?? {};
  const denyAndAudit = async (reasonCode: AuthorizationReasonCode) => {
    const decision = denied(request, reasonCode);
    await auditDecision(request, decision);
    return decision;
  };
  if (!request.actorUserId) return denyAndAudit("UNAUTHENTICATED");
  const [permissionResource, permissionAction] = permission.split(".");
  if (permissionResource !== request.resourceType || !permissionAction) {
    return denyAndAudit("PERMISSION_MISSING");
  }
  if (!canonicalPermissions.includes(permission as never)) {
    return denyAndAudit("PERMISSION_MISSING");
  }
  // Mutation callers hold these locks through the registry write and both
  // audit records. Revocation and policy updates therefore linearize either
  // before this decision or after the mutation commits.
  if (request.database && request.actorUserId && request.organizationId) {
    await lockAuthorizationState(database, request.actorUserId, request.organizationId);
  }
   const [user] = await database.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, request.actorUserId), eq(usersTable.isActive, true)));
  if (!user) return denyAndAudit("USER_INACTIVE");
  if (!request.organizationId) return denyAndAudit("ORGANIZATION_MISMATCH");
   const [organization] = await database.select({ id: organizationsTable.id }).from(organizationsTable).where(and(eq(organizationsTable.id, request.organizationId), eq(organizationsTable.isActive, true)));
  if (!organization) return denyAndAudit("ORGANIZATION_MISMATCH");
   const [membership] = await database.select({ userId: membershipsTable.userId })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, request.actorUserId), eq(membershipsTable.organizationId, request.organizationId), eq(membershipsTable.isActive, true)));
  if (!membership) return denyAndAudit("ORGANIZATION_MISMATCH");

  const now = new Date();
   const bindings = await database.select({
     binding: userRoleBindingsTable,
   }).from(userRoleBindingsTable)
    .where(and(
      eq(userRoleBindingsTable.userId, request.actorUserId),
      eq(userRoleBindingsTable.organizationId, request.organizationId),
      eq(userRoleBindingsTable.status, "ACTIVE"),
      or(isNull(userRoleBindingsTable.startsAt), lte(userRoleBindingsTable.startsAt, now)),
      or(isNull(userRoleBindingsTable.endsAt), gt(userRoleBindingsTable.endsAt, now)),
    ));
  if (!bindings.length) {
    return denyAndAudit("BINDING_INACTIVE");
  }

   const grants = await database.select({
    permission: permissionsTable,
    rolePermission: rolePermissionsTable,
    binding: userRoleBindingsTable,
  }).from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
     .innerJoin(rolesTable, and(
       sql`${rolePermissionsTable.roleId} = ${rolesTable.code}::canonical_role`,
       eq(rolesTable.status, "ACTIVE"),
     ))
     .innerJoin(userRoleBindingsTable, eq(rolePermissionsTable.roleId, userRoleBindingsTable.roleId))
    .where(and(
      eq(permissionsTable.code, permission),
      eq(permissionsTable.status, "ACTIVE"),
      eq(userRoleBindingsTable.userId, request.actorUserId),
      eq(userRoleBindingsTable.organizationId, request.organizationId),
      eq(userRoleBindingsTable.status, "ACTIVE"),
    ));
  const activeGrants = grants.filter(({ binding }: { binding: any }) => {
    const state = validateRoleBindingState({
      scopeType: binding.scopeType,
      scopeId: binding.scopeId,
      status: binding.status,
      startsAt: binding.startsAt,
      endsAt: binding.endsAt,
      now,
    });
    return state.valid &&
      (!binding.startsAt || binding.startsAt <= now) &&
      (!binding.endsAt || binding.endsAt > now);
  });
  const denies = activeGrants.filter(({ rolePermission }: { rolePermission: any }) => rolePermission.effect === "DENY");
  if (denies.length) {
    const decision = { ...denied(request, "EXPLICIT_DENY"), scopeType: denies[0]?.rolePermission.defaultScopeType };
    await auditDecision(request, decision);
    return decision;
  }
  if (!activeGrants.length) {
    return denyAndAudit("PERMISSION_MISSING");
  }

  const resourceOrganizationId = stringValue(context, "organizationId", "resourceOrganizationId");
  if (resourceOrganizationId && resourceOrganizationId !== request.organizationId) {
    const decision = denied(request, "ORGANIZATION_MISMATCH");
    await auditDecision(request, decision);
    return decision;
  }
  for (const grant of activeGrants) {
    const defaultScope = grant.rolePermission.defaultScopeType;
    // A broad binding cannot satisfy an operational permission. Operational
    // defaults require a compatible explicit binding at the same or narrower
    // scope; the verified object context is still required below.
    const facilityRegistrationBootstrap =
      request.resourceType === "FACILITY" &&
      permission === "FACILITY.CREATE" &&
      grant.binding.scopeType === "ORGANIZATION";
    const importedFacilityDescendantBootstrap =
      request.allowImportedFacilityDescendantBootstrap === true &&
      request.resourceType !== "FACILITY" &&
      grant.binding.scopeType === "ORGANIZATION" &&
      defaultScope === "FACILITY";
    if (grant.binding.scopeType === "ORGANIZATION" &&
      !["ORGANIZATION"].includes(defaultScope) &&
      !facilityRegistrationBootstrap &&
      !importedFacilityDescendantBootstrap) continue;
    if (grant.binding.scopeType === "PLATFORM" && defaultScope !== "PLATFORM") continue;
    const bindingScope = grant.binding.scopeType;
    const bindingScopeId = grant.binding.scopeId;
    const objectProof = context.scopeVerified === true &&
      stringValue(context, "organizationId", "resourceOrganizationId") === request.organizationId;
    const restrictedResources = ["ORGANIZATION", "USER", "ROLE", "PERMISSION", "SESSION", "AUDIT_LOG", "DOCUMENT", "REPORT", "NOTIFICATION"];
    const contextScopeId = (scope: string) => {
      const exactScopeId = stringValue(context, `${scope.toLowerCase()}Id`);
      if (exactScopeId) return exactScopeId;
      const registryResources = ["FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET"];
      if (registryResources.includes(request.resourceType) && request.resourceType !== scope) return undefined;
      return request.resourceId ?? stringValue(context, "scopeId", "resourceScopeId");
    };
    // Facility registration is the one bootstrap operation that is necessarily
    // performed before a facility binding can exist. An organization binding
    // may therefore create a new facility, but it still cannot view or mutate
    // an existing facility outside an explicit facility binding.
    if (!facilityRegistrationBootstrap &&
      !importedFacilityDescendantBootstrap &&
      !isBindingScopeCompatible(defaultScope, bindingScope)) continue;
    const evaluateScope = (scope: string, scopeId?: string | null, bindingRestriction = false) => {
      if (scope === "PLATFORM") return restrictedResources.includes(request.resourceType);
      if (scope === "ORGANIZATION") return true;
      if (["FACILITY", "BUILDING", "SPACE", "ASSET", "PORTFOLIO"].includes(scope)) {
        const requestedScopeId = contextScopeId(scope);
        if (!bindingRestriction) return objectProof && Boolean(requestedScopeId);
        const bindingObjectId = contextScopeId(bindingScope);
        return objectProof && Boolean(scopeId) && Boolean(requestedScopeId) && scopeId === bindingObjectId;
      }
      if (scope === "ASSIGNED") {
        const assignedToActor = objectProof &&
          stringValue(context, "assignedUserId", "assigneeUserId") === request.actorUserId;
        if (!bindingRestriction) return assignedToActor;
        const assignmentScopeId = request.resourceId ??
          stringValue(context, "assignmentId", "resourceScopeId", "scopeId");
        return assignedToActor && Boolean(scopeId) && assignmentScopeId === scopeId;
      }
      if (scope === "TEAM") {
        const teamId = stringValue(context, "teamId");
        return objectProof && Boolean(teamId) &&
          (!bindingRestriction || (Boolean(scopeId) && teamId === scopeId));
      }
      if (scope === "VENDOR_ASSIGNMENT") {
        const vendorRelated =
          stringValue(context, "vendorUserId", "assignedVendorId") === request.actorUserId;
        if (!bindingRestriction) return objectProof && vendorRelated;
        return objectProof && vendorRelated && Boolean(scopeId) &&
          stringValue(context, "vendorAssignmentId") === scopeId;
      }
      if (scope === "OWNED_REQUEST") {
        const ownedByActor = objectProof &&
          stringValue(context, "ownerUserId", "createdByUserId") === request.actorUserId;
        if (!bindingRestriction) return ownedByActor;
        const ownedScopeId = request.resourceId ?? stringValue(context, "resourceScopeId", "scopeId");
        return ownedByActor && Boolean(scopeId) && ownedScopeId === scopeId;
      }
      return false;
    };
    // The effective decision is the intersection of the permission minimum
    // and the binding restriction. Neither side can broaden the other.
    const inScope = evaluateScope(defaultScope) &&
      evaluateScope(bindingScope, bindingScopeId, true);
    if (inScope) {
      const decision = { allowed: true, reasonCode: "ALLOWED" as const, permission, scopeType: bindingScope === "ORGANIZATION" ? defaultScope : bindingScope };
      await auditDecision(request, decision);
      return decision;
    }
  }
  const decision = denied(request, "SCOPE_MISMATCH");
  await auditDecision(request, decision);
  return decision;
}

export function requirePermission(permission: string) {
  return async (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const actorUserId = (req as import("express").Request & { appUserId?: string }).appUserId;
    const organizationId = (req as import("express").Request & { activeOrganizationId?: string }).activeOrganizationId;
    const decision = await authorize({ actorUserId, organizationId, permission, resourceType: permission.split(".")[0] ?? "UNKNOWN", requestId: String(req.id) });
    if (!decision.allowed) {
      res.status(actorUserId ? 403 : 401).json({ error: "Authorization denied", reasonCode: decision.reasonCode });
      return;
    }
    next();
  };
}

export function canCrossOrganizationFoundation(scopeType: string | undefined, activeOrganizationId: string | undefined, targetOrganizationId: string) {
  return scopeType === "PLATFORM" || activeOrganizationId === targetOrganizationId;
}

async function lockAuthorizationState(database: any, actorUserId: string, organizationId: string) {
  const lock = async (query: any) => typeof query.for === "function" ? query.for("update") : query;
  const [user] = await lock(database.select().from(usersTable).where(eq(usersTable.id, actorUserId)).orderBy(asc(usersTable.id)));
  const [organization] = await lock(database.select().from(organizationsTable).where(eq(organizationsTable.id, organizationId)).orderBy(asc(organizationsTable.id)));
  const memberships = await lock(database.select().from(membershipsTable).where(and(
    eq(membershipsTable.userId, actorUserId),
    eq(membershipsTable.organizationId, organizationId),
  )).orderBy(asc(membershipsTable.userId), asc(membershipsTable.organizationId)));
  const bindings = await lock(database.select().from(userRoleBindingsTable).where(and(
    eq(userRoleBindingsTable.userId, actorUserId),
    eq(userRoleBindingsTable.organizationId, organizationId),
  )).orderBy(asc(userRoleBindingsTable.id)));
   const roleCodes: string[] = Array.from(new Set<string>(bindings.map((binding: any) => binding.roleId as string))).sort();
   const rolePermissions = roleCodes.length
      ? await lock(database.select().from(rolePermissionsTable)
        .innerJoin(rolesTable, and(
          sql`${rolePermissionsTable.roleId} = ${rolesTable.code}::canonical_role`,
          eq(rolesTable.status, "ACTIVE"),
        ))
        .where(inArray(rolePermissionsTable.roleId, roleCodes as any))
       .orderBy(asc(rolePermissionsTable.roleId), asc(rolePermissionsTable.permissionId), asc(rolePermissionsTable.defaultScopeType)))
    : [];
  const permissionIds: string[] = Array.from(new Set<string>(rolePermissions.map((permission: any) => permission.permissionId as string))).sort();
  const permissions = permissionIds.length
    ? await lock(database.select().from(permissionsTable).where(inArray(permissionsTable.id, permissionIds)).orderBy(asc(permissionsTable.id)))
    : [];
   return { user, organization, memberships, bindings, rolePermissions, permissions };
}

export function authorizationProbeAvailable(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

export async function listUserPermissions(userId: string, organizationId: string) {
   const rows = await db.select({
     permission: permissionsTable,
     binding: userRoleBindingsTable,
     rolePermission: rolePermissionsTable,
   }).from(userRoleBindingsTable)
     .innerJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, userRoleBindingsTable.roleId))
     .innerJoin(rolesTable, and(
       sql`${rolePermissionsTable.roleId} = ${rolesTable.code}::canonical_role`,
       eq(rolesTable.status, "ACTIVE"),
     ))
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(and(
      eq(userRoleBindingsTable.userId, userId),
      eq(userRoleBindingsTable.organizationId, organizationId),
      eq(userRoleBindingsTable.status, "ACTIVE"),
      eq(permissionsTable.status, "ACTIVE"),
      or(isNull(userRoleBindingsTable.startsAt), lte(userRoleBindingsTable.startsAt, new Date())),
      or(isNull(userRoleBindingsTable.endsAt), gt(userRoleBindingsTable.endsAt, new Date())),
    ));
  const result = new Map<string, { code: string; scopeType: string; effect: string }>();
  for (const row of rows) {
    const bindingState = validateRoleBindingState({
      scopeType: row.binding.scopeType,
      scopeId: row.binding.scopeId,
      status: row.binding.status,
      startsAt: row.binding.startsAt,
      endsAt: row.binding.endsAt,
    });
    if (!bindingState.valid) continue;
    if (!isBindingScopeCompatible(row.rolePermission.defaultScopeType, row.binding.scopeType)) continue;
    const current = result.get(row.permission.code);
    if (row.rolePermission.effect === "DENY") {
      result.set(row.permission.code, { code: row.permission.code, scopeType: row.binding.scopeType, effect: "DENY" });
    } else if (!current || current.effect !== "DENY") {
      result.set(row.permission.code, { code: row.permission.code, scopeType: row.binding.scopeType, effect: "ALLOW" });
    }
  }
  return [...result.values()].filter((permission) => permission.effect !== "DENY");
}