import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import {
  db,
  auditEventsTable,
  organizationsTable,
  permissionsTable,
  rolePermissionsTable,
  userContextsTable,
  userRoleBindingsTable,
  usersTable,
  membershipsTable,
} from "@workspace/db";
import {
  authorize,
  createBinding,
  revokeBinding,
  seedAuthorizationCatalog,
  updateBinding,
} from "./authorization";
import { ensureFoundationUser } from "./foundation";

const runId = randomUUID().slice(0, 8);
const ids = {
  manager: randomUUID(),
  managerOrg: randomUUID(),
  otherOrg: randomUUID(),
  technician: randomUUID(),
  technicianOrg: randomUUID(),
  assignedObject: randomUUID(),
  otherObject: randomUUID(),
  target: randomUUID(),
};

before(async () => {
  await seedAuthorizationCatalog();
  await db.insert(usersTable).values([
    {
      id: ids.manager,
      externalAuthId: `test-manager-${runId}`,
      displayName: "Authorization Manager",
      email: `manager-${runId}@example.com`,
    },
    {
      id: ids.technician,
      externalAuthId: `test-technician-${runId}`,
      displayName: "Authorization Technician",
      email: `technician-${runId}@example.com`,
    },
    {
      id: ids.target,
      externalAuthId: `test-target-${runId}`,
      displayName: "Authorization Target",
      email: `target-${runId}@example.com`,
    },
  ]);
  await db.insert(organizationsTable).values([
    { id: ids.managerOrg, name: "Authorization Org A", slug: `auth-a-${runId}` },
    { id: ids.otherOrg, name: "Authorization Org B", slug: `auth-b-${runId}` },
    { id: ids.technicianOrg, name: "Authorization Org C", slug: `auth-c-${runId}` },
  ]);
  await db.insert(membershipsTable).values([
    { userId: ids.manager, organizationId: ids.managerOrg, role: "FACILITY_MANAGER" },
    { userId: ids.technician, organizationId: ids.technicianOrg, role: "MAINTENANCE_TECHNICIAN" },
    { userId: ids.target, organizationId: ids.managerOrg, role: "INSPECTOR" },
  ]);
  await db.insert(userContextsTable).values([
    { userId: ids.manager, activeOrganizationId: ids.managerOrg },
    { userId: ids.technician, activeOrganizationId: ids.technicianOrg },
  ]);
  await db.insert(userRoleBindingsTable).values([
    {
      userId: ids.manager,
      organizationId: ids.managerOrg,
      role: "FACILITY_MANAGER",
      scopeType: "ORGANIZATION",
    },
    {
      userId: ids.technician,
      organizationId: ids.technicianOrg,
      role: "MAINTENANCE_TECHNICIAN",
      scopeType: "ASSIGNED",
      scopeId: ids.assignedObject,
    },
  ]);
});

after(async () => {
  await db.delete(organizationsTable).where(eq(organizationsTable.slug, `auth-a-${runId}`));
  await db.delete(organizationsTable).where(eq(organizationsTable.slug, `auth-b-${runId}`));
  await db.delete(organizationsTable).where(eq(organizationsTable.slug, `auth-c-${runId}`));
  await db.delete(usersTable).where(eq(usersTable.externalAuthId, `test-manager-${runId}`));
  await db.delete(usersTable).where(eq(usersTable.externalAuthId, `test-technician-${runId}`));
  await db.delete(usersTable).where(eq(usersTable.externalAuthId, `test-target-${runId}`));
});

test("authorization evaluator security matrix", async (t) => {
  await t.test("allows a canonical foundation permission in active organization scope", async () => {
    const decision = await authorize({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      permission: "SESSION.VIEW",
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reasonCode, "PERMISSION_GRANTED");
  });

  await t.test("denies unknown permissions by default", async () => {
    const decision = await authorize({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      permission: "UNKNOWN.MANAGE",
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "PERMISSION_NOT_GRANTED");
  });

  await t.test("denies cross-organization access", async () => {
    const decision = await authorize({
      actorUserId: ids.manager,
      organizationId: ids.otherOrg,
      permission: "SESSION.VIEW",
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "ORGANIZATION_MISMATCH");
  });

  await t.test("denies cross-organization direct resource IDs", async () => {
    const decision = await authorize({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      permission: "USER.VIEW",
      resourceId: ids.technician,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "SCOPE_DENIED");
  });

  await t.test("fails closed for object scopes until a server resolver exists", async () => {
    const assigned = await authorize({
      actorUserId: ids.technician,
      organizationId: ids.technicianOrg,
      permission: "WORK_ORDER.EXECUTE",
      resourceId: ids.assignedObject,
    });
    const unassigned = await authorize({
      actorUserId: ids.technician,
      organizationId: ids.technicianOrg,
      permission: "WORK_ORDER.EXECUTE",
      resourceId: ids.otherObject,
    });
    assert.equal(assigned.allowed, false);
    assert.equal(assigned.reasonCode, "SCOPE_DENIED");
    assert.equal(unassigned.allowed, false);
    assert.equal(unassigned.reasonCode, "SCOPE_DENIED");
  });

  await t.test("denies verification and close to the executing technician", async () => {
    for (const permission of ["WORK_ORDER.VERIFY", "WORK_ORDER.CLOSE"]) {
      const decision = await authorize({
        actorUserId: ids.technician,
        organizationId: ids.technicianOrg,
        permission,
        resourceId: ids.assignedObject,
      });
      assert.equal(decision.allowed, false);
    }
  });

  await t.test("denies suspended bindings", async () => {
    await db.update(userRoleBindingsTable).set({ status: "SUSPENDED" }).where(and(
      eq(userRoleBindingsTable.userId, ids.technician),
      eq(userRoleBindingsTable.organizationId, ids.technicianOrg),
    ));
    const decision = await authorize({
      actorUserId: ids.technician,
      organizationId: ids.technicianOrg,
      permission: "WORK_ORDER.EXECUTE",
      resourceId: ids.assignedObject,
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "BINDING_INACTIVE");
    await db.update(userRoleBindingsTable).set({ status: "ACTIVE" }).where(and(
      eq(userRoleBindingsTable.userId, ids.technician),
      eq(userRoleBindingsTable.organizationId, ids.technicianOrg),
    ));
  });

  await t.test("explicit deny takes precedence", async () => {
    const [permission] = await db.select().from(permissionsTable)
      .where(eq(permissionsTable.code, "SESSION.VIEW"));
    const [denyRule] = await db.insert(rolePermissionsTable).values({
      role: "FACILITY_MANAGER",
      permissionId: permission.id,
      defaultScopeType: "FACILITY",
      effect: "DENY",
    }).returning();
    const decision = await authorize({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      permission: "SESSION.VIEW",
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "EXPLICIT_DENY");
    await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.id, denyRule.id));
  });

  await t.test("service layer rejects direct administrative bypass", async () => {
    await assert.rejects(() => createBinding({
      actorUserId: ids.manager,
      userId: ids.target,
      organizationId: ids.managerOrg,
      role: "INSPECTOR",
      scopeType: "ORGANIZATION",
      reason: "Negative service authorization test",
    }), /ADMIN_PERMISSION_REQUIRED/);
  });

  await t.test("platform administration is not an operational bypass", async () => {
    await db.update(membershipsTable).set({ role: "PLATFORM_ADMIN" }).where(and(
      eq(membershipsTable.userId, ids.manager),
      eq(membershipsTable.organizationId, ids.managerOrg),
    ));
    await db.update(userRoleBindingsTable).set({
      role: "PLATFORM_ADMIN",
      scopeType: "PLATFORM",
      scopeId: null,
    }).where(and(
      eq(userRoleBindingsTable.userId, ids.manager),
      eq(userRoleBindingsTable.organizationId, ids.managerOrg),
    ));
    const admin = await authorize({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      permission: "ROLE.MANAGE",
    });
    const operational = await authorize({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      permission: "WORK_ORDER.EXECUTE",
      resourceId: ids.assignedObject,
    });
    assert.equal(admin.allowed, true);
    assert.equal(operational.allowed, false);
  });

  await t.test("revocation is terminal and carries an immutable audit reason", async () => {
    const binding = await createBinding({
      actorUserId: ids.manager,
      userId: ids.target,
      organizationId: ids.managerOrg,
      role: "INSPECTOR",
      scopeType: "ORGANIZATION",
      reason: "Lifecycle verification grant",
    });
    const revoked = await revokeBinding({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      bindingId: binding.id,
      reason: "Lifecycle verification revoke",
    });
    assert.equal(revoked?.status, "REVOKED");
    await assert.rejects(() => updateBinding({
      actorUserId: ids.manager,
      organizationId: ids.managerOrg,
      bindingId: binding.id,
      status: "ACTIVE",
      reason: "Attempt to reactivate terminal grant",
    }), /REVOKED_BINDING_IS_TERMINAL/);
    const [audit] = await db.select().from(auditEventsTable).where(and(
      eq(auditEventsTable.action, "AUTHORIZATION.ROLE_REVOKED"),
      eq(auditEventsTable.targetId, binding.id),
    ));
    assert.equal(
      (audit.metadata as { reason?: string }).reason,
      "Lifecycle verification revoke",
    );

    const concurrentBinding = await createBinding({
      actorUserId: ids.manager,
      userId: ids.target,
      organizationId: ids.managerOrg,
      role: "FACILITY_SUPERVISOR",
      scopeType: "ORGANIZATION",
      reason: "Concurrent lifecycle grant",
    });
    await Promise.allSettled([
      revokeBinding({
        actorUserId: ids.manager,
        organizationId: ids.managerOrg,
        bindingId: concurrentBinding.id,
        reason: "Concurrent lifecycle revoke",
      }),
      updateBinding({
        actorUserId: ids.manager,
        organizationId: ids.managerOrg,
        bindingId: concurrentBinding.id,
        status: "ACTIVE",
        reason: "Concurrent stale activation",
      }),
    ]);
    const [finalBinding] = await db.select().from(userRoleBindingsTable)
      .where(eq(userRoleBindingsTable.id, concurrentBinding.id));
    assert.equal(finalBinding.status, "REVOKED");
  });
});

test("first-access bootstrap is race-safe and idempotent", async () => {
  const externalAuthId = `race-${runId}`;
  const identity = {
    externalAuthId,
    displayName: "Concurrent Foundation User",
    email: `race-${runId}@example.com`,
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () => ensureFoundationUser(identity)),
  );
  assert.equal(new Set(results.map((user) => user.id)).size, 1);
  const userId = results[0].id;
  const users = await db.select().from(usersTable).where(eq(usersTable.externalAuthId, externalAuthId));
  const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, userId));
  const bindings = await db.select().from(userRoleBindingsTable).where(eq(userRoleBindingsTable.userId, userId));
  assert.equal(users.length, 1);
  assert.equal(memberships.length, 1);
  assert.equal(bindings.length, 1);
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});