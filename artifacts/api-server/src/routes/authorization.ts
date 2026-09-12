import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, ilike, isNull, lte, or } from "drizzle-orm";
import {
  authorizationAuditLogsTable,
  canonicalRoleValues,
  db,
  membershipsTable,
  organizationsTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  scopeTypeValues,
  userContextsTable,
  userRoleBindingsTable,
  usersTable,
} from "@workspace/db";
import { currentUser as defaultCurrentUser } from "./foundation";
import {
  authorize,
  authorizationProbeAvailable,
  canCrossOrganizationFoundation,
  isSelfRoleEscalation,
  listUserPermissions,
  validateRoleBindingState,
} from "../services/authorization";
import {
  isPermissionInRoleMatrix,
  isRolePermissionConfigurationAllowed,
  isPlatformOperationalPermission,
  roleCapabilityRows,
} from "../services/authorization-catalog";

type PermissionUpdate = { permissionId: string; defaultScopeType?: string; effect?: string };

function bindingAuditState(input: Record<string, unknown>) {
  return {
    userId: typeof input.userId === "string" ? input.userId : undefined,
    organizationId: typeof input.organizationId === "string" ? input.organizationId : undefined,
    roleId: typeof input.roleId === "string" ? input.roleId : undefined,
    scopeType: typeof input.scopeType === "string" ? input.scopeType : undefined,
    scopeId: typeof input.scopeId === "string" ? input.scopeId : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    startsAt: typeof input.startsAt === "string" ? input.startsAt : undefined,
    endsAt: typeof input.endsAt === "string" ? input.endsAt : undefined,
  };
}

export type AuthorizationRouteDependencies = {
  currentUser?: typeof defaultCurrentUser;
  db?: typeof db;
};

export async function getActiveOrganizationId(userId: string, database = db) {
  const [context] = await database.select({ organizationId: userContextsTable.activeOrganizationId })
    .from(userContextsTable)
    .where(eq(userContextsTable.userId, userId));
  return context?.organizationId ?? undefined;
}

async function requireAdmin(
  req: import("express").Request,
  res: import("express").Response,
  permission: string,
  resolveCurrentUser = defaultCurrentUser,
  database = db,
) {
  const user = await resolveCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const organizationId = await getActiveOrganizationId(user.id, database);
  const decision = await authorize({
    actorUserId: user.id,
    organizationId,
    permission,
    resourceType: permission.split(".")[0] ?? "UNKNOWN",
    requestId: String(req.id),
  });
  if (!decision.allowed) {
    res.status(403).json({ error: "Authorization denied", reasonCode: decision.reasonCode });
    return null;
  }
  return { user, organizationId, scopeType: decision.scopeType };
}

export function createAuthorizationRouter(dependencies: AuthorizationRouteDependencies = {}) {
const router: IRouter = Router();
const database = dependencies.db ?? db;
const resolveCurrentUser = dependencies.currentUser ?? defaultCurrentUser;

router.get("/permissions", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res, "PERMISSION.MANAGE", resolveCurrentUser, database)) return;
  res.json(await database.select().from(permissionsTable).orderBy(permissionsTable.code));
});

router.get("/roles", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res, "ROLE.MANAGE", resolveCurrentUser, database)) return;
  res.json(await database.select().from(rolesTable).orderBy(rolesTable.code));
});

router.get("/roles/:roleId/permissions", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res, "ROLE.MANAGE", resolveCurrentUser, database)) return;
  const [role] = await database.select({ policyVersion: rolesTable.policyVersion }).from(rolesTable)
    .where(eq(rolesTable.id, req.params.roleId));
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }
  const rows = await database.select({
    id: rolePermissionsTable.id,
    permissionId: rolePermissionsTable.permissionId,
    code: permissionsTable.code,
    defaultScopeType: rolePermissionsTable.defaultScopeType,
    effect: rolePermissionsTable.effect,
  }).from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(rolePermissionsTable.roleId, req.params.roleId));
  res.set("ETag", role.policyVersion);
  res.json({ permissions: rows, policyVersion: role.policyVersion });
});

router.put("/roles/:roleId/permissions", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res, "ROLE.MANAGE", resolveCurrentUser, database);
  if (!admin) return;
  const requestedVersion = req.get("if-match") ?? (typeof req.body?.policyVersion === "string" ? req.body.policyVersion : undefined);
  if (!requestedVersion) {
    res.status(428).json({ error: "If-Match or policyVersion precondition is required" });
    return;
  }
  const entries = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
  const valid: PermissionUpdate[] = entries.filter((entry: unknown): entry is PermissionUpdate => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Record<string, unknown>;
    return typeof value.permissionId === "string" &&
      (value.defaultScopeType === undefined || scopeTypeValues.includes(value.defaultScopeType as never)) &&
      (value.effect === undefined || value.effect === "ALLOW" || value.effect === "DENY");
  });
  const role = await database.select().from(rolesTable).where(eq(rolesTable.id, req.params.roleId));
  if (!role.length || role[0]!.status !== "ACTIVE" || !canonicalRoleValues.includes(role[0]!.code as typeof canonicalRoleValues[number]) || valid.length !== entries.length) {
    res.status(400).json({ error: "Invalid role or permission payload" });
    return;
  }
  const roleCode = role[0]!.code;
  const requestedPermissionIds = valid.map((entry) => entry.permissionId);
  const canonicalPermissionRows = await database.select({ id: permissionsTable.id, code: permissionsTable.code }).from(permissionsTable).where(and(
    eq(permissionsTable.status, "ACTIVE"),
  ));
  const canonicalPermissionIds = new Set(canonicalPermissionRows.map((permission) => permission.id));
  if (requestedPermissionIds.some((id) => !canonicalPermissionIds.has(id))) {
    res.status(400).json({ error: "Permission must be an active canonical permission" });
    return;
  }
  const requestedCodes = new Set(canonicalPermissionRows
    .filter((permission) => requestedPermissionIds.includes(permission.id))
    .map((permission) => permission.code));
  const matrixRows = roleCapabilityRows.filter(([, matrixRole]) => matrixRole === roleCode);
  const matrixScopeByCode = new Map(matrixRows.flatMap(([resource, , actions, scope]) =>
    actions.map((action) => [`${resource}.${action}`, scope] as const)));
  const permissionById = new Map(canonicalPermissionRows.map((permission) => [permission.id, permission.code]));
  const normalized = valid.map((entry) => ({
    ...entry,
    defaultScopeType: entry.defaultScopeType ??
      matrixScopeByCode.get(permissionById.get(entry.permissionId) as never),
  }));
  if (normalized.some((entry) => {
    const code = permissionById.get(entry.permissionId);
    return !code || !isPermissionInRoleMatrix(roleCode, code) ||
      !entry.defaultScopeType ||
      !isRolePermissionConfigurationAllowed(roleCode, code, entry.defaultScopeType);
  })) {
    res.status(400).json({ error: "Role permission is outside the canonical role matrix" });
    return;
  }
  if (roleCode === "PLATFORM_ADMIN" && [...requestedCodes].some(isPlatformOperationalPermission)) {
    res.status(400).json({ error: "PLATFORM_ADMIN cannot receive operational permissions" });
    return;
  }
  const uniqueEntries = new Set(normalized.map((entry) => `${entry.permissionId}:${entry.defaultScopeType}`));
  if (uniqueEntries.size !== normalized.length) {
    res.status(409).json({ error: "Duplicate role permission entries" });
    return;
  }
  const version = requestedVersion.replace(/^W\//, "").replace(/^"|"$/g, "");
  if (version !== role[0]!.policyVersion) {
    res.status(409).json({ error: "Stale policy version", policyVersion: role[0]!.policyVersion });
    return;
  }
  const effectiveEntries = matrixRows.flatMap(([resource, , actions, defaultScopeType]) =>
    actions.map((action) => {
      const code = `${resource}.${action}`;
      const permission = canonicalPermissionRows.find((row) => row.code === code);
      if (!permission) return null;
      const supplied = normalized.find((entry) => entry.permissionId === permission.id);
      return {
        roleId: req.params.roleId,
        permissionId: permission.id,
        defaultScopeType: (supplied?.defaultScopeType ?? defaultScopeType) as "ORGANIZATION",
        effect: (supplied?.effect ?? "DENY") as "ALLOW" | "DENY",
      };
    })).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const before = await database.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, req.params.roleId));
  let updatedRole: typeof role[0] | undefined;
  try {
  await database.transaction(async (tx) => {
    [updatedRole] = await tx.update(rolesTable)
      .set({ policyVersion: randomUUID() })
      .where(and(eq(rolesTable.id, req.params.roleId), eq(rolesTable.policyVersion, role[0]!.policyVersion)))
      .returning();
    if (!updatedRole) throw new Error("STALE_POLICY_VERSION");
    await tx.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, req.params.roleId));
    if (effectiveEntries.length) await tx.insert(rolePermissionsTable).values(effectiveEntries);
    await tx.insert(authorizationAuditLogsTable).values({
      actorUserId: admin.user.id,
      organizationId: admin.organizationId ?? null,
      action: "PERMISSION_CHANGED",
      resource: "ROLE",
      resourceId: req.params.roleId,
      decision: "ALLOW",
      reasonCode: "ALLOWED",
      beforeState: JSON.stringify(before.map(({ id: _id, ...row }) => row)),
      afterState: JSON.stringify(effectiveEntries),
      requestId: String(req.id),
    });
  });
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_POLICY_VERSION") {
      const [currentRole] = await database.select({ policyVersion: rolesTable.policyVersion })
        .from(rolesTable)
        .where(eq(rolesTable.id, req.params.roleId));
      res.status(409).json({
        error: "Stale policy version",
        ...(currentRole ? { policyVersion: currentRole.policyVersion } : {}),
      });
      return;
    }
    throw error;
  }
  const rows = await database.select().from(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, req.params.roleId));
  res.set("ETag", updatedRole!.policyVersion);
  res.json({ permissions: rows, policyVersion: updatedRole!.policyVersion });
});

router.get("/audit-logs", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res, "AUDIT_LOG.VIEW_AUDIT", resolveCurrentUser, database);
  if (!admin) return;

  const resource = req.query.resource;
  const resourceId = req.query.resourceId;
  if ((resource !== undefined && typeof resource !== "string") ||
      (resourceId !== undefined && typeof resourceId !== "string")) {
    res.status(400).json({ error: "resource and resourceId filters must be strings" });
    return;
  }

  const filters = [];
  if (admin.scopeType !== "PLATFORM") {
    if (!admin.organizationId) {
      res.status(403).json({ error: "Active organization context required" });
      return;
    }
    filters.push(eq(authorizationAuditLogsTable.organizationId, admin.organizationId));
  }
  if (typeof resource === "string") filters.push(eq(authorizationAuditLogsTable.resource, resource));
  if (typeof resourceId === "string") filters.push(eq(authorizationAuditLogsTable.resourceId, resourceId));

  const rows = await database.select().from(authorizationAuditLogsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(authorizationAuditLogsTable.createdAt), desc(authorizationAuditLogsTable.id));
  res.json(rows);
});

router.get("/users/search", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res, "USER.VIEW", resolveCurrentUser, database);
  if (!admin) return;

  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  if (query.length < 2 || query.length > 100 || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 50) {
    res.status(400).json({ error: "query must be 2-100 characters and limit must be an integer from 1-50" });
    return;
  }
  if (admin.scopeType !== "PLATFORM" && !admin.organizationId) {
    res.status(403).json({ error: "Active organization context required" });
    return;
  }

  const filters = [
    eq(usersTable.isActive, true),
    eq(membershipsTable.isActive, true),
    eq(organizationsTable.isActive, true),
    or(
      ilike(usersTable.displayName, `%${query}%`),
      ilike(usersTable.email, `%${query}%`),
    )!,
  ];
  if (admin.scopeType !== "PLATFORM") {
    filters.push(eq(membershipsTable.organizationId, admin.organizationId!));
  }

  const rows = await database.select({
    userId: usersTable.id,
    displayName: usersTable.displayName,
    email: usersTable.email,
    organizationId: membershipsTable.organizationId,
    organizationName: organizationsTable.name,
    membershipRole: membershipsTable.role,
  }).from(membershipsTable)
    .innerJoin(usersTable, eq(membershipsTable.userId, usersTable.id))
    .innerJoin(organizationsTable, eq(membershipsTable.organizationId, organizationsTable.id))
    .where(and(...filters))
    .orderBy(asc(usersTable.displayName), asc(usersTable.email), asc(organizationsTable.name))
    .limit(rawLimit);

  res.json(rows);
});

router.get("/users/:userId/role-bindings", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res, "USER.VIEW", resolveCurrentUser, database);
  if (!admin) return;
  const rows = await database.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.userId, req.params.userId));
  res.json(admin.scopeType === "PLATFORM"
    ? rows
    : rows.filter((row) => row.organizationId === admin.organizationId));
});

router.post("/users/:userId/role-bindings", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const state = validateRoleBindingState({
    scopeType: body.scopeType,
    scopeId: body.scopeId ?? null,
    status: body.status ?? "ACTIVE",
    startsAt: body.startsAt ?? null,
    endsAt: body.endsAt ?? null,
  });
  if (!state.valid) {
    res.status(400).json({ error: state.error });
    return;
  }
  const admin = await requireAdmin(req, res, "USER.MANAGE", resolveCurrentUser, database);
  if (!admin) return;
  if (isSelfRoleEscalation(admin.user.id, req.params.userId)) {
    res.status(403).json({ error: "Self role escalation is denied" });
    return;
  }
  if (typeof body.organizationId !== "string" || typeof body.roleId !== "string" ||
      typeof body.scopeType !== "string" || !scopeTypeValues.includes(body.scopeType as never)) {
    res.status(400).json({ error: "organizationId, roleId and valid scopeType are required" });
    return;
  }
  const targetOrganizationId = body.organizationId;
  const targetRoleId = body.roleId;
  if (!canCrossOrganizationFoundation(admin.scopeType, admin.organizationId, body.organizationId)) {
    res.status(403).json({ error: "Target organization is outside active organization scope" });
    return;
  }
  const [targetMembership] = await database.select({ userId: membershipsTable.userId })
    .from(membershipsTable)
    .where(and(
      eq(membershipsTable.userId, req.params.userId),
      eq(membershipsTable.organizationId, body.organizationId),
      eq(membershipsTable.isActive, true),
    ));
  const [targetRole] = await database.select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.id, body.roleId), eq(rolesTable.status, "ACTIVE")));
  if (!targetMembership || !targetRole) {
    res.status(400).json({ error: "User must have active membership and role must be canonical and active" });
    return;
  }
  const scopeId = state.state.scopeId;
  const duplicateWhere = and(
    eq(userRoleBindingsTable.userId, req.params.userId),
    eq(userRoleBindingsTable.organizationId, body.organizationId),
    eq(userRoleBindingsTable.roleId, body.roleId),
    eq(userRoleBindingsTable.scopeType, body.scopeType as "ORGANIZATION"),
    scopeId ? eq(userRoleBindingsTable.scopeId, scopeId) : isNull(userRoleBindingsTable.scopeId),
  );
  const [existingBinding] = await database.select().from(userRoleBindingsTable).where(duplicateWhere);
  if (existingBinding) {
    res.status(409).json({ error: "Role binding already exists", bindingId: existingBinding.id });
    return;
  }
  let binding: typeof userRoleBindingsTable.$inferSelect | undefined;
  try {
    await database.transaction(async (tx) => {
      [binding] = await tx.insert(userRoleBindingsTable).values({
        userId: req.params.userId,
        organizationId: targetOrganizationId,
        roleId: targetRoleId,
        scopeType: state.state.scopeType as "ORGANIZATION",
        scopeId,
        status: state.state.status as "ACTIVE",
        startsAt: state.state.startsAt,
        endsAt: state.state.endsAt,
        grantedBy: admin.user.id,
      }).returning();
      if (!binding) return;
      await tx.insert(authorizationAuditLogsTable).values({
        actorUserId: admin.user.id,
        organizationId: targetOrganizationId,
        action: "ROLE_ASSIGNED",
        resource: "USER_ROLE_BINDING",
        resourceId: binding.id,
        decision: "ALLOW",
        reasonCode: "ALLOWED",
        beforeState: null,
        afterState: JSON.stringify(bindingAuditState({ ...body, userId: req.params.userId })),
        requestId: String(req.id),
      });
    });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === "23505" || databaseError.cause?.code === "23505") {
      res.status(409).json({ error: "Role binding already exists" });
      return;
    }
    throw error;
  }
  if (!binding) {
    res.status(409).json({ error: "Role binding already exists" });
    return;
  }
  res.status(201).json(binding);
});

router.patch("/users/:userId/role-bindings/:bindingId", async (req, res): Promise<void> => {
  const [before] = await database.select().from(userRoleBindingsTable).where(and(
    eq(userRoleBindingsTable.id, req.params.bindingId),
    eq(userRoleBindingsTable.userId, req.params.userId),
  ));
  if (!before) {
    res.status(404).json({ error: "Role binding not found" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const state = validateRoleBindingState({
    scopeType: body.scopeType === undefined ? before.scopeType : body.scopeType,
    scopeId: body.scopeId === undefined ? before.scopeId : body.scopeId,
    status: body.status === undefined ? before.status : body.status,
    startsAt: body.startsAt === undefined ? before.startsAt : body.startsAt,
    endsAt: body.endsAt === undefined ? before.endsAt : body.endsAt,
  });
  if (!state.valid) {
    res.status(400).json({ error: state.error });
    return;
  }
  const admin = await requireAdmin(req, res, "USER.MANAGE", resolveCurrentUser, database);
  if (!admin) return;
  if (!canCrossOrganizationFoundation(admin.scopeType, admin.organizationId, before.organizationId)) {
    res.status(403).json({ error: "Target organization is outside active organization scope" });
    return;
  }
  if (isSelfRoleEscalation(admin.user.id, req.params.userId)) {
    res.status(403).json({ error: "Self role escalation is denied" });
    return;
  }
  if (state.state.status === "ACTIVE" && before.status === "EXPIRED") {
    res.status(409).json({ error: "Expired bindings cannot be reactivated" });
    return;
  }
  let after: typeof userRoleBindingsTable.$inferSelect | undefined;
  await database.transaction(async (tx) => {
    [after] = await tx.update(userRoleBindingsTable).set({
      scopeType: state.state.scopeType as "ORGANIZATION",
      scopeId: state.state.scopeId,
      status: state.state.status as "ACTIVE",
      startsAt: state.state.startsAt,
      endsAt: state.state.endsAt,
      version: randomUUID(),
    }).where(and(
      eq(userRoleBindingsTable.id, before.id),
      eq(userRoleBindingsTable.version, before.version),
    )).returning();
    if (!after) return;
    const action = state.state.status === "SUSPENDED" && before.status !== "SUSPENDED"
      ? "ROLE_SUSPENDED"
      : state.state.status === "ACTIVE" && before.status !== "ACTIVE"
        ? "ROLE_REACTIVATED"
        : state.state.status === "EXPIRED" && before.status !== "EXPIRED"
          ? "ROLE_EXPIRED"
          : "ROLE_BINDING_UPDATED";
    await tx.insert(authorizationAuditLogsTable).values({
      actorUserId: admin.user.id,
      organizationId: before.organizationId,
      action,
      resource: "USER_ROLE_BINDING",
      resourceId: before.id,
      decision: "ALLOW",
      reasonCode: "ALLOWED",
      beforeState: JSON.stringify(before),
      afterState: JSON.stringify(after),
      requestId: String(req.id),
    });
  });
  if (!after) {
    res.status(409).json({ error: "Role binding changed concurrently" });
    return;
  }
  res.json(after);
});

router.delete("/users/:userId/role-bindings/:bindingId", async (req, res): Promise<void> => {
  const admin = await requireAdmin(req, res, "USER.MANAGE", resolveCurrentUser, database);
  if (!admin) return;
  const [before] = await database.select().from(userRoleBindingsTable).where(and(
    eq(userRoleBindingsTable.id, req.params.bindingId),
    eq(userRoleBindingsTable.userId, req.params.userId),
  ));
  if (!before) {
    res.status(404).json({ error: "Role binding not found" });
    return;
  }
  if (!canCrossOrganizationFoundation(admin.scopeType, admin.organizationId, before.organizationId)) {
    res.status(403).json({ error: "Target organization is outside active organization scope" });
    return;
  }
  if (isSelfRoleEscalation(admin.user.id, req.params.userId)) {
    res.status(403).json({ error: "Self role escalation is denied" });
    return;
  }
  let after: typeof userRoleBindingsTable.$inferSelect | undefined;
  await database.transaction(async (tx) => {
    [after] = await tx.update(userRoleBindingsTable)
      .set({ status: "EXPIRED", endsAt: new Date(), version: randomUUID() })
      .where(and(
        eq(userRoleBindingsTable.id, before.id),
        eq(userRoleBindingsTable.version, before.version),
      ))
      .returning();
    if (!after) return;
    await tx.insert(authorizationAuditLogsTable).values({
      actorUserId: admin.user.id,
      organizationId: before.organizationId,
      action: "ROLE_REVOKED",
      resource: "USER_ROLE_BINDING",
      resourceId: before.id,
      decision: "ALLOW",
      reasonCode: "ALLOWED",
      beforeState: JSON.stringify(before),
      afterState: JSON.stringify(after),
      requestId: String(req.id),
    });
  });
  if (!after) {
    res.status(409).json({ error: "Role binding changed concurrently" });
    return;
  }
  res.json(after);
});

router.get("/me/permissions", async (req, res): Promise<void> => {
  const user = await resolveCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const organizationId = await getActiveOrganizationId(user.id, database);
  if (!organizationId) {
    res.status(403).json({ error: "Active organization context required" });
    return;
  }
  res.json({ organizationId, permissions: await listUserPermissions(user.id, organizationId) });
});

router.get("/me/scope", async (req, res): Promise<void> => {
  const user = await resolveCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const organizationId = await getActiveOrganizationId(user.id, database);
  if (!organizationId) {
    res.status(403).json({ error: "Active organization context required" });
    return;
  }
  const now = new Date();
  res.json(await database.select().from(userRoleBindingsTable).where(and(
    eq(userRoleBindingsTable.userId, user.id),
    eq(userRoleBindingsTable.organizationId, organizationId),
    eq(userRoleBindingsTable.status, "ACTIVE"),
    or(isNull(userRoleBindingsTable.startsAt), lte(userRoleBindingsTable.startsAt, now)),
    or(isNull(userRoleBindingsTable.endsAt), gt(userRoleBindingsTable.endsAt, now)),
  )));
});

router.post("/authorization/check", async (req, res): Promise<void> => {
  if (!authorizationProbeAvailable()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const user = await resolveCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (typeof body.permission !== "string" || typeof body.resourceType !== "string") {
    res.status(400).json({ error: "permission and resourceType are required" });
    return;
  }
  const organizationId = await getActiveOrganizationId(user.id, database);
  const decision = await authorize({
    actorUserId: user.id,
    organizationId,
    permission: body.permission,
    resourceType: body.resourceType,
    resourceId: typeof body.resourceId === "string" ? body.resourceId : undefined,
    actionContext: body.context && typeof body.context === "object" ? body.context as Record<string, unknown> : undefined,
    requestId: String(req.id),
  });
  res.status(decision.allowed ? 200 : 403).json({
    allowed: decision.allowed,
    reasonCode: decision.reasonCode,
    permission: decision.permission,
    scopeType: decision.scopeType,
  });
});

return router;
}

const router = createAuthorizationRouter();
export default router;