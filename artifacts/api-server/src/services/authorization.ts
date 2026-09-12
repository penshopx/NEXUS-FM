import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  authorizationAuditLogsTable,
  auditEventsTable,
  db,
  membershipsTable,
  organizationsTable,
  permissionsTable,
  rolePermissionsTable,
  userContextsTable,
  userRoleBindingsTable,
  usersTable,
} from "@workspace/db";
import { permissionCatalog, rolePermissionCatalog, type ScopeType } from "./authorization-catalog";

export type AuthorizationReason =
  | "AUTH_REQUIRED" | "USER_INACTIVE" | "ORGANIZATION_MISMATCH"
  | "ROLE_NOT_ASSIGNED" | "BINDING_INACTIVE" | "PERMISSION_NOT_GRANTED"
  | "RESOURCE_NOT_FOUND" | "SCOPE_DENIED" | "ASSIGNMENT_REQUIRED"
  | "OWNERSHIP_REQUIRED" | "VENDOR_SCOPE_DENIED" | "EXPLICIT_DENY"
  | "POLICY_DENIED" | "PERMISSION_GRANTED";

type Decision = {
  allowed: boolean;
  reasonCode: AuthorizationReason;
  permission: string;
  scopeType: ScopeType | null;
};

export async function seedAuthorizationCatalog() {
  for (const permission of permissionCatalog) {
    await db.insert(permissionsTable).values(permission).onConflictDoUpdate({
      target: permissionsTable.code,
      set: {
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        status: "ACTIVE",
      },
    });
  }
  const stored = await db.select().from(permissionsTable);
  const permissionIds = new Map(stored.map((permission) => [permission.code, permission.id]));
  for (const rule of rolePermissionCatalog) {
    const permissionId = permissionIds.get(rule.code);
    if (!permissionId) throw new Error(`Permission seed missing ${rule.code}`);
    await db.insert(rolePermissionsTable).values({
      role: rule.role,
      permissionId,
      defaultScopeType: rule.scope,
      effect: rule.effect,
    }).onConflictDoUpdate({
      target: [
        rolePermissionsTable.role,
        rolePermissionsTable.permissionId,
        rolePermissionsTable.defaultScopeType,
      ],
      set: { effect: rule.effect },
    });
  }
  await backfillFoundationBindings();
}

export async function backfillFoundationBindings() {
  const memberships = await db.select().from(membershipsTable);
  for (const membership of memberships) {
    const desiredScope = membership.role === "PLATFORM_ADMIN" ? "PLATFORM" : "ORGANIZATION";
    const [existing] = await db.select({ id: userRoleBindingsTable.id })
      .from(userRoleBindingsTable)
      .where(and(
        eq(userRoleBindingsTable.userId, membership.userId),
        eq(userRoleBindingsTable.organizationId, membership.organizationId),
        eq(userRoleBindingsTable.role, membership.role),
        eq(userRoleBindingsTable.scopeType, desiredScope),
        isNull(userRoleBindingsTable.scopeId),
      ));
    if (!existing) {
      await db.insert(userRoleBindingsTable).values({
        userId: membership.userId,
        organizationId: membership.organizationId,
        role: membership.role,
        scopeType: desiredScope,
      });
    }
  }
}

export async function authorize(input: {
  actorUserId: string;
  organizationId: string;
  permission: string;
  resourceId?: string;
  audit?: boolean;
}): Promise<Decision> {
  const deny = (reasonCode: AuthorizationReason): Decision => ({
    allowed: false,
    reasonCode,
    permission: input.permission,
    scopeType: null,
  });
  const [catalogPermission] = await db.select().from(permissionsTable)
    .where(and(eq(permissionsTable.code, input.permission), eq(permissionsTable.status, "ACTIVE")));
  if (!catalogPermission) return deny("PERMISSION_NOT_GRANTED");

  const [membership] = await db.select().from(membershipsTable).where(and(
    eq(membershipsTable.userId, input.actorUserId),
    eq(membershipsTable.organizationId, input.organizationId),
  ));
  if (!membership) return deny("ORGANIZATION_MISMATCH");

  const [context] = await db.select().from(userContextsTable)
    .where(eq(userContextsTable.userId, input.actorUserId));
  if (context?.activeOrganizationId !== input.organizationId) return deny("ORGANIZATION_MISMATCH");

  const now = new Date();
  const bindings = await db.select().from(userRoleBindingsTable).where(and(
    eq(userRoleBindingsTable.userId, input.actorUserId),
    eq(userRoleBindingsTable.organizationId, input.organizationId),
  ));
  if (bindings.length === 0) return deny("ROLE_NOT_ASSIGNED");
  const activeBindings = bindings.filter((binding) =>
    binding.status === "ACTIVE" &&
    (!binding.startsAt || binding.startsAt <= now) &&
    (!binding.endsAt || binding.endsAt > now),
  );
  if (activeBindings.length === 0) return deny("BINDING_INACTIVE");

  const roleRules = await db.select({
    role: rolePermissionsTable.role,
    scope: rolePermissionsTable.defaultScopeType,
    effect: rolePermissionsTable.effect,
  }).from(rolePermissionsTable).where(and(
    eq(rolePermissionsTable.permissionId, catalogPermission.id),
    inArray(rolePermissionsTable.role, activeBindings.map((binding) => binding.role)),
  ));
  if (roleRules.length === 0) return deny("PERMISSION_NOT_GRANTED");
  if (roleRules.some((rule) => rule.effect === "DENY")) return deny("EXPLICIT_DENY");

  for (const binding of activeBindings) {
    const matchingRule = roleRules.find((rule) =>
      rule.role === binding.role &&
      rule.effect === "ALLOW" &&
      rule.scope === binding.scopeType,
    );
    if (!matchingRule) continue;
    if (
      input.resourceId &&
      !await verifyResource(
        catalogPermission.resource,
        input.resourceId,
        binding.scopeType,
        input.organizationId,
      )
    ) {
      continue;
    }
    const broadScope = binding.scopeType === "ORGANIZATION" || binding.scopeType === "PLATFORM";
    if (broadScope && !binding.scopeId) {
      return {
        allowed: true,
        reasonCode: "PERMISSION_GRANTED",
        permission: input.permission,
        scopeType: binding.scopeType,
      };
    }
    if (
      input.resourceId &&
      binding.scopeId === input.resourceId &&
      await verifyScopedResource(binding.scopeType, binding.scopeId, input.organizationId)
    ) {
      return {
        allowed: true,
        reasonCode: "PERMISSION_GRANTED",
        permission: input.permission,
        scopeType: binding.scopeType,
      };
    }
  }
  return deny(input.resourceId ? "SCOPE_DENIED" : "ASSIGNMENT_REQUIRED");
}

async function verifyResource(
  resource: string,
  resourceId: string,
  scopeType: ScopeType,
  organizationId: string,
) {
  if (resource === "ORGANIZATION") {
    if (scopeType === "ORGANIZATION") return resourceId === organizationId;
    const [organization] = await db.select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, resourceId));
    return Boolean(organization);
  }
  if (resource === "USER" || resource === "SESSION") {
    if (scopeType === "PLATFORM") {
      const [user] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, resourceId));
      return Boolean(user);
    }
    const [membership] = await db.select({ userId: membershipsTable.userId })
      .from(membershipsTable)
      .where(and(
        eq(membershipsTable.userId, resourceId),
        eq(membershipsTable.organizationId, organizationId),
      ));
    return Boolean(membership);
  }
  if (resource === "PERMISSION" && scopeType === "PLATFORM") {
    const [permission] = await db.select({ id: permissionsTable.id })
      .from(permissionsTable)
      .where(eq(permissionsTable.id, resourceId));
    return Boolean(permission);
  }
  if (resource === "AUDIT_LOG") {
    const [event] = await db.select({ id: auditEventsTable.id })
      .from(auditEventsTable)
      .where(and(
        eq(auditEventsTable.id, resourceId),
        scopeType === "PLATFORM"
          ? eq(auditEventsTable.id, resourceId)
          : eq(auditEventsTable.organizationId, organizationId),
      ));
    return Boolean(event);
  }
  return false;
}

async function verifyScopedResource(
  scopeType: ScopeType,
  _scopeId: string,
  _organizationId: string,
) {
  // Operational domain resolvers are intentionally unavailable in Task #02.
  // A matching UUID is never sufficient evidence of existence, ancestry, assignment,
  // ownership, team access, or vendor relationship.
  switch (scopeType) {
    case "PLATFORM":
    case "ORGANIZATION":
      return true;
    default:
      return false;
  }
}

export async function auditDecision(input: {
  actorUserId: string;
  organizationId: string;
  permission: string;
  resourceId?: string;
  decision: Decision;
}) {
  const [resource = "UNKNOWN"] = input.permission.split(".");
  await db.insert(authorizationAuditLogsTable).values({
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    permission: input.permission,
    resource,
    resourceId: input.resourceId,
    decision: input.decision.allowed ? "ALLOW" : "DENY",
    reasonCode: input.decision.reasonCode,
    scopeEvaluated: input.decision.scopeType,
  });
}

export async function getAuthorizationProfile(userId: string, organizationId: string) {
  const bindings = await db.select().from(userRoleBindingsTable).where(and(
    eq(userRoleBindingsTable.userId, userId),
    eq(userRoleBindingsTable.organizationId, organizationId),
    eq(userRoleBindingsTable.status, "ACTIVE"),
    or(isNull(userRoleBindingsTable.startsAt), eq(userRoleBindingsTable.startsAt, userRoleBindingsTable.startsAt)),
  ));
  const active = bindings.filter((binding) =>
    (!binding.startsAt || binding.startsAt <= new Date()) &&
    (!binding.endsAt || binding.endsAt > new Date()),
  );
  const roles = [...new Set(active.map((binding) => binding.role))];
  if (roles.length === 0) return { organizationId, roles: [], permissions: [], scopes: [] };
  const rules = await db.select({
    role: rolePermissionsTable.role,
    code: permissionsTable.code,
    scope: rolePermissionsTable.defaultScopeType,
    effect: rolePermissionsTable.effect,
  }).from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(inArray(rolePermissionsTable.role, roles));
  const effective = rules.filter((rule) =>
    rule.effect === "ALLOW" &&
    active.some((binding) => binding.role === rule.role && binding.scopeType === rule.scope) &&
    !rules.some((candidate) => candidate.code === rule.code && candidate.effect === "DENY"),
  );
  return {
    organizationId,
    roles,
    permissions: [...new Set(effective.map((rule) => rule.code))].sort(),
    scopes: active.map((binding) => ({
      role: binding.role,
      scopeType: binding.scopeType,
      scopeId: binding.scopeId,
    })),
  };
}

export async function listPermissionCatalog() {
  return db.select({
    id: permissionsTable.id,
    code: permissionsTable.code,
    resource: permissionsTable.resource,
    action: permissionsTable.action,
    description: permissionsTable.description,
    status: permissionsTable.status,
  }).from(permissionsTable);
}

export async function listRoleCapabilities() {
  return db.select({
    role: rolePermissionsTable.role,
    permission: permissionsTable.code,
    defaultScopeType: rolePermissionsTable.defaultScopeType,
    effect: rolePermissionsTable.effect,
  }).from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id));
}

export async function listBindings(userId: string, organizationId: string) {
  return db.select().from(userRoleBindingsTable).where(and(
    eq(userRoleBindingsTable.userId, userId),
    eq(userRoleBindingsTable.organizationId, organizationId),
  ));
}

export async function createBinding(input: {
  actorUserId: string;
  userId: string;
  organizationId: string;
  role: typeof userRoleBindingsTable.$inferInsert.role;
  scopeType: typeof userRoleBindingsTable.$inferInsert.scopeType;
  scopeId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  reason: string;
}) {
  await assertRoleAdministrator(input.actorUserId, input.organizationId);
  if (input.actorUserId === input.userId) {
    throw new Error("SELF_ASSIGNMENT_DENIED");
  }
  const [targetMembership] = await db.select().from(membershipsTable).where(and(
    eq(membershipsTable.userId, input.userId),
    eq(membershipsTable.organizationId, input.organizationId),
  ));
  if (!targetMembership) throw new Error("ORGANIZATION_MISMATCH");
  if (input.scopeType !== "ORGANIZATION" && input.scopeType !== "PLATFORM") {
    throw new Error("SCOPE_RESOURCE_NOT_AVAILABLE");
  }
  if (input.scopeId) throw new Error("SCOPE_ID_NOT_ALLOWED");
  if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
    throw new Error("INVALID_BINDING_WINDOW");
  }
  return db.transaction(async (tx) => {
    const [binding] = await tx.insert(userRoleBindingsTable).values({
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      scopeType: input.scopeType,
      scopeId: null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      grantedBy: input.actorUserId,
    }).returning();
    await tx.insert(auditEventsTable).values({
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      action: "AUTHORIZATION.ROLE_ASSIGNED",
      targetType: "role_binding",
      targetId: binding.id,
      metadata: {
        targetUserId: input.userId,
        role: input.role,
        scopeType: input.scopeType,
        reason: input.reason,
      },
    });
    return binding;
  });
}

export async function updateBinding(input: {
  actorUserId: string;
  organizationId: string;
  bindingId: string;
  status: typeof userRoleBindingsTable.$inferInsert.status;
  startsAt?: Date | null;
  endsAt?: Date | null;
  reason: string;
}) {
  await assertRoleAdministrator(input.actorUserId, input.organizationId);
  if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
    throw new Error("INVALID_BINDING_WINDOW");
  }
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(userRoleBindingsTable).where(and(
      eq(userRoleBindingsTable.id, input.bindingId),
      eq(userRoleBindingsTable.organizationId, input.organizationId),
    )).for("update");
    if (!before) return null;
    if (before.userId === input.actorUserId) throw new Error("SELF_ASSIGNMENT_DENIED");
    if (before.status === "REVOKED") throw new Error("REVOKED_BINDING_IS_TERMINAL");
    const [binding] = await tx.update(userRoleBindingsTable).set({
      status: input.status,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    }).where(eq(userRoleBindingsTable.id, input.bindingId)).returning();
    await tx.insert(auditEventsTable).values({
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      action: "AUTHORIZATION.ROLE_BINDING_UPDATED",
      targetType: "role_binding",
      targetId: binding.id,
      metadata: {
        before: { status: before.status, startsAt: before.startsAt, endsAt: before.endsAt },
        after: { status: binding.status, startsAt: binding.startsAt, endsAt: binding.endsAt },
        reason: input.reason,
      },
    });
    return binding;
  });
}

export async function revokeBinding(input: {
  actorUserId: string;
  organizationId: string;
  bindingId: string;
  reason: string;
}) {
  await assertRoleAdministrator(input.actorUserId, input.organizationId);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(userRoleBindingsTable).where(and(
      eq(userRoleBindingsTable.id, input.bindingId),
      eq(userRoleBindingsTable.organizationId, input.organizationId),
    )).for("update");
    if (!before) return null;
    if (before.userId === input.actorUserId) throw new Error("SELF_ASSIGNMENT_DENIED");
    if (before.status === "REVOKED") throw new Error("REVOKED_BINDING_IS_TERMINAL");
    const [binding] = await tx.update(userRoleBindingsTable)
      .set({ status: "REVOKED" })
      .where(eq(userRoleBindingsTable.id, input.bindingId))
      .returning();
    await tx.insert(auditEventsTable).values({
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      action: "AUTHORIZATION.ROLE_REVOKED",
      targetType: "role_binding",
      targetId: binding.id,
      metadata: {
        before: {
          status: before.status,
          startsAt: before.startsAt,
          endsAt: before.endsAt,
        },
        after: {
          status: binding.status,
          startsAt: binding.startsAt,
          endsAt: binding.endsAt,
        },
        reason: input.reason,
      },
    });
    return binding;
  });
}

async function assertRoleAdministrator(actorUserId: string, organizationId: string) {
  const decision = await authorize({
    actorUserId,
    organizationId,
    permission: "ROLE.MANAGE",
  });
  if (!decision.allowed) throw new Error("ADMIN_PERMISSION_REQUIRED");
}