import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { EventEmitter } from "node:events";
import { and, eq, inArray } from "drizzle-orm";
import {
  authorizationAuditLogsTable,
  assetsTable,
  buildingsTable,
  canonicalRoleValues,
  db,
  facilitiesTable,
  membershipsTable,
  organizationsTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  spacesTable,
  systemsTable,
  userContextsTable,
  userRoleBindingsTable,
  usersTable,
} from "@workspace/db";
import {
  authorize,
  assertOrganizationScope,
  AuthorizationError,
  isSelfRoleEscalation,
  listUserPermissions,
  authorizationProbeAvailable,
  canCrossOrganizationFoundation,
  recordAuthorizationConfigurationAudit,
  requirePermission,
  validateRoleBindingState,
} from "../src/services/authorization.ts";
import {
  canonicalPermissions,
  roleCapabilityRows,
  isPermissionInRoleMatrix,
  isRolePermissionConfigurationAllowed,
  isPlatformOperationalPermission,
  seedAuthorizationCatalog,
} from "../src/services/authorization-catalog.ts";
import {
  ensureFoundationUser,
  getAppSession,
} from "../src/services/foundation.ts";
import { createAuthorizationRouter } from "../src/routes/authorization.ts";
import { createFacilitiesRouter, waitForCsvDrain } from "../src/routes/facilities.ts";
import { authorizeRegistryObject, resolveRegistryObject } from "../src/services/facilities.ts";

type Fixture = {
  userId: string;
  organizationId: string;
  roleId: string;
  bindingId: string;
};

const fixtures: Fixture[] = [];
let seededRoles: Map<string, string>;
let seededPermissions: Map<string, string>;

async function makeFixture(
  roleCode: string,
  scopeType: "PLATFORM" | "ORGANIZATION" | "FACILITY" | "BUILDING" | "SPACE" | "ASSET" | "ASSIGNED" | "TEAM" | "VENDOR_ASSIGNMENT",
  scopeId?: string,
) {
  const [user] = await db.insert(usersTable).values({
    externalAuthId: `task02-test-${randomUUID()}`,
    displayName: `Task 02 ${roleCode}`,
    email: `${randomUUID()}@task02.invalid`,
  }).returning();
  const [organization] = await db.insert(organizationsTable).values({
    name: `Task 02 ${roleCode}`,
    slug: `task02-${randomUUID()}`,
  }).returning();
  await db.insert(membershipsTable).values({
    userId: user.id,
    organizationId: organization.id,
    role: roleCode as typeof canonicalRoleValues[number],
  });
  const roleId = seededRoles.get(roleCode);
  assert.ok(roleId);
  const [binding] = await db.insert(userRoleBindingsTable).values({
    userId: user.id,
    organizationId: organization.id,
    roleId,
    scopeType,
    scopeId: scopeId ?? null,
    grantedBy: user.id,
  }).returning();
  assert.ok(binding);
  const fixture = { userId: user.id, organizationId: organization.id, roleId, bindingId: binding.id };
  fixtures.push(fixture);
  return fixture;
}

async function permissionId(code: string) {
  const id = seededPermissions.get(code);
  assert.ok(id, `seeded permission ${code}`);
  return id;
}

before(async () => {
  const first = await seedAuthorizationCatalog();
  await seedAuthorizationCatalog();
  seededRoles = new Map(first.roles.map((role) => [role.code, role.id]));
  seededPermissions = new Map(first.permissions.map((permission) => [permission.code, permission.id]));
});

after(async () => {
  for (const fixture of fixtures) {
    await db.delete(authorizationAuditLogsTable).where(eq(authorizationAuditLogsTable.actorUserId, fixture.userId));
    await db.delete(usersTable).where(eq(usersTable.id, fixture.userId));
    await db.delete(organizationsTable).where(eq(organizationsTable.id, fixture.organizationId));
  }
  await db.delete(authorizationAuditLogsTable).where(eq(authorizationAuditLogsTable.requestId, "task02-test"));
});

test("canonical seven roles are unchanged and catalog is idempotent", async () => {
  assert.deepEqual(canonicalRoleValues, [
    "PLATFORM_ADMIN", "FACILITY_MANAGER", "FACILITY_SUPERVISOR", "INSPECTOR",
    "MAINTENANCE_TECHNICIAN", "WAREHOUSE_SUPERVISOR", "VENDOR",
  ]);
  const roles = await db.select().from(rolesTable).where(inArray(rolesTable.code, [...canonicalRoleValues]));
  assert.equal(roles.length, 7);
  const permissions = await db.select().from(permissionsTable);
  assert.equal(new Set(permissions.map((permission) => permission.code)).size, permissions.length);
  const rolePermissions = await db.select().from(rolePermissionsTable);
  assert.ok(rolePermissions.length >= roleCapabilityRows.length);
  assert.ok(canonicalPermissions.includes("WORK_ORDER.VERIFY"));
});

test("representative matrix decisions cover all seven roles", async () => {
  const teamId = randomUUID();
  const facilityId = randomUUID();
  const buildingId = randomUUID();
  const assignmentId = randomUUID();
  const inspectorAssignmentId = randomUUID();
  const technicianAssignmentId = randomUUID();
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const supervisor = await makeFixture("FACILITY_SUPERVISOR", "TEAM", teamId);
  const inspector = await makeFixture("INSPECTOR", "ASSIGNED", inspectorAssignmentId);
  const technician = await makeFixture("MAINTENANCE_TECHNICIAN", "ASSIGNED", technicianAssignmentId);
  const warehouse = await makeFixture("WAREHOUSE_SUPERVISOR", "BUILDING", buildingId);
  const vendor = await makeFixture("VENDOR", "VENDOR_ASSIGNMENT", assignmentId);
  const platform = await makeFixture("PLATFORM_ADMIN", "PLATFORM");

  const decisions = await Promise.all([
    authorize({ actorUserId: manager.userId, organizationId: manager.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION", requestId: "task02-test" }),
    authorize({ actorUserId: supervisor.userId, organizationId: supervisor.organizationId, permission: "WORK_ORDER.VERIFY", resourceType: "WORK_ORDER", verifiedContext: { teamId, organizationId: supervisor.organizationId, scopeVerified: true }, requestId: "task02-test" }),
    authorize({ actorUserId: inspector.userId, organizationId: inspector.organizationId, permission: "INSPECTION.EXECUTE", resourceType: "INSPECTION", resourceId: inspectorAssignmentId, verifiedContext: { assignedUserId: inspector.userId, organizationId: inspector.organizationId, scopeVerified: true }, requestId: "task02-test" }),
    authorize({ actorUserId: technician.userId, organizationId: technician.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER", resourceId: technicianAssignmentId, verifiedContext: { assignedUserId: technician.userId, organizationId: technician.organizationId, scopeVerified: true }, requestId: "task02-test" }),
    authorize({ actorUserId: warehouse.userId, organizationId: warehouse.organizationId, permission: "WORK_ORDER.VERIFY", resourceType: "WORK_ORDER", verifiedContext: { resourceScopeId: buildingId, organizationId: warehouse.organizationId, scopeVerified: true }, requestId: "task02-test" }),
    authorize({ actorUserId: vendor.userId, organizationId: vendor.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER", verifiedContext: { vendorUserId: vendor.userId, vendorAssignmentId: assignmentId, organizationId: vendor.organizationId, scopeVerified: true }, requestId: "task02-test" }),
    authorize({ actorUserId: platform.userId, organizationId: platform.organizationId, permission: "ROLE.MANAGE", resourceType: "ROLE", requestId: "task02-test" }),
  ]);
  assert.ok(decisions.every((decision) => decision.allowed), JSON.stringify(decisions));
  const denied = await authorize({
    actorUserId: technician.userId,
    organizationId: technician.organizationId,
    permission: "WORK_ORDER.VERIFY",
    resourceType: "WORK_ORDER",
    verifiedContext: { assignedUserId: technician.userId, organizationId: technician.organizationId, scopeVerified: true },
    requestId: "task02-test",
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reasonCode, "PERMISSION_MISSING");
  // A facility binding cannot use an unrelated object.
  const facilityManager = await makeFixture("FACILITY_MANAGER", "FACILITY", facilityId);
  const missingProof = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const facilityDecision = await authorize({
    actorUserId: facilityManager.userId,
    organizationId: facilityManager.organizationId,
    permission: "FACILITY.VIEW",
    resourceType: "FACILITY",
    verifiedContext: { resourceScopeId: randomUUID(), organizationId: facilityManager.organizationId, scopeVerified: true },
  });
  assert.equal(facilityDecision.reasonCode, "SCOPE_MISMATCH");
  const absentProof = await authorize({
    actorUserId: missingProof.userId,
    organizationId: missingProof.organizationId,
    permission: "FACILITY.VIEW",
    resourceType: "FACILITY",
    actionContext: { resourceScopeId: facilityId, organizationId: missingProof.organizationId },
  });
  assert.equal(absentProof.reasonCode, "SCOPE_MISMATCH");
  const broadBindingOperational = await authorize({
    actorUserId: missingProof.userId,
    organizationId: missingProof.organizationId,
    permission: "FACILITY.VIEW",
    resourceType: "FACILITY",
    verifiedContext: {
      resourceScopeId: facilityId,
      facilityId,
      organizationId: missingProof.organizationId,
      scopeVerified: true,
    },
  });
  assert.equal(broadBindingOperational.reasonCode, "SCOPE_MISMATCH");
});

test("unknown permission, mismatched resource, organization isolation and missing binding deny", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const otherOrg = await db.insert(organizationsTable).values({ name: "Other", slug: `task02-other-${randomUUID()}` }).returning();
  const unknown = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "WORK_ORDER.NOT_REAL", resourceType: "WORK_ORDER", requestId: "task02-test" });
  assert.equal(unknown.reasonCode, "PERMISSION_MISSING");
  const mismatch = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ROLE.MANAGE", resourceType: "WORK_ORDER", requestId: "task02-test" });
  assert.equal(mismatch.reasonCode, "PERMISSION_MISSING");
  const crossOrg = await authorize({ actorUserId: fixture.userId, organizationId: otherOrg[0]!.id, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION", requestId: "task02-test" });
  assert.equal(crossOrg.reasonCode, "ORGANIZATION_MISMATCH");
  await db.delete(organizationsTable).where(eq(organizationsTable.id, otherOrg[0]!.id));
  await db.delete(userRoleBindingsTable).where(eq(userRoleBindingsTable.id, fixture.bindingId));
  const missing = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION", requestId: "task02-test" });
  assert.equal(missing.reasonCode, "BINDING_INACTIVE");
});

test("suspended and expired bindings deny, and explicit DENY wins", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.update(userRoleBindingsTable).set({ status: "SUSPENDED" }).where(eq(userRoleBindingsTable.id, fixture.bindingId));
  const suspended = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION", requestId: "task02-test" });
  assert.equal(suspended.reasonCode, "BINDING_INACTIVE");
  await db.update(userRoleBindingsTable).set({ status: "ACTIVE", endsAt: new Date(Date.now() - 1000) }).where(eq(userRoleBindingsTable.id, fixture.bindingId));
  const expired = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION", requestId: "task02-test" });
  assert.equal(expired.reasonCode, "BINDING_INACTIVE");
  await db.update(userRoleBindingsTable).set({ endsAt: null }).where(eq(userRoleBindingsTable.id, fixture.bindingId));
  const permission = await permissionId("ORGANIZATION.VIEW");
  await db.update(rolePermissionsTable).set({ effect: "DENY" }).where(and(eq(rolePermissionsTable.roleId, fixture.roleId), eq(rolePermissionsTable.permissionId, permission)));
  const explicit = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION", requestId: "task02-test" });
  assert.equal(explicit.reasonCode, "EXPLICIT_DENY");
  await db.update(rolePermissionsTable).set({ effect: "ALLOW" }).where(and(eq(rolePermissionsTable.roleId, fixture.roleId), eq(rolePermissionsTable.permissionId, permission)));
});

test("inactive user, organization, and future binding are denied", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.id, fixture.userId));
  const inactiveUser = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION" });
  assert.equal(inactiveUser.reasonCode, "USER_INACTIVE");
  await db.update(usersTable).set({ isActive: true }).where(eq(usersTable.id, fixture.userId));
  await db.update(organizationsTable).set({ isActive: false }).where(eq(organizationsTable.id, fixture.organizationId));
  const inactiveOrganization = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION" });
  assert.equal(inactiveOrganization.reasonCode, "ORGANIZATION_MISMATCH");
  await db.update(organizationsTable).set({ isActive: true }).where(eq(organizationsTable.id, fixture.organizationId));
  await db.update(userRoleBindingsTable).set({ startsAt: new Date(Date.now() + 60_000) }).where(eq(userRoleBindingsTable.id, fixture.bindingId));
  const futureBinding = await authorize({ actorUserId: fixture.userId, organizationId: fixture.organizationId, permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION" });
  assert.equal(futureBinding.reasonCode, "BINDING_INACTIVE");
});

test("role binding state validation rejects missing scope IDs, invalid dates, and lifecycle states", async () => {
  for (const scopeType of ["FACILITY", "BUILDING", "SPACE", "ASSET", "ASSIGNED", "TEAM", "VENDOR_ASSIGNMENT", "OWNED_REQUEST"]) {
    const result = validateRoleBindingState({
      scopeType,
      scopeId: null,
      status: "ACTIVE",
      startsAt: null,
      endsAt: null,
    });
    assert.equal(result.valid, false);
  }
  assert.equal(validateRoleBindingState({
    scopeType: "ORGANIZATION", scopeId: null, status: "ACTIVE",
    startsAt: "not-a-date", endsAt: null,
  }).valid, false);
  assert.equal(validateRoleBindingState({
    scopeType: "ORGANIZATION", scopeId: null, status: "ACTIVE",
    startsAt: "2026-02-01T00:00:00Z", endsAt: "2026-01-01T00:00:00Z",
  }).valid, false);
  assert.equal(validateRoleBindingState({
    scopeType: "ORGANIZATION", scopeId: null, status: "ACTIVE",
    startsAt: null, endsAt: new Date(Date.now() - 1000),
  }).valid, false);
  assert.equal(validateRoleBindingState({
    scopeType: "ORGANIZATION", scopeId: null, status: "EXPIRED",
    startsAt: null, endsAt: null,
  }).valid, false);
  assert.equal(validateRoleBindingState({
    scopeType: "ORGANIZATION", scopeId: null, status: "EXPIRED",
    startsAt: null, endsAt: new Date(Date.now() + 1000),
  }).valid, false);
});

test("duplicate null-scope bindings are rejected by the database constraint", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await assert.rejects(
    db.insert(userRoleBindingsTable).values({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      roleId: fixture.roleId,
      scopeType: "ORGANIZATION",
      scopeId: null,
      grantedBy: fixture.userId,
    }),
    (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23505",
  );
});

test("technician and vendor assignment isolation is enforced", async () => {
  const technicianAssignment = randomUUID();
  const technician = await makeFixture("MAINTENANCE_TECHNICIAN", "ASSIGNED", technicianAssignment);
  const vendorAssignment = randomUUID();
  const vendor = await makeFixture("VENDOR", "VENDOR_ASSIGNMENT", vendorAssignment);
  const ownWork = await authorize({ actorUserId: technician.userId, organizationId: technician.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER", resourceId: technicianAssignment, verifiedContext: { assignedUserId: technician.userId, organizationId: technician.organizationId, scopeVerified: true } });
  const otherWork = await authorize({ actorUserId: technician.userId, organizationId: technician.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER", resourceId: randomUUID(), verifiedContext: { assignedUserId: randomUUID(), organizationId: technician.organizationId, scopeVerified: true } });
  const ownVendor = await authorize({ actorUserId: vendor.userId, organizationId: vendor.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER", verifiedContext: { vendorUserId: vendor.userId, vendorAssignmentId: vendorAssignment, organizationId: vendor.organizationId, scopeVerified: true } });
  const otherVendor = await authorize({ actorUserId: vendor.userId, organizationId: vendor.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER", verifiedContext: { vendorUserId: vendor.userId, vendorAssignmentId: randomUUID(), organizationId: vendor.organizationId, scopeVerified: true } });
  const clientClaim = await authorize({ actorUserId: technician.userId, organizationId: technician.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER", actionContext: { assignedUserId: technician.userId } });
  assert.equal(ownWork.allowed, true);
  assert.equal(otherWork.reasonCode, "SCOPE_MISMATCH");
  assert.equal(ownVendor.allowed, true);
  assert.equal(otherVendor.reasonCode, "SCOPE_MISMATCH");
  assert.equal(clientClaim.reasonCode, "SCOPE_MISMATCH");
});

test("platform administration is separated from operational access", async () => {
  const platform = await makeFixture("PLATFORM_ADMIN", "PLATFORM");
  const foundation = await authorize({ actorUserId: platform.userId, organizationId: platform.organizationId, permission: "PERMISSION.MANAGE", resourceType: "PERMISSION" });
  const operational = await authorize({ actorUserId: platform.userId, organizationId: platform.organizationId, permission: "WORK_ORDER.EXECUTE", resourceType: "WORK_ORDER" });
  assert.equal(foundation.allowed, true);
  assert.equal(operational.reasonCode, "PERMISSION_MISSING");
  assert.equal(assertOrganizationScope(platform.organizationId, platform.organizationId), undefined);
  assert.throws(() => assertOrganizationScope(randomUUID(), platform.organizationId), (error: unknown) =>
    error instanceof AuthorizationError && error.reasonCode === "ORGANIZATION_MISMATCH");
  assert.equal(isSelfRoleEscalation(platform.userId, platform.userId), true);
  assert.equal(isSelfRoleEscalation(platform.userId, randomUUID()), false);
  assert.equal(isPlatformOperationalPermission("WORK_ORDER.EXECUTE"), true);
  assert.equal(isPermissionInRoleMatrix("PLATFORM_ADMIN", "WORK_ORDER.EXECUTE"), false);
  assert.equal(isPermissionInRoleMatrix("PLATFORM_ADMIN", "ROLE.MANAGE"), true);
  assert.equal(isRolePermissionConfigurationAllowed("MAINTENANCE_TECHNICIAN", "WORK_ORDER.EXECUTE", "ASSIGNED"), true);
  assert.equal(isRolePermissionConfigurationAllowed("MAINTENANCE_TECHNICIAN", "WORK_ORDER.EXECUTE", "ORGANIZATION"), false);
  assert.equal(canCrossOrganizationFoundation("ORGANIZATION", platform.organizationId, platform.organizationId), true);
  assert.equal(canCrossOrganizationFoundation("ORGANIZATION", platform.organizationId, randomUUID()), false);
  assert.equal(canCrossOrganizationFoundation("PLATFORM", platform.organizationId, randomUUID()), true);
});

test("permission middleware enforces the same evaluator as direct service calls", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const middleware = requirePermission("ORGANIZATION.VIEW");
  let nextCalled = false;
  await middleware(
    { appUserId: fixture.userId, activeOrganizationId: fixture.organizationId, id: "task02-test" } as never,
    { status: () => ({ json: () => undefined }) } as never,
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);
});

test("production authorization probe is disabled", async () => {
  assert.equal(authorizationProbeAvailable("production"), false);
  assert.equal(authorizationProbeAvailable("development"), true);
});

test("authorization routes run through a real HTTP app with injected currentUser", async () => {
  const platform = await makeFixture("PLATFORM_ADMIN", "PLATFORM");
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const target = await makeFixture("FACILITY_SUPERVISOR", "ORGANIZATION");
  await db.insert(userContextsTable).values({
    userId: platform.userId,
    activeOrganizationId: platform.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: platform.organizationId },
  });
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: manager.organizationId },
  });
  await db.insert(userRoleBindingsTable).values({
    userId: manager.userId,
    organizationId: target.organizationId,
    roleId: manager.roleId,
    scopeType: "ORGANIZATION",
    grantedBy: platform.userId,
  });
  let actorId = platform.userId;
  const app = express();
  app.use(express.json());
  app.use(createAuthorizationRouter({
    currentUser: async () => {
      const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, actorId));
      return actor ?? null;
    },
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    return { response, body: await response.json() as Record<string, unknown> | unknown[] };
  };
  try {
    const [targetUser] = await db.select().from(usersTable).where(eq(usersTable.id, target.userId));
    const [managerUser] = await db.select().from(usersTable).where(eq(usersTable.id, manager.userId));
    assert.ok(targetUser && managerUser);

    const platformSearch = await request(`/users/search?query=${encodeURIComponent(targetUser.email)}`);
    assert.equal(platformSearch.response.status, 200);
    assert.ok((platformSearch.body as Array<{ userId: string; organizationId: string }>)
      .some((row) => row.userId === target.userId && row.organizationId === target.organizationId));

    actorId = manager.userId;
    const scopedOwnSearch = await request(`/users/search?query=${encodeURIComponent(managerUser.email)}`);
    assert.equal(scopedOwnSearch.response.status, 200);
    assert.ok((scopedOwnSearch.body as Array<{ userId: string; organizationId: string }>)
      .some((row) => row.userId === manager.userId && row.organizationId === manager.organizationId));
    const scopedCrossOrgSearch = await request(`/users/search?query=${encodeURIComponent(targetUser.email)}`);
    assert.equal(scopedCrossOrgSearch.response.status, 200);
    assert.deepEqual(scopedCrossOrgSearch.body, []);
    const invalidSearch = await request("/users/search?query=x");
    assert.equal(invalidSearch.response.status, 400);
    actorId = platform.userId;

    const permissions = await request("/permissions");
    assert.equal(permissions.response.status, 200);
    const roles = await request("/roles");
    assert.equal(roles.response.status, 200);
    const rolePermissions = await request(`/roles/${manager.roleId}/permissions`);
    assert.equal(rolePermissions.response.status, 200);
    const version = rolePermissions.response.headers.get("etag");
    assert.ok(version);
    assert.equal((rolePermissions.body as { policyVersion: string }).policyVersion, version);
    assert.ok(Array.isArray((rolePermissions.body as { permissions: unknown[] }).permissions));
    const missingPrecondition = await request(`/roles/${manager.roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions: [] }),
    });
    assert.equal(missingPrecondition.response.status, 428);

    const revoked = await request(`/roles/${manager.roleId}/permissions`, {
      method: "PUT",
      headers: { "if-match": version! },
      body: JSON.stringify({ permissions: [] }),
    });
    assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
    assert.ok(Array.isArray((revoked.body as { permissions: unknown[] }).permissions));
    assert.ok((revoked.body as { permissions: Array<{ effect: string }> }).permissions.every((row) => row.effect === "DENY"));
    const revokedVersion = (revoked.body as { policyVersion: string }).policyVersion;
    assert.equal(revoked.response.headers.get("etag"), revokedVersion);
    const bodyVersionUpdate = await request(`/roles/${manager.roleId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions: [], policyVersion: revokedVersion }),
    });
    assert.equal(bodyVersionUpdate.response.status, 200, JSON.stringify(bodyVersionUpdate.body));
    assert.notEqual((bodyVersionUpdate.body as { policyVersion: string }).policyVersion, revokedVersion);
    await seedAuthorizationCatalog({ force: true });
    const durable = await authorize({
      actorUserId: manager.userId,
      organizationId: manager.organizationId,
      permission: "ORGANIZATION.VIEW",
      resourceType: "ORGANIZATION",
    });
    assert.equal(durable.reasonCode, "EXPLICIT_DENY");

    const stale = await request(`/roles/${manager.roleId}/permissions`, {
      method: "PUT",
      headers: { "if-match": version! },
      body: JSON.stringify({ permissions: [] }),
    });
    assert.equal(stale.response.status, 409);
    assert.equal((stale.body as { error: string }).error, "Stale policy version");
    assert.equal(typeof (stale.body as { policyVersion: string }).policyVersion, "string");
    const reflected = await request(`/roles/${manager.roleId}/permissions`);
    assert.equal(reflected.response.status, 200);
    assert.ok((reflected.body as { permissions: Array<{ effect: string }> }).permissions.some((row) => row.effect === "DENY"));

    const platformAudit = await request(`/audit-logs?resource=ROLE&resourceId=${manager.roleId}`);
    assert.equal(platformAudit.response.status, 200);
    assert.ok(Array.isArray(platformAudit.body));
    assert.ok((platformAudit.body as Array<{ resource: string; resourceId: string | null }>).length > 0);
    assert.ok((platformAudit.body as Array<{ resource: string; resourceId: string | null }>)
      .every((row) => row.resource === "ROLE" && row.resourceId === manager.roleId));

    const created = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({
        organizationId: target.organizationId,
        roleId: manager.roleId,
        scopeType: "ORGANIZATION",
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const createdBindingId = (created.body as { id: string }).id;
    const assignmentAudits = await db.select().from(authorizationAuditLogsTable).where(and(
      eq(authorizationAuditLogsTable.resource, "USER_ROLE_BINDING"),
      eq(authorizationAuditLogsTable.resourceId, createdBindingId),
      eq(authorizationAuditLogsTable.action, "ROLE_ASSIGNED"),
    ));
    assert.ok(assignmentAudits.length > 0);
    const generalPatch = await request(`/users/${target.userId}/role-bindings/${createdBindingId}`, {
      method: "PATCH",
      body: JSON.stringify({ scopeType: "ORGANIZATION" }),
    });
    assert.equal(generalPatch.response.status, 200, JSON.stringify(generalPatch.body));
    const generalUpdateAudits = await db.select().from(authorizationAuditLogsTable).where(and(
      eq(authorizationAuditLogsTable.resource, "USER_ROLE_BINDING"),
      eq(authorizationAuditLogsTable.resourceId, createdBindingId),
      eq(authorizationAuditLogsTable.action, "ROLE_BINDING_UPDATED"),
    ));
    assert.ok(generalUpdateAudits.length > 0);
    const [createdBeforeValidation] = await db.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.id, createdBindingId));
    assert.ok(createdBeforeValidation);
    const auditsBeforeRejectedBindingPatches = await db.select().from(authorizationAuditLogsTable)
      .where(and(
        eq(authorizationAuditLogsTable.actorUserId, platform.userId),
        eq(authorizationAuditLogsTable.resource, "USER_ROLE_BINDING"),
      ));
    for (const scopeType of ["FACILITY", "BUILDING", "SPACE", "ASSET", "ASSIGNED", "TEAM", "VENDOR_ASSIGNMENT", "OWNED_REQUEST"]) {
      const rejectedScope = await request(`/users/${target.userId}/role-bindings/${createdBindingId}`, {
        method: "PATCH",
        body: JSON.stringify({ scopeType, scopeId: null }),
      });
      assert.equal(rejectedScope.response.status, 400);
      const [unchanged] = await db.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.id, createdBindingId));
      assert.deepEqual(unchanged, createdBeforeValidation);
    }
    for (const invalidPatch of [
      { startsAt: "not-a-date" },
      { startsAt: "2026-02-01T00:00:00Z", endsAt: "2026-01-01T00:00:00Z" },
      { status: "ACTIVE", endsAt: new Date(Date.now() - 1000).toISOString() },
      { status: "EXPIRED" },
      { status: "EXPIRED", endsAt: new Date(Date.now() + 1000).toISOString() },
    ]) {
      const rejectedLifecycle = await request(`/users/${target.userId}/role-bindings/${createdBindingId}`, {
        method: "PATCH",
        body: JSON.stringify(invalidPatch),
      });
      assert.equal(rejectedLifecycle.response.status, 400);
      const [unchanged] = await db.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.id, createdBindingId));
      assert.deepEqual(unchanged, createdBeforeValidation);
    }
    const auditsAfterRejectedBindingPatches = await db.select().from(authorizationAuditLogsTable)
      .where(and(
        eq(authorizationAuditLogsTable.actorUserId, platform.userId),
        eq(authorizationAuditLogsTable.resource, "USER_ROLE_BINDING"),
      ));
    assert.equal(auditsAfterRejectedBindingPatches.length, auditsBeforeRejectedBindingPatches.length);
    const duplicate = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({
        organizationId: target.organizationId,
        roleId: manager.roleId,
        scopeType: "ORGANIZATION",
      }),
    });
    assert.equal(duplicate.response.status, 409);
    const listed = await request(`/users/${target.userId}/role-bindings`);
    assert.equal(listed.response.status, 200);
    assert.ok((listed.body as unknown[]).some((row) => (row as { id: string }).id === createdBindingId));

    const patched = await request(`/users/${target.userId}/role-bindings/${createdBindingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    assert.equal(patched.response.status, 200, JSON.stringify(patched.body));
    const suspensionAudits = await db.select().from(authorizationAuditLogsTable).where(and(
      eq(authorizationAuditLogsTable.resource, "USER_ROLE_BINDING"),
      eq(authorizationAuditLogsTable.resourceId, createdBindingId),
      eq(authorizationAuditLogsTable.action, "ROLE_SUSPENDED"),
    ));
    assert.ok(suspensionAudits.length > 0);
    const [freshBinding] = await db.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.id, createdBindingId));
    assert.ok(freshBinding);
    const concurrent = await Promise.all([
      request(`/users/${target.userId}/role-bindings/${createdBindingId}`, { method: "PATCH", body: JSON.stringify({ status: "ACTIVE" }) }),
      request(`/users/${target.userId}/role-bindings/${createdBindingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "EXPIRED", endsAt: new Date(Date.now() - 1000).toISOString() }),
      }),
    ]);
    assert.equal(concurrent.filter(({ response }) => response.status === 200).length, 1);
    assert.equal(concurrent.filter(({ response }) => response.status === 409).length, 1);
    const successfulConcurrent = concurrent.find(({ response }) => response.status === 200);
    assert.ok(successfulConcurrent);
    const concurrentAction = (successfulConcurrent.body as { status: string }).status === "ACTIVE"
      ? "ROLE_REACTIVATED"
      : "ROLE_EXPIRED";
    const transitionAudits = await db.select().from(authorizationAuditLogsTable).where(and(
      eq(authorizationAuditLogsTable.resource, "USER_ROLE_BINDING"),
      eq(authorizationAuditLogsTable.resourceId, createdBindingId),
      eq(authorizationAuditLogsTable.action, concurrentAction),
    ));
    assert.ok(transitionAudits.length > 0);

    const deleted = await request(`/users/${target.userId}/role-bindings/${createdBindingId}`, { method: "DELETE" });
    assert.equal(deleted.response.status, 200, JSON.stringify(deleted.body));
    const revocationAudits = await db.select().from(authorizationAuditLogsTable).where(and(
      eq(authorizationAuditLogsTable.resource, "USER_ROLE_BINDING"),
      eq(authorizationAuditLogsTable.resourceId, createdBindingId),
      eq(authorizationAuditLogsTable.action, "ROLE_REVOKED"),
    ));
    assert.ok(revocationAudits.length > 0);

    const selfPatch = await request(`/users/${platform.userId}/role-bindings/${platform.bindingId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SUSPENDED" }),
    });
    assert.equal(selfPatch.response.status, 403);
    const selfDelete = await request(`/users/${platform.userId}/role-bindings/${platform.bindingId}`, { method: "DELETE" });
    assert.equal(selfDelete.response.status, 403);
    actorId = manager.userId;
    const organizationAudit = await request("/audit-logs");
    // The role replacement above intentionally persisted explicit DENY rows,
    // including AUDIT_LOG.VIEW_AUDIT; the manager must remain denied until
    // the test's finally block restores the canonical matrix.
    assert.equal(organizationAudit.response.status, 403);
    const crossOrgList = await request(`/users/${target.userId}/role-bindings`);
    assert.equal(crossOrgList.response.status, 403);
    const crossOrgCreate = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({ organizationId: target.organizationId, roleId: manager.roleId, scopeType: "ORGANIZATION" }),
    });
    assert.equal(crossOrgCreate.response.status, 403);
    const crossOrgDelete = await request(`/users/${target.userId}/role-bindings/${createdBindingId}`, { method: "DELETE" });
    assert.equal(crossOrgDelete.response.status, 403);

    const mePermissions = await request("/me/permissions");
    assert.equal(mePermissions.response.status, 200);
    assert.equal((mePermissions.body as { organizationId: string }).organizationId, manager.organizationId);
    const meScope = await request("/me/scope");
    assert.equal(meScope.response.status, 200);
    assert.ok((meScope.body as Array<{ organizationId: string }>).every((row) => row.organizationId === manager.organizationId));

    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const probe = await request("/authorization/check", {
      method: "POST",
      body: JSON.stringify({ permission: "ORGANIZATION.VIEW", resourceType: "ORGANIZATION" }),
    });
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    assert.equal(probe.response.status, 404);
  } finally {
    server.close();
    await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, manager.roleId));
    const restored = roleCapabilityRows
      .filter(([, roleCode]) => roleCode === "FACILITY_MANAGER")
      .flatMap(([resource, , actions, defaultScopeType]) => actions.map((action) => ({
        roleId: manager.roleId,
        permissionId: seededPermissions.get(`${resource}.${action}`)!,
        defaultScopeType: defaultScopeType as "ORGANIZATION",
        effect: "ALLOW" as const,
      })));
    await db.insert(rolePermissionsTable).values(restored).onConflictDoNothing();
  }
});

test("permission introspection follows binding scope intersection and deny precedence", async () => {
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.update(rolePermissionsTable).set({ effect: "ALLOW" }).where(eq(rolePermissionsTable.roleId, manager.roleId));
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: manager.organizationId },
  });
  const app = express();
  app.use(express.json());
  app.use(createAuthorizationRouter({
    currentUser: async () => {
      const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, manager.userId));
      return actor ?? null;
    },
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const list = await listUserPermissions(manager.userId, manager.organizationId);
    assert.ok(list.some((permission) => permission.code === "ORGANIZATION.VIEW"));
    assert.equal(list.some((permission) => permission.code === "FACILITY.VIEW"), false);
    assert.equal(list.some((permission) => permission.code === "WORK_ORDER.VIEW"), false);
    const response = await fetch(`http://127.0.0.1:${address.port}/me/permissions`);
    assert.equal(response.status, 200);
    const body = await response.json() as { permissions: Array<{ code: string; scopeType: string }> };
    assert.ok(body.permissions.some((permission) => permission.code === "ORGANIZATION.VIEW"));
    assert.equal(body.permissions.some((permission) => permission.code === "FACILITY.VIEW"), false);
    assert.equal(body.permissions.some((permission) => permission.code === "WORK_ORDER.VIEW"), false);

    await db.insert(userRoleBindingsTable).values({
      userId: manager.userId,
      organizationId: manager.organizationId,
      roleId: manager.roleId,
      scopeType: "FACILITY",
      scopeId: null,
      grantedBy: manager.userId,
    });
    const legacyInvalidDecision = await authorize({
      actorUserId: manager.userId,
      organizationId: manager.organizationId,
      permission: "FACILITY.VIEW",
      resourceType: "FACILITY",
      verifiedContext: {
        organizationId: manager.organizationId,
        resourceScopeId: randomUUID(),
        scopeVerified: true,
      },
    });
    assert.equal(legacyInvalidDecision.allowed, false);
    assert.equal(
      (await listUserPermissions(manager.userId, manager.organizationId))
        .some((permission) => permission.code === "FACILITY.VIEW"),
      false,
    );

    const facilityScopeId = randomUUID();
    await db.insert(userRoleBindingsTable).values({
      userId: manager.userId,
      organizationId: manager.organizationId,
      roleId: manager.roleId,
      scopeType: "FACILITY",
      scopeId: facilityScopeId,
      grantedBy: manager.userId,
    });
    const scopedList = await listUserPermissions(manager.userId, manager.organizationId);
    assert.ok(scopedList.some((permission) => permission.code === "FACILITY.VIEW" && permission.scopeType === "FACILITY"));
    const scopedResponse = await fetch(`http://127.0.0.1:${address.port}/me/permissions`);
    const scopedBody = await scopedResponse.json() as { permissions: Array<{ code: string; scopeType: string }> };
    assert.ok(scopedBody.permissions.some((permission) => permission.code === "WORK_ORDER.VIEW" && permission.scopeType === "FACILITY"));

    const facilityPermission = await permissionId("FACILITY.VIEW");
    await db.update(rolePermissionsTable).set({ effect: "DENY" }).where(and(
      eq(rolePermissionsTable.roleId, manager.roleId),
      eq(rolePermissionsTable.permissionId, facilityPermission),
    ));
    const deniedList = await listUserPermissions(manager.userId, manager.organizationId);
    assert.equal(deniedList.some((permission) => permission.code === "FACILITY.VIEW"), false);
    const deniedResponse = await fetch(`http://127.0.0.1:${address.port}/me/permissions`);
    const deniedBody = await deniedResponse.json() as { permissions: Array<{ code: string }> };
    assert.equal(deniedBody.permissions.some((permission) => permission.code === "FACILITY.VIEW"), false);
    await db.update(rolePermissionsTable).set({ effect: "ALLOW" }).where(and(
      eq(rolePermissionsTable.roleId, manager.roleId),
      eq(rolePermissionsTable.permissionId, facilityPermission),
    ));
  } finally {
    server.close();
  }
});

test("foundation bootstrap remains idempotent and audit payload is sanitized", async () => {
  const externalAuthId = `task02-foundation-${randomUUID()}`;
  const identity = { externalAuthId, displayName: "Task 02 Foundation", email: `${randomUUID()}@task02.invalid` };
  const [first, second] = await Promise.all([
    ensureFoundationUser(identity),
    ensureFoundationUser(identity),
  ]);
  assert.equal(first.id, second.id);
  const firstSession = await getAppSession(first);
  const secondSession = await getAppSession(second);
  assert.equal(firstSession.memberships.length, 1);
  assert.deepEqual(secondSession.memberships, firstSession.memberships);
  const bindingCount = await db.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.userId, first.id));
  assert.equal(bindingCount.length, 1);
  const decision = await authorize({
    actorUserId: first.id,
    organizationId: firstSession.activeOrganization?.organization.id,
    permission: "NOTIFICATION.VIEW",
    resourceType: "NOTIFICATION",
    actionContext: { password: "secret", token: "secret", sessionSecret: "secret" },
    requestId: "task02-test",
  });
  assert.equal(decision.allowed, true);
  const auditRows = await db.select().from(authorizationAuditLogsTable).where(and(eq(authorizationAuditLogsTable.actorUserId, first.id), eq(authorizationAuditLogsTable.requestId, "task02-test")));
  assert.ok(auditRows.length > 0);
  assert.ok(auditRows.every((row) => !JSON.stringify(row).includes("secret")));
  await recordAuthorizationConfigurationAudit({
    actorUserId: first.id,
    organizationId: firstSession.activeOrganization?.organization.id,
    action: "PERMISSION_CHANGED",
    resource: "ROLE",
    resourceId: first.id,
    beforeState: { effect: "ALLOW", token: "secret" },
    afterState: { effect: "DENY", password: "secret" },
    reasonCode: "POLICY_TEST",
    requestId: "task02-test",
  });
  const configurationAudit = await db.select().from(authorizationAuditLogsTable).where(and(eq(authorizationAuditLogsTable.actorUserId, first.id), eq(authorizationAuditLogsTable.resource, "ROLE"), eq(authorizationAuditLogsTable.requestId, "task02-test")));
  assert.ok(configurationAudit.some((row) => row.beforeState?.includes("ALLOW") && row.afterState?.includes("DENY") && row.reasonCode === "POLICY_TEST"));
  assert.ok(configurationAudit.every((row) => !JSON.stringify(row).includes("secret")));
  await db.delete(authorizationAuditLogsTable).where(eq(authorizationAuditLogsTable.actorUserId, first.id));
  await db.delete(usersTable).where(eq(usersTable.id, first.id));
});

test("concurrent foundation bootstrap remains one user, membership, context and binding", async () => {
  const identity = {
    externalAuthId: `task02-concurrent-${randomUUID()}`,
    displayName: "Task 02 Concurrent",
    email: `${randomUUID()}@task02.invalid`,
  };
  const users = await Promise.all([
    ensureFoundationUser(identity),
    ensureFoundationUser(identity),
    ensureFoundationUser(identity),
  ]);
  assert.equal(new Set(users.map((user) => user.id)).size, 1);
  const userId = users[0]!.id;
  const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
  const contexts = await db.select().from(userContextsTable).where(eq(userContextsTable.userId, userId));
  const bindings = await db.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.userId, userId));
  assert.equal(memberships.length, 1);
  assert.equal(contexts.length, 1);
  assert.equal(bindings.length, 1);
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

test("facility registry resolves trusted ancestors and enforces every route surface", async () => {
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const [facility] = await db.insert(facilitiesTable).values({
    organizationId: manager.organizationId,
    name: "North Campus",
    code: "NORTH",
  }).returning();
  const [outsideFacility] = await db.insert(facilitiesTable).values({
    organizationId: manager.organizationId,
    name: "Restricted Campus",
    code: "RESTRICTED",
  }).returning();
  assert.ok(facility && outsideFacility);
  await db.update(userRoleBindingsTable).set({
    scopeType: "FACILITY",
    scopeId: facility.id,
  }).where(eq(userRoleBindingsTable.id, manager.bindingId));

  const [building] = await db.insert(buildingsTable).values({
    organizationId: manager.organizationId,
    facilityId: facility.id,
    name: "Main Building",
  }).returning();
  const [space] = await db.insert(spacesTable).values({
    organizationId: manager.organizationId,
    facilityId: facility.id,
    buildingId: building!.id,
    name: "Mechanical Room",
  }).returning();
  const [system] = await db.insert(systemsTable).values({
    organizationId: manager.organizationId,
    facilityId: facility.id,
    buildingId: building!.id,
    spaceId: space!.id,
    name: "HVAC",
  }).returning();
  const [asset] = await db.insert(assetsTable).values({
    organizationId: manager.organizationId,
    facilityId: facility.id,
    buildingId: building!.id,
    spaceId: space!.id,
    systemId: system!.id,
    name: "Air Handler",
  }).returning();
  assert.ok(building && space && system && asset);
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: manager.organizationId },
  });

  const resolved = await resolveRegistryObject(db, "ASSET", asset.id, manager.organizationId);
  assert.equal(resolved.found, true);
  if (resolved.found) {
    assert.deepEqual(resolved.value.verifiedContext, {
      organizationId: manager.organizationId,
      resourceOrganizationId: manager.organizationId,
      scopeVerified: true,
      assetId: asset.id,
      resourceScopeId: asset.id,
      facilityId: facility.id,
      buildingId: building.id,
      spaceId: space.id,
      systemId: system.id,
    });
  }
  const outsideDecision = await authorizeRegistryObject({
    database: db,
    actorUserId: manager.userId,
    organizationId: manager.organizationId,
    kind: "FACILITY",
    action: "VIEW",
    id: outsideFacility.id,
  });
  assert.equal(outsideDecision.decision.reasonCode, "SCOPE_MISMATCH");

  const [otherOrganization] = await db.insert(organizationsTable).values({
    name: "Other Organization",
    slug: `task02-registry-other-${randomUUID()}`,
  }).returning();
  const [otherFacility] = await db.insert(facilitiesTable).values({
    organizationId: otherOrganization!.id,
    name: "Other Campus",
  }).returning();

  const app = express();
  app.use(express.json());
  app.use(createFacilitiesRouter({
    currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, manager.userId)))[0] ?? null,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    return { response, text: await response.text() };
  };
  try {
    const listed = await request("/facilities?limit=1&page=1");
    assert.equal(listed.response.status, 200);
    const listedBody = JSON.parse(listed.text) as {
      items: Array<{ id: string; capabilities: {
        view: boolean;
        create: boolean;
        update: boolean;
        delete: boolean;
        createChildren: Record<string, boolean>;
      } }>;
      total: number;
    };
    // The second facility is in the same organization but outside the
    // actor's persisted facility binding and must not be enumerable.
    assert.equal(listedBody.total, 1);
    assert.equal(listedBody.items.length, 1);
    assert.deepEqual(listedBody.items[0]?.capabilities, {
      view: true,
      create: true,
      update: true,
      delete: true,
      createChildren: { BUILDING: true },
    });
    const searched = await request("/facilities/search?q=North");
    assert.equal(searched.response.status, 200);
    assert.equal((JSON.parse(searched.text) as { items: Array<{ id: string }> }).items[0]?.id, facility.id);
    const detail = await request(`/facilities/${facility.id}`);
    assert.equal(detail.response.status, 200);
    const outsideDetail = await request(`/facilities/${outsideFacility.id}`);
    assert.equal(outsideDetail.response.status, 403);
    const crossOrganizationDetail = await request(`/facilities/${otherFacility!.id}`);
    assert.equal(crossOrganizationDetail.response.status, 404);
    const nested = await request(`/facilities/${facility.id}/buildings`);
    assert.equal(nested.response.status, 200);
    assert.equal((JSON.parse(nested.text) as { items: Array<{ id: string }> }).items[0]?.id, building.id, nested.text);
    const nestedSearchPage = await request(`/facilities/${facility.id}/buildings?q=Main&page=1&limit=1`);
    assert.equal(nestedSearchPage.response.status, 200);
    const nestedSearchBody = JSON.parse(nestedSearchPage.text) as {
      items: Array<{ id: string }>;
      page: number;
      limit: number;
      total: number;
    };
    assert.equal(nestedSearchBody.items[0]?.id, building.id);
    assert.deepEqual(
      { page: nestedSearchBody.page, limit: nestedSearchBody.limit, total: nestedSearchBody.total },
      { page: 1, limit: 1, total: 1 },
    );
    const exported = await request("/assets/export");
    assert.equal(exported.response.status, 200);
    assert.match(exported.text, /Air Handler/);
    const bulkAssets = Array.from({ length: 501 }, (_, index) => ({
      organizationId: manager.organizationId,
      facilityId: facility.id,
      buildingId: building.id,
      spaceId: space.id,
      systemId: system.id,
      name: `Bulk Asset ${String(index).padStart(3, "0")}`,
    }));
    await db.insert(assetsTable).values(bulkAssets);
    const pagedAssets = await request("/assets?limit=1&page=2");
    assert.equal(pagedAssets.response.status, 200);
    const pagedAssetsBody = JSON.parse(pagedAssets.text) as { items: unknown[]; total: number };
    assert.equal(pagedAssetsBody.items.length, 1);
    assert.equal(pagedAssetsBody.total, 502);
    const batchedExport = await request("/assets/export");
    assert.equal(batchedExport.response.status, 200);
    assert.match(batchedExport.text, /Bulk Asset 500/);
    assert.equal(batchedExport.text.trim().split("\n").length, 503);
    const updated = await request(`/assets/${asset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Air Handler Updated" }),
    });
    assert.equal(updated.response.status, 200);
    const deniedUpdate = await request(`/facilities/${outsideFacility.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Tampered" }),
    });
    assert.equal(deniedUpdate.response.status, 403);
    const created = await request("/buildings", {
      method: "POST",
      body: JSON.stringify({ facilityId: facility.id, name: "Annex" }),
    });
    assert.equal(created.response.status, 201, created.text);
    const tamperedCreate = await request("/buildings", {
      method: "POST",
      body: JSON.stringify({ facilityId: outsideFacility.id, name: "Outside Annex" }),
    });
    assert.equal(tamperedCreate.response.status, 403);
    const nestedCreated = await request(`/facilities/${facility.id}/buildings`, {
      method: "POST",
      body: JSON.stringify({ name: "Nested Annex" }),
    });
    assert.equal(nestedCreated.response.status, 201, nestedCreated.text);
  } finally {
    server.close();
  }

  const bootstrap = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.insert(userContextsTable).values({
    userId: bootstrap.userId,
    activeOrganizationId: bootstrap.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: bootstrap.organizationId },
  });
  const bootstrapId = randomUUID();
  const bootstrapDecision = await authorize({
    actorUserId: bootstrap.userId,
    organizationId: bootstrap.organizationId,
    permission: "FACILITY.CREATE",
    resourceType: "FACILITY",
    resourceId: bootstrapId,
    verifiedContext: {
      organizationId: bootstrap.organizationId,
      facilityId: bootstrapId,
      resourceScopeId: bootstrapId,
      scopeVerified: true,
    },
  });
  assert.equal(bootstrapDecision.allowed, true, JSON.stringify(bootstrapDecision));
  const bootstrapFacility = await db.insert(facilitiesTable).values({
    organizationId: bootstrap.organizationId,
    name: "Bootstrap Facility",
  }).returning();
  const bootstrapView = await authorizeRegistryObject({
    database: db,
    actorUserId: bootstrap.userId,
    organizationId: bootstrap.organizationId,
    kind: "FACILITY",
    action: "VIEW",
    id: bootstrapFacility[0]!.id,
  });
  assert.equal(bootstrapView.decision.reasonCode, "SCOPE_MISMATCH");
  const bootstrapUpdate = await authorizeRegistryObject({
    database: db,
    actorUserId: bootstrap.userId,
    organizationId: bootstrap.organizationId,
    kind: "FACILITY",
    action: "UPDATE",
    id: bootstrapFacility[0]!.id,
  });
  assert.equal(bootstrapUpdate.decision.reasonCode, "SCOPE_MISMATCH");
  const bootstrapDelete = await authorizeRegistryObject({
    database: db,
    actorUserId: bootstrap.userId,
    organizationId: bootstrap.organizationId,
    kind: "FACILITY",
    action: "MANAGE",
    id: bootstrapFacility[0]!.id,
  });
  assert.equal(bootstrapDelete.decision.reasonCode, "SCOPE_MISMATCH");

  await assert.rejects(
    db.insert(spacesTable).values({
      organizationId: manager.organizationId,
      facilityId: outsideFacility.id,
      buildingId: building.id,
      name: "Cross Facility Tamper",
    }),
    (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23503",
  );
  await db.delete(organizationsTable).where(eq(organizationsTable.id, otherOrganization!.id));
});

test("registry HTTP adversarial matrix excludes unauthorized rows across every binding scope", async () => {
  type Kind = "FACILITY" | "BUILDING" | "SPACE" | "ASSET";
  type Chain = {
    facility: typeof facilitiesTable.$inferSelect;
    building: typeof buildingsTable.$inferSelect;
    space: typeof spacesTable.$inferSelect;
    system: typeof systemsTable.$inferSelect;
    asset: typeof assetsTable.$inferSelect;
  };
  const makeChain = async (organizationId: string, label: string): Promise<Chain> => {
    const [facility] = await db.insert(facilitiesTable).values({ organizationId, name: `${label} Facility` }).returning();
    assert.ok(facility);
    const [building] = await db.insert(buildingsTable).values({ organizationId, facilityId: facility.id, name: `${label} Building` }).returning();
    assert.ok(building);
    const [space] = await db.insert(spacesTable).values({ organizationId, facilityId: facility.id, buildingId: building.id, name: `${label} Space` }).returning();
    assert.ok(space);
    const [system] = await db.insert(systemsTable).values({ organizationId, facilityId: facility.id, buildingId: building.id, spaceId: space.id, name: `${label} System` }).returning();
    assert.ok(system);
    const [asset] = await db.insert(assetsTable).values({ organizationId, facilityId: facility.id, buildingId: building.id, spaceId: space.id, systemId: system.id, name: `${label} Asset` }).returning();
    assert.ok(asset);
    return { facility, building, space, system, asset };
  };
  const cases: Array<{
    kind: Kind;
    scopeType: "FACILITY" | "BUILDING" | "SPACE" | "ASSET";
    plural: string;
    nested: (chain: Chain) => string;
    createBody: (chain: Chain, organizationId: string) => Record<string, string>;
    row: (chain: Chain) => { id: string; name: string };
  }> = [
    { kind: "FACILITY", scopeType: "FACILITY", plural: "facilities", nested: (c) => `/facilities/${c.facility.id}/buildings`, createBody: (_, organizationId) => ({ organizationId, name: "Rejected Facility" }), row: (c) => c.facility },
    { kind: "BUILDING", scopeType: "BUILDING", plural: "buildings", nested: (c) => `/buildings/${c.building.id}/spaces`, createBody: (c) => ({ facilityId: c.facility.id, name: "Rejected Building" }), row: (c) => c.building },
    { kind: "SPACE", scopeType: "SPACE", plural: "spaces", nested: (c) => `/spaces/${c.space.id}/systems`, createBody: (c) => ({ facilityId: c.facility.id, buildingId: c.building.id, name: "Rejected Space" }), row: (c) => c.space },
    { kind: "ASSET", scopeType: "ASSET", plural: "assets", nested: (c) => `/spaces/${c.space.id}/assets`, createBody: (c) => ({ facilityId: c.facility.id, buildingId: c.building.id, spaceId: c.space.id, name: "Rejected Asset" }), row: (c) => c.asset },
  ];

  for (const testCase of cases) {
    const actor = await makeFixture("FACILITY_MANAGER", testCase.scopeType);
    const target = await makeChain(actor.organizationId, "Allowed");
    const denied = await makeChain(actor.organizationId, "Denied");
    const otherOrganization = await db.insert(organizationsTable).values({
      name: "Registry Matrix Other",
      slug: `task02-matrix-${randomUUID()}`,
    }).returning();
    assert.ok(otherOrganization[0]);
    const crossOrganization = await makeChain(otherOrganization[0]!.id, "Cross Organization");
    const targetRow = testCase.row(target);
    const deniedRow = testCase.row(denied);
    const crossRow = testCase.row(crossOrganization);
    await db.update(userRoleBindingsTable).set({
      scopeType: testCase.scopeType,
      scopeId: targetRow.id,
    }).where(eq(userRoleBindingsTable.id, actor.bindingId));
    await db.insert(userContextsTable).values({
      userId: actor.userId,
      activeOrganizationId: actor.organizationId,
    }).onConflictDoUpdate({
      target: userContextsTable.userId,
      set: { activeOrganizationId: actor.organizationId },
    });

    const app = express();
    app.use(express.json());
    app.use(createFacilitiesRouter({
      currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, actor.userId)))[0] ?? null,
    }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const request = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      });
      return { response, text: await response.text() };
    };
    try {
      const list = await request(`/${testCase.plural}?limit=1&page=1`);
      assert.equal(list.response.status, 200);
      const listBody = JSON.parse(list.text) as { items: Array<{ id: string }>; total: number; page: number; limit: number };
      assert.equal(listBody.total, 1);
      assert.equal(listBody.items.length, 1);
      assert.equal(listBody.items[0]?.id, targetRow.id);
      assert.equal(listBody.page, 1);
      assert.equal(listBody.limit, 1);
      assert.ok(!list.text.includes(deniedRow.id) && !list.text.includes(crossRow.id));

      const pageBoundary = await request(`/${testCase.plural}?limit=1&page=2`);
      assert.equal(pageBoundary.response.status, 200);
      const pageBody = JSON.parse(pageBoundary.text) as { items: unknown[]; total: number; page: number };
      assert.deepEqual(pageBody.items, []);
      assert.equal(pageBody.total, 1);
      assert.equal(pageBody.page, 2);
      const invalidPage = await request(`/${testCase.plural}?limit=1&page=0`);
      assert.equal(invalidPage.response.status, 200);
      assert.equal((JSON.parse(invalidPage.text) as { page: number }).page, 1);

      const search = await request(`/${testCase.plural}/search?q=Denied`);
      assert.equal(search.response.status, 200);
      const searchBody = JSON.parse(search.text) as { items: unknown[]; total: number };
      assert.deepEqual(searchBody.items, []);
      assert.equal(searchBody.total, 0);
      const exported = await request(`/${testCase.plural}/export`);
      assert.equal(exported.response.status, 200);
      assert.ok(exported.text.includes(targetRow.name));
      assert.ok(!exported.text.includes(deniedRow.name) && !exported.text.includes(crossRow.name));

      assert.equal((await request(`/${testCase.plural}/${targetRow.id}`)).response.status, 200);
      assert.equal((await request(`/${testCase.plural}/${deniedRow.id}`)).response.status, 403);
      assert.equal((await request(`/${testCase.plural}/${crossRow.id}`)).response.status, 404);
      assert.equal((await request(testCase.nested(target))).response.status, testCase.kind === "ASSET" ? 403 : 200);
      assert.equal((await request(testCase.nested(denied))).response.status, 403);
      assert.equal((await request(testCase.nested(crossOrganization))).response.status, 404);

      assert.equal((await request(`/${testCase.plural}/${deniedRow.id}`, {
        method: "PATCH", body: JSON.stringify({ name: "Rejected Update" }),
      })).response.status, 403);
      assert.equal((await request(`/${testCase.plural}/${deniedRow.id}`, { method: "DELETE" })).response.status, 403);
      assert.equal((await request(`/${testCase.plural}`, {
        method: "POST", body: JSON.stringify(testCase.createBody(target, actor.organizationId)),
      })).response.status, 403);

      // A binding must still authorize successful writes for its own resource
      // kind. Use an isolated candidate so later matrix cases retain their
      // complete ancestor chains.
      let writableId: string;
      if (testCase.kind === "FACILITY") {
        const [candidate] = await db.insert(facilitiesTable).values({ organizationId: actor.organizationId, name: "Writable Facility" }).returning();
        writableId = candidate!.id;
      } else if (testCase.kind === "BUILDING") {
        const [candidate] = await db.insert(buildingsTable).values({ organizationId: actor.organizationId, facilityId: target.facility.id, name: "Writable Building" }).returning();
        writableId = candidate!.id;
      } else if (testCase.kind === "SPACE") {
        const [candidate] = await db.insert(spacesTable).values({ organizationId: actor.organizationId, facilityId: target.facility.id, buildingId: target.building.id, name: "Writable Space" }).returning();
        writableId = candidate!.id;
      } else {
        const [candidate] = await db.insert(assetsTable).values({ organizationId: actor.organizationId, facilityId: target.facility.id, buildingId: target.building.id, spaceId: target.space.id, name: "Writable Asset" }).returning();
        writableId = candidate!.id;
      }
      await db.update(userRoleBindingsTable).set({ scopeId: writableId }).where(eq(userRoleBindingsTable.id, actor.bindingId));
      assert.equal((await request(`/${testCase.plural}/${writableId}`, {
        method: "PATCH", body: JSON.stringify({ name: "Writable Updated" }),
      })).response.status, 200);
      assert.equal((await request(`/${testCase.plural}/${writableId}`, { method: "DELETE" })).response.status, 204);
    } finally {
      server.close();
    }
    await db.delete(organizationsTable).where(eq(organizationsTable.id, otherOrganization[0]!.id));
  }
});

test("narrow registry scopes cannot authorize unrelated rows with colliding UUIDs", async () => {
  const cases = [
    { scopeType: "BUILDING" as const, resourcePath: "facilities" },
    { scopeType: "SPACE" as const, resourcePath: "buildings" },
    { scopeType: "ASSET" as const, resourcePath: "spaces" },
  ];
  for (const testCase of cases) {
    const actor = await makeFixture("FACILITY_MANAGER", testCase.scopeType);
    const collisionId = randomUUID();
    const [decoyFacility] = await db.insert(facilitiesTable).values({
      id: testCase.resourcePath === "facilities" ? collisionId : randomUUID(),
      organizationId: actor.organizationId,
      name: "Collision Decoy Facility",
    }).returning();
    assert.ok(decoyFacility);
    const [decoyBuilding] = await db.insert(buildingsTable).values({
      id: testCase.resourcePath === "buildings" ? collisionId : randomUUID(),
      organizationId: actor.organizationId,
      facilityId: decoyFacility.id,
      name: "Collision Decoy Building",
    }).returning();
    assert.ok(decoyBuilding);
    const [decoySpace] = await db.insert(spacesTable).values({
      id: testCase.resourcePath === "spaces" ? collisionId : randomUUID(),
      organizationId: actor.organizationId,
      facilityId: decoyFacility.id,
      buildingId: decoyBuilding.id,
      name: "Collision Decoy Space",
    }).returning();
    assert.ok(decoySpace);

    const [scopeFacility] = await db.insert(facilitiesTable).values({
      organizationId: actor.organizationId,
      name: "Scope Facility",
    }).returning();
    const [scopeBuilding] = await db.insert(buildingsTable).values({
      id: testCase.scopeType === "BUILDING" ? collisionId : randomUUID(),
      organizationId: actor.organizationId,
      facilityId: scopeFacility!.id,
      name: "Scope Building",
    }).returning();
    const [scopeSpace] = await db.insert(spacesTable).values({
      id: testCase.scopeType === "SPACE" ? collisionId : randomUUID(),
      organizationId: actor.organizationId,
      facilityId: scopeFacility!.id,
      buildingId: scopeBuilding!.id,
      name: "Scope Space",
    }).returning();
    if (testCase.scopeType === "ASSET") {
      await db.insert(assetsTable).values({
        id: collisionId,
        organizationId: actor.organizationId,
        facilityId: scopeFacility!.id,
        buildingId: scopeBuilding!.id,
        spaceId: scopeSpace!.id,
        name: "Scope Asset",
      });
    }
    await db.update(userRoleBindingsTable).set({ scopeId: collisionId })
      .where(eq(userRoleBindingsTable.id, actor.bindingId));
    await db.insert(userContextsTable).values({
      userId: actor.userId,
      activeOrganizationId: actor.organizationId,
    });

    const resource = testCase.resourcePath === "facilities"
      ? decoyFacility
      : testCase.resourcePath === "buildings" ? decoyBuilding : decoySpace;
    const app = express();
    app.use(createFacilitiesRouter({
      currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, actor.userId)))[0] ?? null,
    }));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const detail = await fetch(`${base}/${testCase.resourcePath}/${resource.id}`);
      assert.equal(detail.status, 403);
      const list = await fetch(`${base}/${testCase.resourcePath}`);
      const listBody = await list.json() as { items: Array<{ id: string }>; total: number };
      assert.equal(listBody.items.some((row) => row.id === resource.id), false);
      assert.equal(listBody.total, 0);
      const search = await fetch(`${base}/${testCase.resourcePath}/search?q=Collision`);
      const searchBody = await search.json() as { items: unknown[]; total: number };
      assert.deepEqual(searchBody.items, []);
      assert.equal(searchBody.total, 0);
      const exported = await fetch(`${base}/${testCase.resourcePath}/export`);
      assert.equal((await exported.text()).includes(resource.name), false);
    } finally {
      server.close();
    }
  }
});

test("CSV backpressure listeners remain bounded across slow-consumer drain cycles", async () => {
  const response = Object.assign(new EventEmitter(), { destroyed: false });
  for (let index = 0; index < 2_000; index += 1) {
    const drained = waitForCsvDrain(response);
    assert.equal(response.listenerCount("drain"), 1);
    assert.equal(response.listenerCount("close"), 1);
    assert.equal(response.listenerCount("error"), 1);
    response.emit("drain");
    await drained;
    assert.equal(response.listenerCount("drain"), 0);
    assert.equal(response.listenerCount("close"), 0);
    assert.equal(response.listenerCount("error"), 0);
  }
  response.destroyed = true;
  await assert.rejects(waitForCsvDrain(response), /client disconnected/);
  assert.equal(response.listenerCount("drain"), 0);
  assert.equal(response.listenerCount("close"), 0);
  assert.equal(response.listenerCount("error"), 0);
});

test("empty facility collection exposes server-derived bootstrap create capability", async () => {
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  });
  const app = express();
  app.use(express.json());
  app.use(createFacilitiesRouter({
    currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, manager.userId)))[0] ?? null,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/facilities`);
    assert.equal(response.status, 200);
    const body = await response.json() as {
      items: unknown[];
      total: number;
      collectionCapabilities: { create: boolean };
    };
    assert.deepEqual(body.items, []);
    assert.equal(body.total, 0);
    assert.deepEqual(body.collectionCapabilities, { create: true });
  } finally {
    server.close();
  }
});

test("mutation authorization linearizes against concurrent revocation and policy deny", async () => {
  const actor = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const [facility] = await db.insert(facilitiesTable).values({
    organizationId: actor.organizationId,
    name: "Linearization Facility",
  }).returning();
  assert.ok(facility);
  await db.update(userRoleBindingsTable).set({
    scopeType: "FACILITY",
    scopeId: facility.id,
  }).where(eq(userRoleBindingsTable.id, actor.bindingId));
  await db.insert(userContextsTable).values({
    userId: actor.userId,
    activeOrganizationId: actor.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: actor.organizationId },
  });
  const verifiedContext = {
    organizationId: actor.organizationId,
    resourceOrganizationId: actor.organizationId,
    facilityId: facility.id,
    resourceScopeId: facility.id,
    scopeVerified: true,
  };
  let releaseMutation!: () => void;
  const mutationGate = new Promise<void>((resolve) => { releaseMutation = resolve; });
  let authorizationComplete!: () => void;
  const authorizationGate = new Promise<void>((resolve) => { authorizationComplete = resolve; });
  const mutation = db.transaction(async (tx) => {
    const decision = await authorize({
      database: tx,
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      permission: "FACILITY.UPDATE",
      resourceType: "FACILITY",
      resourceId: facility.id,
      verifiedContext,
      requestId: "linearization-revocation",
    });
    assert.equal(decision.allowed, true);
    authorizationComplete();
    await mutationGate;
    await tx.update(facilitiesTable).set({ name: "Linearized Before Revocation" }).where(eq(facilitiesTable.id, facility.id));
  });
  await authorizationGate;
  let revocationSettled = false;
  const revocation = db.update(userRoleBindingsTable).set({ status: "SUSPENDED" })
    .where(eq(userRoleBindingsTable.id, actor.bindingId))
    .then(() => { revocationSettled = true; });
  await delay(50);
  assert.equal(revocationSettled, false, "revocation must wait on the mutation's locked authorization state");
  releaseMutation();
  await mutation;
  await revocation;
  const afterRevocation = await authorize({
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    permission: "FACILITY.UPDATE",
    resourceType: "FACILITY",
    resourceId: facility.id,
    verifiedContext,
    requestId: "linearization-revocation-after",
  });
  assert.equal(afterRevocation.allowed, false);

  await db.update(userRoleBindingsTable).set({ status: "ACTIVE" }).where(eq(userRoleBindingsTable.id, actor.bindingId));
  const permission = await permissionId("FACILITY.UPDATE");
  let releasePolicyMutation!: () => void;
  const policyMutationGate = new Promise<void>((resolve) => { releasePolicyMutation = resolve; });
  let policyAuthorizationComplete!: () => void;
  const policyAuthorizationGate = new Promise<void>((resolve) => { policyAuthorizationComplete = resolve; });
  const policyMutation = db.transaction(async (tx) => {
    const decision = await authorize({
      database: tx,
      actorUserId: actor.userId,
      organizationId: actor.organizationId,
      permission: "FACILITY.UPDATE",
      resourceType: "FACILITY",
      resourceId: facility.id,
      verifiedContext,
      requestId: "linearization-policy",
    });
    assert.equal(decision.allowed, true);
    policyAuthorizationComplete();
    await policyMutationGate;
    await tx.update(facilitiesTable).set({ name: "Linearized Before Policy Deny" }).where(eq(facilitiesTable.id, facility.id));
  });
  await policyAuthorizationGate;
  let policySettled = false;
  const policyDeny = db.update(rolePermissionsTable).set({ effect: "DENY" })
    .where(and(eq(rolePermissionsTable.roleId, actor.roleId), eq(rolePermissionsTable.permissionId, permission)))
    .then(() => { policySettled = true; });
  await delay(50);
  assert.equal(policySettled, false, "policy deny must wait on the mutation's locked authorization state");
  releasePolicyMutation();
  await policyMutation;
  await policyDeny;
  const afterPolicyDeny = await authorize({
    actorUserId: actor.userId,
    organizationId: actor.organizationId,
    permission: "FACILITY.UPDATE",
    resourceType: "FACILITY",
    resourceId: facility.id,
    verifiedContext,
    requestId: "linearization-policy-after",
  });
  assert.equal(afterPolicyDeny.allowed, false);
  await db.update(rolePermissionsTable).set({ effect: "ALLOW" })
    .where(and(eq(rolePermissionsTable.roleId, actor.roleId), eq(rolePermissionsTable.permissionId, permission)));
});