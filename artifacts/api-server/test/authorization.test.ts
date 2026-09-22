import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer, request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { EventEmitter } from "node:events";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
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
  pool,
  rolePermissionsTable,
  rolesTable,
  spacesTable,
  systemsTable,
  teamsTable,
  userContextsTable,
  userRoleBindingsTable,
  usersTable,
  vendorAssignmentMembershipsTable,
  vendorAssignmentsTable,
} from "@workspace/db";
import {
  authorize,
  assertOrganizationScope,
  AuthorizationError,
  isSelfRoleEscalation,
  isBindingScopeCompatible,
  listUserPermissions,
  authorizationProbeAvailable,
  canCrossOrganizationFoundation,
  recordAuthorizationConfigurationAudit,
  requirePermission,
  resolveTeamWorkScope,
  resolveVendorAssignmentWorkScope,
  validateRoleBindingState,
} from "../src/services/authorization.ts";

test("binding compatibility uses shared scope semantics without broadening existing rules", () => {
  assert.equal(isBindingScopeCompatible("ORGANIZATION", "ASSET"), true);
  assert.equal(isBindingScopeCompatible("FACILITY", "FACILITY"), true);
  assert.equal(isBindingScopeCompatible("FACILITY", "ASSET"), true);
  assert.equal(isBindingScopeCompatible("ASSET", "FACILITY"), false);
  assert.equal(isBindingScopeCompatible("PORTFOLIO", "FACILITY"), false);
  assert.equal(isBindingScopeCompatible("PORTFOLIO", "PORTFOLIO"), true);
  assert.equal(isBindingScopeCompatible("TEAM", "TEAM"), true);
  assert.equal(isBindingScopeCompatible("TEAM", "SPACE"), false);
  assert.equal(isBindingScopeCompatible("UNKNOWN", "SPACE"), false);
});
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
import { createAccessRevisionBus } from "../src/services/access-revisions.ts";
import { createAuthorizationRouter } from "../src/routes/authorization.ts";
import { createFacilitiesRouter } from "../src/routes/facilities.ts";
import { waitForCsvDrain } from "../src/lib/csv-stream.ts";
import { createWorkOrderScopeGuard } from "../src/routes/work-order-scope.ts";
import {
  authorizeRegistryObject,
  parsePortfolioImport,
  portfolioImportHeaderLine,
  PORTFOLIO_IMPORT_MAX_ROWS,
  REGISTRY_SEARCH_MIN_LENGTH,
  RegistryExportAuthorizationError,
  listAuthorizedRegistryBatch,
  normalizedRegistrySearch,
  queryAuthorizedRegistryRows,
  resolveRegistryObject,
} from "../src/services/facilities.ts";

type Fixture = {
  userId: string;
  organizationId: string;
  roleId: string;
  roleCode: string;
  roleRegistryId: string;
  bindingId: string;
};

const fixtures: Fixture[] = [];
let seededRoles: Map<string, string>;
let seededPermissions: Map<string, string>;

async function makeFixture(
  roleCode: string,
  scopeType: "PLATFORM" | "ORGANIZATION" | "FACILITY" | "BUILDING" | "SPACE" | "ASSET" | "ASSIGNED" | "TEAM" | "VENDOR_ASSIGNMENT",
  scopeId?: string,
  existingOrganizationId?: string,
) {
  const [user] = await db.insert(usersTable).values({
    externalAuthId: `task02-test-${randomUUID()}`,
    displayName: `Task 02 ${roleCode}`,
    email: `${randomUUID()}@task02.invalid`,
  }).returning();
  const organization = existingOrganizationId
    ? { id: existingOrganizationId }
    : (await db.insert(organizationsTable).values({
      name: `Task 02 ${roleCode}`,
      slug: `task02-${randomUUID()}`,
    }).returning())[0]!;
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
    roleId: roleCode,
    scopeType,
    scopeId: scopeId ?? null,
    grantedBy: user.id,
  }).returning();
  assert.ok(binding);
  const fixture = { userId: user.id, organizationId: organization.id, roleId: roleCode, roleCode, roleRegistryId: roleId, bindingId: binding.id };
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

test("access revision events fan out between API instances through PostgreSQL", async () => {
  const firstInstance = createAccessRevisionBus(pool);
  const secondInstance = createAccessRevisionBus(pool);
  const event = {
    userId: randomUUID(),
    organizationId: randomUUID(),
    reason: "MEMBERSHIP_CHANGED" as const,
  };
  const received = new Promise<typeof event>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Cross-instance access revision timed out")), 2_000);
    void secondInstance.subscribe(event.userId, event.organizationId, (delivered) => {
      clearTimeout(timeout);
      resolve(delivered);
    }).then(async () => {
      await firstInstance.publish(event);
    }).catch(reject);
  });

  try {
    assert.deepEqual(await received, event);
  } finally {
    await Promise.all([firstInstance.close(), secondInstance.close()]);
  }
});

test("portfolio CSV parser requires exact headers and preserves stable references", () => {
  const csv = `${portfolioImportHeaderLine
    }FACILITY,facility-a,,,,,Main Campus,F-1,,ACTIVE\n`
    + "BUILDING,building-a,,,facility-a,,Admin Building,B-1,,ACTIVE\n";
  const result = parsePortfolioImport(csv);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.records.map((record) => [record.kind, record.clientRef, record.parentRef]), [
    ["FACILITY", "facility-a", undefined],
    ["BUILDING", "building-a", "facility-a"],
  ]);
});

test("portfolio CSV parser rejects duplicate references, malformed headers, and invalid rows", () => {
  const csv = `${portfolioImportHeaderLine
    }FACILITY,duplicate,,,,,One,F-1,,ACTIVE\n`
    + "FACILITY,duplicate,,,,,Two,F-2,,ACTIVE\n"
    + "FACILITY,unique,,,,,Three,F-3,,BROKEN\n";
  const result = parsePortfolioImport(csv);
  assert.ok(result.errors.some((error) => error.error.includes("Duplicate clientRef")));
  assert.ok(result.errors.some((error) => error.error.includes("status must be ACTIVE")));
  const badHeader = parsePortfolioImport("kind,clientRef\n");
  assert.equal(badHeader.records.length, 0);
  assert.ok(badHeader.errors.some((error) => error.row === 1 && error.error.includes("Header must be exactly")));
});

test("portfolio CSV parser bounds physical rows before collecting malformed-row errors", () => {
  const oversized = portfolioImportHeaderLine + "\n".repeat(PORTFOLIO_IMPORT_MAX_ROWS + 1);
  const result = parsePortfolioImport(oversized);
  assert.equal(result.records.length, 0);
  assert.deepEqual(result.errors, [{
    row: 1,
    error: `CSV may contain at most ${PORTFOLIO_IMPORT_MAX_ROWS} data rows`,
  }]);
});

test("portfolio import commits the complete hierarchy and audits every mutation atomically", async () => {
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  });
  const app = express();
  app.use(express.text({ type: "text/csv", limit: "2mb" }));
  app.use(createFacilitiesRouter({
    currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, manager.userId)))[0] ?? null,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const csv = portfolioImportHeaderLine
    + "ASSET,asset-a,,,space-a,system-a,Air Handler,AHU-IMPORT,,ACTIVE\n"
    + "SYSTEM,system-a,,,space-a,,HVAC,HVAC-IMPORT,,ACTIVE\n"
    + "SPACE,space-a,,,building-a,,Mechanical Room,SPACE-IMPORT,,ACTIVE\n"
    + "BUILDING,building-a,,,facility-a,,Main Building,BUILDING-IMPORT,,ACTIVE\n"
    + "FACILITY,facility-a,,,,,North Campus,FACILITY-IMPORT,,ACTIVE\n";
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/facilities/import`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: csv,
    });
    assert.equal(response.status, 201, await response.text());
    const [facility] = await db.select().from(facilitiesTable).where(and(
      eq(facilitiesTable.organizationId, manager.organizationId),
      eq(facilitiesTable.code, "FACILITY-IMPORT"),
    ));
    const [asset] = await db.select().from(assetsTable).where(and(
      eq(assetsTable.organizationId, manager.organizationId),
      eq(assetsTable.code, "AHU-IMPORT"),
    ));
    assert.ok(facility && asset);
    const resolved = await resolveRegistryObject(db, "ASSET", asset.id, manager.organizationId);
    assert.equal(resolved.found, true);
    if (resolved.found) assert.equal(resolved.value.verifiedContext.facilityId, facility.id);
    const audits = await db.select().from(authorizationAuditLogsTable).where(and(
      eq(authorizationAuditLogsTable.actorUserId, manager.userId),
      eq(authorizationAuditLogsTable.requestId, "undefined"),
    ));
    // Each row records both the authorization decision and the resulting
    // registry mutation, matching the existing single-create route pattern.
    assert.equal(audits.filter((audit) => audit.action === "CREATE").length, 10);
    assert.equal(audits.filter((audit) => audit.action === "IMPORT").length, 1);
  } finally {
    server.close();
  }
});

test("portfolio import preview summarizes the hierarchy without registry or audit writes", async () => {
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const [existingFacility] = await db.insert(facilitiesTable).values({
    organizationId: manager.organizationId,
    name: "Existing Campus",
    code: "EXISTING-CAMPUS",
    status: "ACTIVE",
  }).returning();
  await db.insert(userRoleBindingsTable).values({
    userId: manager.userId,
    organizationId: manager.organizationId,
    roleId: manager.roleCode,
    scopeType: "FACILITY",
    scopeId: existingFacility.id,
    grantedBy: manager.userId,
  });
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  });
  const app = express();
  app.use(express.text({ type: "text/csv", limit: "2mb" }));
  app.use(createFacilitiesRouter({
    currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, manager.userId)))[0] ?? null,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const csv = portfolioImportHeaderLine
    + "FACILITY,facility-preview,,,,,Preview Campus,FACILITY-PREVIEW,,ACTIVE\n"
    + "BUILDING,building-preview,,,facility-preview,,Preview Building,BUILDING-PREVIEW,,ACTIVE\n"
    + "SPACE,space-preview,,,building-preview,,Preview Space,SPACE-PREVIEW,,ACTIVE\n"
    + "SYSTEM,system-preview,,,space-preview,,Preview System,SYSTEM-PREVIEW,,ACTIVE\n"
    + "ASSET,asset-preview,,,space-preview,system-preview,Preview Asset,ASSET-PREVIEW,,ACTIVE\n"
    + `BUILDING,existing-building,,,${existingFacility.id},,Existing Campus Annex,EXISTING-ANNEX,,ACTIVE\n`;
  try {
    const auditsBefore = await db.select().from(authorizationAuditLogsTable).where(
      eq(authorizationAuditLogsTable.actorUserId, manager.userId),
    );
    const response = await fetch(`http://127.0.0.1:${address.port}/facilities/import/validate`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: csv,
    });
    const responseBody = await response.text();
    assert.equal(response.status, 200, responseBody);
    assert.deepEqual(JSON.parse(responseBody), {
      total: 6,
      facilities: 1,
      newFacilities: 1,
      existingFacilities: 1,
      buildings: 2,
      spaces: 1,
      systems: 1,
      assets: 1,
      facilityGroups: [{
        facilityStatus: "NEW_FACILITY",
        name: "Preview Campus",
        clientRef: "facility-preview",
        id: null,
        code: "FACILITY-PREVIEW",
        counts: { buildings: 1, spaces: 1, systems: 1, assets: 1 },
        records: [
          {
            row: 3, kind: "BUILDING", name: "Preview Building", clientRef: "building-preview",
            id: null, parentRef: "facility-preview", systemRef: null, code: "BUILDING-PREVIEW", status: "ACTIVE",
          },
          {
            row: 4, kind: "SPACE", name: "Preview Space", clientRef: "space-preview",
            id: null, parentRef: "building-preview", systemRef: null, code: "SPACE-PREVIEW", status: "ACTIVE",
          },
          {
            row: 5, kind: "SYSTEM", name: "Preview System", clientRef: "system-preview",
            id: null, parentRef: "space-preview", systemRef: null, code: "SYSTEM-PREVIEW", status: "ACTIVE",
          },
          {
            row: 6, kind: "ASSET", name: "Preview Asset", clientRef: "asset-preview",
            id: null, parentRef: "space-preview", systemRef: "system-preview", code: "ASSET-PREVIEW", status: "ACTIVE",
          },
        ],
      }, {
        facilityStatus: "EXISTING_FACILITY",
        name: "Existing Campus",
        clientRef: existingFacility.id,
        id: existingFacility.id,
        code: "EXISTING-CAMPUS",
        counts: { buildings: 1, spaces: 0, systems: 0, assets: 0 },
        records: [{
          row: 7, kind: "BUILDING", name: "Existing Campus Annex", clientRef: "existing-building",
          id: null, parentRef: existingFacility.id, systemRef: null, code: "EXISTING-ANNEX", status: "ACTIVE",
        }],
      }],
    });
    const [facility] = await db.select().from(facilitiesTable).where(and(
      eq(facilitiesTable.organizationId, manager.organizationId),
      eq(facilitiesTable.code, "FACILITY-PREVIEW"),
    ));
    assert.equal(facility, undefined);
    const auditsAfter = await db.select().from(authorizationAuditLogsTable).where(
      eq(authorizationAuditLogsTable.actorUserId, manager.userId),
    );
    assert.equal(auditsAfter.length, auditsBefore.length);
  } finally {
    server.close();
  }
});

test("portfolio import rolls back earlier rows when a later binding permission is denied", async () => {
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const [allowedFacility] = await db.insert(facilitiesTable).values({
    organizationId: manager.organizationId,
    name: "Allowed Campus",
  }).returning();
  assert.ok(allowedFacility);
  await db.update(userRoleBindingsTable).set({
    scopeType: "FACILITY",
    scopeId: allowedFacility.id,
  }).where(eq(userRoleBindingsTable.id, manager.bindingId));
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  });
  const app = express();
  app.use(express.text({ type: "text/csv", limit: "2mb" }));
  app.use(createFacilitiesRouter({
    currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, manager.userId)))[0] ?? null,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const csv = portfolioImportHeaderLine
    + `BUILDING,allowed-building,,,${allowedFacility.id},,Must Roll Back,ROLLBACK-BUILDING,,ACTIVE\n`
    + "FACILITY,denied-facility,,,,,Denied Campus,ROLLBACK-FACILITY,,ACTIVE\n";
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/facilities/import`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: csv,
    });
    assert.equal(response.status, 403);
    const buildings = await db.select().from(buildingsTable).where(and(
      eq(buildingsTable.organizationId, manager.organizationId),
      eq(buildingsTable.code, "ROLLBACK-BUILDING"),
    ));
    const facilities = await db.select().from(facilitiesTable).where(and(
      eq(facilitiesTable.organizationId, manager.organizationId),
      eq(facilitiesTable.code, "ROLLBACK-FACILITY"),
    ));
    assert.equal(buildings.length, 0);
    assert.equal(facilities.length, 0);
    const createAudits = await db.select().from(authorizationAuditLogsTable).where(and(
      eq(authorizationAuditLogsTable.actorUserId, manager.userId),
      eq(authorizationAuditLogsTable.action, "CREATE"),
    ));
    assert.equal(createAudits.length, 0);
  } finally {
    server.close();
  }
});

test("concurrent portfolio imports serialize duplicate validation per organization", async () => {
  const manager = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.insert(userContextsTable).values({
    userId: manager.userId,
    activeOrganizationId: manager.organizationId,
  });
  const app = express();
  app.use(express.text({ type: "text/csv", limit: "2mb" }));
  app.use(createFacilitiesRouter({
    currentUser: async () => (await db.select().from(usersTable).where(eq(usersTable.id, manager.userId)))[0] ?? null,
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const csv = portfolioImportHeaderLine
    + "FACILITY,concurrent-facility,,,,,Concurrent Campus,CONCURRENT-IMPORT,,ACTIVE\n";
  const send = () => fetch(`http://127.0.0.1:${address.port}/facilities/import`, {
    method: "POST",
    headers: { "content-type": "text/csv" },
    body: csv,
  });
  try {
    const responses = await Promise.all([send(), send()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 400]);
    const imported = await db.select().from(facilitiesTable).where(and(
      eq(facilitiesTable.organizationId, manager.organizationId),
      eq(facilitiesTable.code, "CONCURRENT-IMPORT"),
    ));
    assert.equal(imported.length, 1);
    const rejected = responses.find((response) => response.status === 400);
    assert.match(await rejected!.text(), /already exists/);
  } finally {
    server.close();
  }
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
  assert.equal(validateRoleBindingState({
    scopeType: "ORGANIZATION", scopeId: null, status: "REVOKED",
    startsAt: null, endsAt: null,
  }).valid, false);
});

test("persisted REVOKED bindings deny and writable APIs reject REVOKED", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.update(userRoleBindingsTable)
    .set({ status: "REVOKED" })
    .where(eq(userRoleBindingsTable.id, fixture.bindingId));
  const denied = await authorize({
    actorUserId: fixture.userId,
    organizationId: fixture.organizationId,
    permission: "ORGANIZATION.VIEW",
    resourceType: "ORGANIZATION",
  });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reasonCode, "BINDING_INACTIVE");

  await db.insert(userContextsTable).values({
    userId: fixture.userId,
    activeOrganizationId: fixture.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: fixture.organizationId },
  });
  const app = express();
  app.use(express.json());
  app.use(createAuthorizationRouter({
    currentUser: async () => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, fixture.userId));
      return user ?? null;
    },
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/users/${fixture.userId}/role-bindings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: fixture.organizationId,
        roleId: fixture.roleRegistryId,
        scopeType: "ORGANIZATION",
        status: "REVOKED",
      }),
    });
    assert.equal(response.status, 400);
    const patchResponse = await fetch(
      `http://127.0.0.1:${address.port}/users/${fixture.userId}/role-bindings/${fixture.bindingId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "REVOKED" }),
      },
    );
    assert.equal(patchResponse.status, 400);
  } finally {
    server.close();
  }
});

test("deprecated registry roles are denied even with active persisted grants", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.update(rolesTable)
    .set({ status: "DEPRECATED" })
    .where(eq(rolesTable.code, fixture.roleCode));
  try {
    const denied = await authorize({
      actorUserId: fixture.userId,
      organizationId: fixture.organizationId,
      permission: "ORGANIZATION.VIEW",
      resourceType: "ORGANIZATION",
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reasonCode, "PERMISSION_MISSING");
  } finally {
    await db.update(rolesTable)
      .set({ status: "ACTIVE" })
      .where(eq(rolesTable.code, fixture.roleCode));
  }
});

test("duplicate null-scope bindings are rejected by the database constraint", async () => {
  const fixture = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await assert.rejects(
    db.insert(userRoleBindingsTable).values({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      roleId: fixture.roleCode,
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

test("work scope resolvers reject spoofed, inactive, deleted, and cross-organization IDs", async () => {
  const organizationA = (await db.insert(organizationsTable).values({
    name: "Work Scope A",
    slug: `work-scope-a-${randomUUID()}`,
  }).returning())[0]!;
  const organizationB = (await db.insert(organizationsTable).values({
    name: "Work Scope B",
    slug: `work-scope-b-${randomUUID()}`,
  }).returning())[0]!;
  const [activeTeam, inactiveTeam, deletedTeam] = await db.insert(teamsTable).values([
    { organizationId: organizationA.id, name: "Shared Team", code: "SHARED", status: "ACTIVE" },
    { organizationId: organizationA.id, name: "Retired Team", code: "RETIRED", status: "INACTIVE" },
    { organizationId: organizationA.id, name: "Deleted Team", code: "DELETED", status: "ACTIVE" },
  ]).returning();
  const [activeVendor, inactiveVendor, deletedVendor] = await db.insert(vendorAssignmentsTable).values([
    { organizationId: organizationA.id, name: "Shared Vendor", code: "SHARED", status: "ACTIVE" },
    { organizationId: organizationA.id, name: "Retired Vendor", code: "RETIRED", status: "INACTIVE" },
    { organizationId: organizationA.id, name: "Deleted Vendor", code: "DELETED", status: "ACTIVE" },
  ]).returning();
  await db.insert(teamsTable).values({
    organizationId: organizationB.id,
    name: activeTeam!.name,
    code: activeTeam!.code,
    status: "ACTIVE",
  });
  const collidingVendorAssignment = (await db.insert(vendorAssignmentsTable).values({
    organizationId: organizationB.id,
    name: activeVendor!.name,
    code: activeVendor!.code,
    status: "ACTIVE",
  }).returning())[0]!;
  const vendorA = await makeFixture("VENDOR", "VENDOR_ASSIGNMENT", activeVendor!.id, organizationA.id);
  const vendorB = await makeFixture("VENDOR", "VENDOR_ASSIGNMENT", collidingVendorAssignment.id, organizationB.id);
  const inactiveMember = await makeFixture("VENDOR", "VENDOR_ASSIGNMENT", activeVendor!.id, organizationA.id);
  const removedMember = await makeFixture("VENDOR", "VENDOR_ASSIGNMENT", activeVendor!.id, organizationA.id);
  await db.insert(vendorAssignmentMembershipsTable).values([
    {
      organizationId: organizationA.id,
      vendorAssignmentId: activeVendor!.id,
      userId: vendorA.userId,
      status: "ACTIVE",
    },
    {
      organizationId: organizationA.id,
      vendorAssignmentId: activeVendor!.id,
      userId: inactiveMember.userId,
      status: "INACTIVE",
    },
    {
      organizationId: organizationA.id,
      vendorAssignmentId: activeVendor!.id,
      userId: removedMember.userId,
      status: "ACTIVE",
    },
    {
      organizationId: organizationA.id,
      vendorAssignmentId: inactiveVendor!.id,
      userId: vendorA.userId,
      status: "ACTIVE",
    },
    {
      organizationId: organizationA.id,
      vendorAssignmentId: deletedVendor!.id,
      userId: vendorA.userId,
      status: "ACTIVE",
    },
    {
      organizationId: organizationB.id,
      vendorAssignmentId: collidingVendorAssignment.id,
      userId: vendorB.userId,
      status: "ACTIVE",
    },
  ]);
  await assert.rejects(
    db.insert(vendorAssignmentMembershipsTable).values({
      organizationId: organizationB.id,
      vendorAssignmentId: activeVendor!.id,
      userId: vendorB.userId,
      status: "ACTIVE",
    }),
    (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23503",
  );
  await db.delete(vendorAssignmentMembershipsTable).where(and(
    eq(vendorAssignmentMembershipsTable.organizationId, organizationA.id),
    eq(vendorAssignmentMembershipsTable.vendorAssignmentId, activeVendor!.id),
    eq(vendorAssignmentMembershipsTable.userId, removedMember.userId),
  ));
  await db.delete(teamsTable).where(eq(teamsTable.id, deletedTeam!.id));
  await db.delete(vendorAssignmentsTable).where(eq(vendorAssignmentsTable.id, deletedVendor!.id));

  const activeTeamResolution = await resolveTeamWorkScope(db, organizationA.id, activeTeam!.id);
  const activeVendorResolution = await resolveVendorAssignmentWorkScope(
    db,
    organizationA.id,
    activeVendor!.id,
    vendorA.userId,
  );
  assert.deepEqual(activeTeamResolution, {
    found: true,
    verifiedContext: {
      organizationId: organizationA.id,
      teamId: activeTeam!.id,
      scopeVerified: true,
    },
  });
  assert.deepEqual(activeVendorResolution, {
    found: true,
    verifiedContext: {
      organizationId: organizationA.id,
      vendorAssignmentId: activeVendor!.id,
      vendorUserId: vendorA.userId,
      scopeVerified: true,
    },
  });

  const rejected = await Promise.all([
    resolveTeamWorkScope(db, organizationB.id, activeTeam!.id),
    resolveTeamWorkScope(db, organizationA.id, inactiveTeam!.id),
    resolveTeamWorkScope(db, organizationA.id, deletedTeam!.id),
    resolveTeamWorkScope(db, organizationA.id, randomUUID()),
    resolveVendorAssignmentWorkScope(db, organizationA.id, activeVendor!.id, vendorB.userId),
    resolveVendorAssignmentWorkScope(db, organizationA.id, activeVendor!.id, inactiveMember.userId),
    resolveVendorAssignmentWorkScope(db, organizationA.id, activeVendor!.id, removedMember.userId),
    resolveVendorAssignmentWorkScope(db, organizationB.id, activeVendor!.id, vendorB.userId),
    resolveVendorAssignmentWorkScope(db, organizationA.id, inactiveVendor!.id, vendorA.userId),
    resolveVendorAssignmentWorkScope(db, organizationA.id, deletedVendor!.id, vendorA.userId),
    resolveVendorAssignmentWorkScope(db, organizationA.id, randomUUID(), vendorA.userId),
  ]);
  assert.ok(rejected.every((result) => result.found === false), JSON.stringify(rejected));

  await db.delete(organizationsTable).where(inArray(
    organizationsTable.id,
    [organizationA.id, organizationB.id],
  ));
});

test("work-order route guards reject unverified team and vendor scope before resource access", async () => {
  const organizationA = (await db.insert(organizationsTable).values({
    name: "Work Route A",
    slug: `work-route-a-${randomUUID()}`,
  }).returning())[0]!;
  const organizationB = (await db.insert(organizationsTable).values({
    name: "Work Route B",
    slug: `work-route-b-${randomUUID()}`,
  }).returning())[0]!;
  const actor = await makeFixture("VENDOR", "VENDOR_ASSIGNMENT", randomUUID(), organizationA.id);
  await db.insert(userContextsTable).values({
    userId: actor.userId,
    activeOrganizationId: organizationA.id,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: organizationA.id },
  });
  const [inactiveTeam] = await db.insert(teamsTable).values({
    organizationId: organizationA.id,
    name: "Inactive route team",
    code: `INACTIVE-${randomUUID()}`,
    status: "INACTIVE",
  }).returning();
  const [crossOrganizationTeam] = await db.insert(teamsTable).values({
    organizationId: organizationB.id,
    name: "Cross organization route team",
    code: `CROSS-${randomUUID()}`,
    status: "ACTIVE",
  }).returning();
  const [activeTeam] = await db.insert(teamsTable).values({
    organizationId: organizationA.id,
    name: "Active route team",
    code: `ACTIVE-${randomUUID()}`,
    status: "ACTIVE",
  }).returning();
  const [inactiveVendorAssignment] = await db.insert(vendorAssignmentsTable).values({
    organizationId: organizationA.id,
    name: "Inactive route vendor",
    code: `INACTIVE-${randomUUID()}`,
    status: "INACTIVE",
  }).returning();
  const [crossOrganizationVendorAssignment] = await db.insert(vendorAssignmentsTable).values({
    organizationId: organizationB.id,
    name: "Cross organization route vendor",
    code: `CROSS-${randomUUID()}`,
    status: "ACTIVE",
  }).returning();
  const [activeVendorAssignment] = await db.insert(vendorAssignmentsTable).values({
    organizationId: organizationA.id,
    name: "Active route vendor",
    code: `ACTIVE-${randomUUID()}`,
    status: "ACTIVE",
  }).returning();
  await db.insert(vendorAssignmentMembershipsTable).values([
    {
      organizationId: organizationA.id,
      vendorAssignmentId: inactiveVendorAssignment!.id,
      userId: actor.userId,
      status: "ACTIVE",
    },
    {
      organizationId: organizationA.id,
      vendorAssignmentId: activeVendorAssignment!.id,
      userId: actor.userId,
      status: "ACTIVE",
    },
  ]);

  let resourceReads = 0;
  let resourceWrites = 0;
  const app = express();
  app.use(express.json());
  const guardDependencies = {
    currentUser: async () =>
      (await db.select().from(usersTable).where(eq(usersTable.id, actor.userId)))[0] ?? null,
  };
  app.get(
    "/work-orders/team/:teamId/:scopeVerified",
    createWorkOrderScopeGuard("TEAM", "teamId", guardDependencies),
    (_req, res) => {
      resourceReads += 1;
      res.json(res.locals.verifiedWorkOrderScope);
    },
  );
  app.post(
    "/work-orders/vendor/:vendorAssignmentId/:scopeVerified",
    createWorkOrderScopeGuard("VENDOR_ASSIGNMENT", "vendorAssignmentId", guardDependencies),
    (_req, res) => {
      resourceWrites += 1;
      res.status(201).json(res.locals.verifiedWorkOrderScope);
    },
  );
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const allowedTeam = await fetch(
      `${base}/work-orders/team/${activeTeam!.id}/false`,
    );
    assert.equal(allowedTeam.status, 200);
    assert.deepEqual(await allowedTeam.json(), {
      organizationId: organizationA.id,
      teamId: activeTeam!.id,
      scopeVerified: true,
    });
    const allowedVendor = await fetch(
      `${base}/work-orders/vendor/${activeVendorAssignment!.id}/false`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scopeVerified: false,
          organizationId: organizationB.id,
          vendorUserId: randomUUID(),
        }),
      },
    );
    assert.equal(allowedVendor.status, 201);
    assert.deepEqual(await allowedVendor.json(), {
      organizationId: organizationA.id,
      vendorAssignmentId: activeVendorAssignment!.id,
      vendorUserId: actor.userId,
      scopeVerified: true,
    });
    for (const teamId of [crossOrganizationTeam!.id, inactiveTeam!.id]) {
      const response = await fetch(`${base}/work-orders/team/${teamId}/true`);
      assert.equal(response.status, 404);
    }
    for (const vendorAssignmentId of [
      crossOrganizationVendorAssignment!.id,
      inactiveVendorAssignment!.id,
    ]) {
      const response = await fetch(
        `${base}/work-orders/vendor/${vendorAssignmentId}/true`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scopeVerified: true,
            organizationId: actor.organizationId,
            vendorUserId: actor.userId,
          }),
        },
      );
      assert.equal(response.status, 404);
    }
    assert.equal(resourceReads, 1);
    assert.equal(resourceWrites, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    await db.delete(organizationsTable).where(inArray(
      organizationsTable.id,
      [organizationA.id, organizationB.id],
    ));
  }
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
  await db.update(organizationsTable)
    .set({ name: `Route Target ${randomUUID()}` })
    .where(eq(organizationsTable.id, target.organizationId));
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
    roleId: manager.roleCode,
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
    assert.ok((platformSearch.body as { items: Array<{ userId: string; organizationId: string }> }).items
      .some((row) => row.userId === target.userId && row.organizationId === target.organizationId));
    const platformFilteredSearch = await request(
      `/users/search?query=${encodeURIComponent(targetUser.email)}&organizationId=${target.organizationId}&page=1&limit=1`,
    );
    assert.equal(platformFilteredSearch.response.status, 200);
    assert.equal((platformFilteredSearch.body as { page: number }).page, 1);
    assert.equal((platformFilteredSearch.body as { limit: number }).limit, 1);
    assert.equal((platformFilteredSearch.body as { total: number }).total, 1);
    assert.deepEqual(
      (platformFilteredSearch.body as { items: Array<{ organizationId: string }> }).items.map((row) => row.organizationId),
      [target.organizationId],
    );
    const [targetOrganization] = await db.select().from(organizationsTable)
      .where(eq(organizationsTable.id, target.organizationId));
    assert.ok(targetOrganization);
    const rankingToken = `rank-${randomUUID()}`;
    const rankedOrganizations = await db.insert(organizationsTable).values([
      { name: rankingToken, slug: `exact-name-${randomUUID()}` },
      { name: `${rankingToken} prefix`, slug: `prefix-name-${randomUUID()}` },
      { name: `contains ${rankingToken} value`, slug: `contains-name-${randomUUID()}` },
      { name: `Inactive ${rankingToken}`, slug: `inactive-${randomUUID()}`, isActive: false },
    ]).returning();
    const rankedOrganizationSearch = await request(
      `/organizations/search?query=${encodeURIComponent(rankingToken)}`,
    );
    assert.equal(rankedOrganizationSearch.response.status, 200);
    assert.deepEqual(
      (rankedOrganizationSearch.body as Array<{ id: string }>).map((row) => row.id),
      rankedOrganizations.slice(0, 3).map((row) => row.id),
    );
    const wildcardToken = randomUUID();
    const wildcardOrganizations = await db.insert(organizationsTable).values([
      { name: `Rate 50% ${wildcardToken}`, slug: `percent-${wildcardToken}` },
      { name: `Unit_A ${wildcardToken}`, slug: `underscore-${wildcardToken}` },
      { name: `Rate 500 ${wildcardToken}`, slug: `percent-decoy-${wildcardToken}` },
      { name: `UnitXA ${wildcardToken}`, slug: `underscore-decoy-${wildcardToken}` },
    ]).returning();
    const literalPercentSearch = await request(
      `/organizations/search?query=${encodeURIComponent(`50% ${wildcardToken}`)}`,
    );
    assert.equal(literalPercentSearch.response.status, 200);
    assert.deepEqual(
      (literalPercentSearch.body as Array<{ id: string }>).map((row) => row.id),
      [wildcardOrganizations[0].id],
    );
    const literalUnderscoreSearch = await request(
      `/organizations/search?query=${encodeURIComponent(`Unit_A ${wildcardToken}`)}`,
    );
    assert.equal(literalUnderscoreSearch.response.status, 200);
    assert.deepEqual(
      (literalUnderscoreSearch.body as Array<{ id: string }>).map((row) => row.id),
      [wildcardOrganizations[1].id],
    );
    const organizationByName = await request(
      `/organizations/search?query=${encodeURIComponent(targetOrganization.name)}`,
    );
    assert.equal(organizationByName.response.status, 200);
    assert.ok((organizationByName.body as Array<{ id: string; name: string; slug: string }>)
      .some((row) => row.id === target.organizationId && row.slug === targetOrganization.slug));
    const organizationBySlug = await request(
      `/organizations/search?query=${encodeURIComponent(targetOrganization.slug)}`,
    );
    assert.equal(organizationBySlug.response.status, 200);
    assert.ok((organizationBySlug.body as Array<{ id: string }>)
      .some((row) => row.id === target.organizationId));
    const invalidOrganizationSearch = await request("/organizations/search?query=x");
    assert.equal(invalidOrganizationSearch.response.status, 400);
    const platformEmptySecondPage = await request(
      `/users/search?query=${encodeURIComponent(targetUser.email)}&organizationId=${target.organizationId}&page=2&limit=1`,
    );
    assert.deepEqual((platformEmptySecondPage.body as { items: unknown[] }).items, []);

    actorId = manager.userId;
    const forbiddenOrganizationDirectory = await request("/organizations/search?query=org");
    assert.equal(forbiddenOrganizationDirectory.response.status, 403);
    const scopedOwnSearch = await request(
      `/users/search?query=${encodeURIComponent(managerUser.email)}&organizationId=${target.organizationId}`,
    );
    assert.equal(scopedOwnSearch.response.status, 200);
    assert.ok((scopedOwnSearch.body as { items: Array<{ userId: string; organizationId: string }> }).items
      .some((row) => row.userId === manager.userId && row.organizationId === manager.organizationId));
    const scopedCrossOrgSearch = await request(`/users/search?query=${encodeURIComponent(targetUser.email)}`);
    assert.equal(scopedCrossOrgSearch.response.status, 200);
    assert.deepEqual((scopedCrossOrgSearch.body as { items: unknown[] }).items, []);
    const invalidSearch = await request("/users/search?query=x");
    assert.equal(invalidSearch.response.status, 400);
    const invalidPage = await request("/users/search?query=target&page=0");
    assert.equal(invalidPage.response.status, 400);
    actorId = platform.userId;

    const permissions = await request("/permissions");
    assert.equal(permissions.response.status, 200);
    const roles = await request("/roles");
    assert.equal(roles.response.status, 200);
    const rolePermissions = await request(`/roles/${manager.roleRegistryId}/permissions`);
    assert.equal(rolePermissions.response.status, 200);
    const version = rolePermissions.response.headers.get("etag");
    assert.ok(version);
    assert.equal((rolePermissions.body as { policyVersion: string }).policyVersion, version);
    assert.ok(Array.isArray((rolePermissions.body as { permissions: unknown[] }).permissions));
    const missingPrecondition = await request(`/roles/${manager.roleRegistryId}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions: [] }),
    });
    assert.equal(missingPrecondition.response.status, 428);

    const revoked = await request(`/roles/${manager.roleRegistryId}/permissions`, {
      method: "PUT",
      headers: { "if-match": version! },
      body: JSON.stringify({ permissions: [] }),
    });
    assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
    assert.ok(Array.isArray((revoked.body as { permissions: unknown[] }).permissions));
    assert.ok((revoked.body as { permissions: Array<{ effect: string }> }).permissions.every((row) => row.effect === "DENY"));
    const revokedVersion = (revoked.body as { policyVersion: string }).policyVersion;
    assert.equal(revoked.response.headers.get("etag"), revokedVersion);
    const bodyVersionUpdate = await request(`/roles/${manager.roleRegistryId}/permissions`, {
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

    const stale = await request(`/roles/${manager.roleRegistryId}/permissions`, {
      method: "PUT",
      headers: { "if-match": version! },
      body: JSON.stringify({ permissions: [] }),
    });
    assert.equal(stale.response.status, 409);
    assert.equal((stale.body as { error: string }).error, "Stale policy version");
    assert.equal(typeof (stale.body as { policyVersion: string }).policyVersion, "string");
    const reflected = await request(`/roles/${manager.roleRegistryId}/permissions`);
    assert.equal(reflected.response.status, 200);
    assert.ok((reflected.body as { permissions: Array<{ effect: string }> }).permissions.some((row) => row.effect === "DENY"));

    const platformAudit = await request(`/audit-logs?resource=ROLE&resourceId=${manager.roleRegistryId}`);
    assert.equal(platformAudit.response.status, 200);
    assert.ok(Array.isArray(platformAudit.body));
    assert.ok((platformAudit.body as Array<{ resource: string; resourceId: string | null }>).length > 0);
    assert.ok((platformAudit.body as Array<{ resource: string; resourceId: string | null }>)
      .every((row) => row.resource === "ROLE" && row.resourceId === manager.roleRegistryId));

    const created = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({
        organizationId: target.organizationId,
        roleId: manager.roleRegistryId,
        scopeType: "ORGANIZATION",
      }),
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal((created.body as { roleCode: string }).roleCode, "FACILITY_MANAGER");
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
    assert.equal((generalPatch.body as { roleCode: string }).roleCode, "FACILITY_MANAGER");
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
        roleId: manager.roleRegistryId,
        scopeType: "ORGANIZATION",
      }),
    });
    assert.equal(duplicate.response.status, 409);
    for (const scopeType of ["ASSIGNED", "OWNED_REQUEST"] as const) {
      const initialScopeId = randomUUID();
      const contextualBinding = await request(`/users/${target.userId}/role-bindings`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: target.organizationId,
          roleId: manager.roleRegistryId,
          scopeType,
          scopeId: initialScopeId,
        }),
      });
      assert.equal(contextualBinding.response.status, 201, `${scopeType}: ${JSON.stringify(contextualBinding.body)}`);
      const replacementScopeId = randomUUID();
      const retargetedBinding = await request(
        `/users/${target.userId}/role-bindings/${(contextualBinding.body as { id: string }).id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ scopeType, scopeId: replacementScopeId }),
        },
      );
      assert.equal(retargetedBinding.response.status, 200, `${scopeType}: ${JSON.stringify(retargetedBinding.body)}`);
      assert.equal((retargetedBinding.body as { scopeId: string }).scopeId, replacementScopeId);
    }
    const directoryScopeTargets = [
      {
        scopeType: "TEAM" as const,
        name: "Night Operations",
        code: `TEAM-${randomUUID()}`,
      },
      {
        scopeType: "VENDOR_ASSIGNMENT" as const,
        name: "Elevator Maintenance",
        code: `VENDOR-${randomUUID()}`,
      },
    ];
    for (const directoryTarget of directoryScopeTargets) {
      const createdTarget = await request("/role-binding-scope-targets", {
        method: "POST",
        body: JSON.stringify({
          organizationId: target.organizationId,
          scopeType: directoryTarget.scopeType,
          name: directoryTarget.name,
          code: directoryTarget.code,
        }),
      });
      assert.equal(createdTarget.response.status, 201, JSON.stringify(createdTarget.body));
      const targetRecord = createdTarget.body as {
        id: string;
        name: string;
        code: string | null;
        parentPath: string[];
        organizationId: string;
      };
      assert.equal(targetRecord.name, directoryTarget.name);
      assert.equal(targetRecord.code, directoryTarget.code);
      assert.deepEqual(targetRecord.parentPath, []);
      assert.equal(targetRecord.organizationId, target.organizationId);
      const binding = await request(`/users/${target.userId}/role-bindings`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: target.organizationId,
          roleId: manager.roleRegistryId,
          scopeType: directoryTarget.scopeType,
          scopeId: targetRecord.id,
        }),
      });
      assert.equal(binding.response.status, 201, `${directoryTarget.scopeType}: ${JSON.stringify(binding.body)}`);
      assert.equal((binding.body as { scopeTargetName: string }).scopeTargetName, directoryTarget.name);
      assert.equal((binding.body as { scopeTargetStatus: string }).scopeTargetStatus, "RESOLVED");
      const search = await request(
        `/role-binding-scope-targets?scopeType=${directoryTarget.scopeType}&organizationId=${target.organizationId}&query=${encodeURIComponent(directoryTarget.name)}`,
      );
      assert.equal(search.response.status, 200, JSON.stringify(search.body));
      assert.ok((search.body as Array<{ id: string }>).some((row) => row.id === targetRecord.id));
    }
    actorId = manager.userId;
    const crossOrganizationTargetCreation = await request("/role-binding-scope-targets", {
      method: "POST",
      body: JSON.stringify({
        organizationId: target.organizationId,
        scopeType: "TEAM",
        name: "Forbidden Cross-Organization Team",
      }),
    });
    assert.equal(crossOrganizationTargetCreation.response.status, 403);
    actorId = platform.userId;
    for (const scopeType of ["TEAM", "VENDOR_ASSIGNMENT"] as const) {
      const missingDirectoryTarget = await request(`/users/${target.userId}/role-bindings`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: target.organizationId,
          roleId: manager.roleRegistryId,
          scopeType,
          scopeId: randomUUID(),
        }),
      });
      assert.equal(missingDirectoryTarget.response.status, 400, `${scopeType}: ${JSON.stringify(missingDirectoryTarget.body)}`);
    }
    const [inactiveTeam] = await db.insert(teamsTable).values({
      organizationId: target.organizationId,
      name: "Retired Response Team",
      code: `INACTIVE-TEAM-${randomUUID()}`,
      status: "INACTIVE",
    }).returning();
    const [inactiveTeamBinding] = await db.insert(userRoleBindingsTable).values({
      userId: target.userId,
      organizationId: target.organizationId,
      roleId: manager.roleCode,
      scopeType: "TEAM",
      scopeId: inactiveTeam.id,
      grantedBy: platform.userId,
    }).returning();
    assert.ok(inactiveTeamBinding);
    const [deletedVendorAssignment] = await db.insert(vendorAssignmentsTable).values({
      organizationId: target.organizationId,
      name: "Deleted Vendor Assignment",
      code: `DELETED-VENDOR-${randomUUID()}`,
    }).returning();
    const [deletedVendorBinding] = await db.insert(userRoleBindingsTable).values({
      userId: target.userId,
      organizationId: target.organizationId,
      roleId: manager.roleCode,
      scopeType: "VENDOR_ASSIGNMENT",
      scopeId: deletedVendorAssignment.id,
      grantedBy: platform.userId,
    }).returning();
    assert.ok(deletedVendorBinding);
    await db.delete(vendorAssignmentsTable).where(eq(vendorAssignmentsTable.id, deletedVendorAssignment.id));
    const [foreignOrganizationTeam] = await db.insert(teamsTable).values({
      organizationId: manager.organizationId,
      name: "Secret Foreign Team",
      code: `FOREIGN-TEAM-${randomUUID()}`,
    }).returning();
    const [crossOrganizationHistoricalBinding] = await db.insert(userRoleBindingsTable).values({
      userId: target.userId,
      organizationId: target.organizationId,
      roleId: manager.roleCode,
      scopeType: "TEAM",
      scopeId: foreignOrganizationTeam.id,
      grantedBy: platform.userId,
    }).returning();
    assert.ok(crossOrganizationHistoricalBinding);
    const [namedFacility] = await db.insert(facilitiesTable).values({
      organizationId: target.organizationId,
      name: "North Campus",
      code: `NORTH-${randomUUID()}`,
    }).returning();
    const namedScopeBinding = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({
        organizationId: target.organizationId,
        roleId: manager.roleRegistryId,
        scopeType: "FACILITY",
        scopeId: namedFacility.id,
      }),
    });
    assert.equal(namedScopeBinding.response.status, 201, JSON.stringify(namedScopeBinding.body));
    assert.equal((namedScopeBinding.body as { scopeTargetName: string }).scopeTargetName, "North Campus");
    assert.equal((namedScopeBinding.body as { scopeTargetCode: string }).scopeTargetCode, namedFacility.code);
    assert.deepEqual((namedScopeBinding.body as { scopeTargetParentPath: string[] }).scopeTargetParentPath, []);
    assert.equal((namedScopeBinding.body as { scopeTargetStatus: string }).scopeTargetStatus, "RESOLVED");
    const scopeTargetSearch = await request(
      `/role-binding-scope-targets?scopeType=FACILITY&organizationId=${target.organizationId}&query=North`,
    );
    assert.equal(scopeTargetSearch.response.status, 200, JSON.stringify(scopeTargetSearch.body));
    assert.deepEqual(
      (scopeTargetSearch.body as Array<{ id: string; name: string; organizationId: string }>).map((row) => ({
        id: row.id,
        name: row.name,
        organizationId: row.organizationId,
      })),
      [{ id: namedFacility.id, name: "North Campus", organizationId: target.organizationId }],
    );
    const [duplicateBuilding] = await db.insert(buildingsTable).values({
      organizationId: target.organizationId,
      facilityId: namedFacility.id,
      name: "Shared Plant",
      code: `PLANT-${randomUUID()}`,
    }).returning();
    const buildingScopeSearch = await request(
      `/role-binding-scope-targets?scopeType=BUILDING&organizationId=${target.organizationId}&query=Shared`,
    );
    assert.equal(buildingScopeSearch.response.status, 200, JSON.stringify(buildingScopeSearch.body));
    assert.deepEqual(
      (buildingScopeSearch.body as Array<{
        id: string;
        code: string | null;
        parentPath: string[];
      }>).map(({ id, code, parentPath }) => ({ id, code, parentPath })),
      [{ id: duplicateBuilding.id, code: duplicateBuilding.code, parentPath: ["North Campus"] }],
    );
    const buildingScopeBinding = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({
        organizationId: target.organizationId,
        roleId: manager.roleRegistryId,
        scopeType: "BUILDING",
        scopeId: duplicateBuilding.id,
      }),
    });
    assert.equal(buildingScopeBinding.response.status, 201, JSON.stringify(buildingScopeBinding.body));
    assert.equal(
      (buildingScopeBinding.body as { scopeTargetCode: string }).scopeTargetCode,
      duplicateBuilding.code,
    );
    assert.deepEqual(
      (buildingScopeBinding.body as { scopeTargetParentPath: string[] }).scopeTargetParentPath,
      ["North Campus"],
    );
    const buildingParentSearch = await request(
      `/role-binding-scope-targets?scopeType=BUILDING&organizationId=${target.organizationId}&query=North%20Campus`,
    );
    assert.equal(buildingParentSearch.response.status, 200, JSON.stringify(buildingParentSearch.body));
    assert.deepEqual(
      (buildingParentSearch.body as Array<{ id: string }>).map(({ id }) => id),
      [duplicateBuilding.id],
    );
    const [searchableSpace] = await db.insert(spacesTable).values({
      organizationId: target.organizationId,
      facilityId: namedFacility.id,
      buildingId: duplicateBuilding.id,
      name: "Utility Room",
      code: `UTILITY-${randomUUID()}`,
    }).returning();
    const spaceParentSearch = await request(
      `/role-binding-scope-targets?scopeType=SPACE&organizationId=${target.organizationId}&query=Shared%20Plant`,
    );
    assert.equal(spaceParentSearch.response.status, 200, JSON.stringify(spaceParentSearch.body));
    assert.deepEqual(
      (spaceParentSearch.body as Array<{ id: string }>).map(({ id }) => id),
      [searchableSpace.id],
    );
    const [searchableSystem] = await db.insert(systemsTable).values({
      organizationId: target.organizationId,
      facilityId: namedFacility.id,
      buildingId: duplicateBuilding.id,
      spaceId: searchableSpace.id,
      name: "Search Test System",
    }).returning();
    const [searchableAsset] = await db.insert(assetsTable).values({
      organizationId: target.organizationId,
      facilityId: namedFacility.id,
      buildingId: duplicateBuilding.id,
      spaceId: searchableSpace.id,
      systemId: searchableSystem.id,
      name: "Pump 01",
      code: `PUMP-${randomUUID()}`,
    }).returning();
    const assetParentSearch = await request(
      `/role-binding-scope-targets?scopeType=ASSET&organizationId=${target.organizationId}&query=Utility%20Room`,
    );
    assert.equal(assetParentSearch.response.status, 200, JSON.stringify(assetParentSearch.body));
    assert.deepEqual(
      (assetParentSearch.body as Array<{ id: string }>).map(({ id }) => id),
      [searchableAsset.id],
    );
    const [foreignFacility] = await db.insert(facilitiesTable).values({
      organizationId: manager.organizationId,
      name: "North Campus",
      code: `FOREIGN-NORTH-${randomUUID()}`,
    }).returning();
    const [foreignBuilding] = await db.insert(buildingsTable).values({
      organizationId: manager.organizationId,
      facilityId: foreignFacility.id,
      name: "Foreign Plant",
      code: `FOREIGN-PLANT-${randomUUID()}`,
    }).returning();
    const isolatedParentSearch = await request(
      `/role-binding-scope-targets?scopeType=BUILDING&organizationId=${target.organizationId}&query=North%20Campus`,
    );
    assert.equal(isolatedParentSearch.response.status, 200, JSON.stringify(isolatedParentSearch.body));
    assert.deepEqual(
      (isolatedParentSearch.body as Array<{ id: string }>).map(({ id }) => id),
      [duplicateBuilding.id],
    );
    assert.ok(!(isolatedParentSearch.body as Array<{ id: string }>).some(({ id }) => id === foreignBuilding.id));
    const missingScopeId = randomUUID();
    const missingScopeBinding = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({
        organizationId: target.organizationId,
        roleId: manager.roleRegistryId,
        scopeType: "BUILDING",
        scopeId: missingScopeId,
      }),
    });
    assert.equal(missingScopeBinding.response.status, 400, JSON.stringify(missingScopeBinding.body));
    const [historicalScopeBinding] = await db.insert(userRoleBindingsTable).values({
      userId: target.userId,
      organizationId: target.organizationId,
      roleId: manager.roleCode,
      scopeType: "BUILDING",
      scopeId: missingScopeId,
      grantedBy: platform.userId,
    }).returning();
    assert.ok(historicalScopeBinding);
    const [inactiveFacility] = await db.insert(facilitiesTable).values({
      organizationId: target.organizationId,
      name: "Retired Campus",
      code: `RETIRED-${randomUUID()}`,
      status: "INACTIVE",
    }).returning();
    const [inactiveScopeBinding] = await db.insert(userRoleBindingsTable).values({
      userId: target.userId,
      organizationId: target.organizationId,
      roleId: manager.roleCode,
      scopeType: "FACILITY",
      scopeId: inactiveFacility.id,
      grantedBy: platform.userId,
    }).returning();
    assert.ok(inactiveScopeBinding);
    const listed = await request(`/users/${target.userId}/role-bindings`);
    assert.equal(listed.response.status, 200);
    const listedPage = listed.body as {
      items: Array<{
        id: string;
        roleId: string;
        roleCode: string;
        organizationId: string;
        scopeId: string | null;
        scopeTargetName: string | null;
        scopeTargetCode: string | null;
        scopeTargetParentPath: string[];
        scopeTargetStatus: string;
      }>;
      page: number;
      limit: number;
      total: number;
    };
    const listedBindings = listedPage.items;
    assert.ok(listedBindings.length > 0);
    assert.equal(listedPage.page, 1);
    assert.equal(listedPage.limit, 20);
    assert.ok(listedPage.total >= listedBindings.length);
    assert.ok(listedBindings.every((binding) => canonicalRoleValues.includes(binding.roleCode as typeof canonicalRoleValues[number])));
    assert.ok(listedBindings.some((binding) =>
      binding.roleId === manager.roleRegistryId && binding.roleCode === "FACILITY_MANAGER"));
    assert.ok(listedBindings.some((row) => row.id === createdBindingId));
    assert.ok(listedBindings
      .some((row) => row.scopeId === namedFacility.id &&
        row.scopeTargetName === "North Campus" &&
        row.scopeTargetCode === namedFacility.code &&
        row.scopeTargetParentPath.length === 0 &&
        row.scopeTargetStatus === "RESOLVED"));
    assert.ok(listedBindings
      .some((row) => row.scopeId === duplicateBuilding.id &&
        row.scopeTargetName === "Shared Plant" &&
        row.scopeTargetCode === duplicateBuilding.code &&
        row.scopeTargetParentPath.join(" > ") === "North Campus" &&
        row.scopeTargetStatus === "RESOLVED"));
    assert.ok(listedBindings
      .some((row) => row.scopeId === missingScopeId &&
        row.scopeTargetName === null &&
        row.scopeTargetStatus === "MISSING"));
    assert.ok(listedBindings
      .some((row) => row.scopeId === inactiveFacility.id &&
        row.scopeTargetName === "Retired Campus" &&
        row.scopeTargetCode === inactiveFacility.code &&
        row.scopeTargetStatus === "MISSING"));
    assert.ok(listedBindings
      .some((row) => row.scopeId === inactiveTeam.id &&
        row.scopeTargetName === "Retired Response Team" &&
        row.scopeTargetStatus === "MISSING"));
    assert.ok(listedBindings
      .some((row) => row.scopeId === deletedVendorAssignment.id &&
        row.scopeTargetName === null &&
        row.scopeTargetStatus === "MISSING"));
    assert.ok(listedBindings
      .some((row) => row.scopeId === foreignOrganizationTeam.id &&
        row.scopeTargetName === null &&
        row.scopeTargetStatus === "MISSING"));
    const firstBindingPage = await request(
      `/users/${target.userId}/role-bindings?roleCode=FACILITY_MANAGER&page=1&limit=2`,
    );
    const secondBindingPage = await request(
      `/users/${target.userId}/role-bindings?roleCode=FACILITY_MANAGER&page=2&limit=2`,
    );
    assert.equal(firstBindingPage.response.status, 200);
    assert.equal(secondBindingPage.response.status, 200);
    const firstPageBody = firstBindingPage.body as { items: Array<{ id: string; roleCode: string }>; page: number; limit: number; total: number };
    const secondPageBody = secondBindingPage.body as { items: Array<{ id: string; roleCode: string }>; page: number; limit: number; total: number };
    assert.equal(firstPageBody.page, 1);
    assert.equal(secondPageBody.page, 2);
    assert.equal(firstPageBody.limit, 2);
    assert.equal(secondPageBody.limit, 2);
    assert.equal(firstPageBody.total, secondPageBody.total);
    assert.ok(firstPageBody.total > firstPageBody.items.length);
    assert.ok(firstPageBody.items.every((row) => row.roleCode === "FACILITY_MANAGER"));
    assert.ok(secondPageBody.items.every((row) => row.roleCode === "FACILITY_MANAGER"));
    assert.equal(
      firstPageBody.items.some((first) => secondPageBody.items.some((second) => first.id === second.id)),
      false,
    );
    const managerBindings = await request(
      `/users/${target.userId}/role-bindings?roleCode=FACILITY_MANAGER`,
    );
    assert.equal(managerBindings.response.status, 200);
    assert.ok((managerBindings.body as { items: Array<{ roleCode: string }> }).items.length > 0);
    assert.ok((managerBindings.body as { items: Array<{ roleCode: string }> }).items
      .every((row) => row.roleCode === "FACILITY_MANAGER"));
    const activeManagerBindings = await request(
      `/users/${target.userId}/role-bindings?roleCode=FACILITY_MANAGER&status=ACTIVE`,
    );
    assert.equal(activeManagerBindings.response.status, 200);
    assert.ok((activeManagerBindings.body as { items: Array<{ roleCode: string; status: string }> }).items.length > 0);
    assert.ok((activeManagerBindings.body as { items: Array<{ roleCode: string; status: string }> }).items
      .every((row) => row.roleCode === "FACILITY_MANAGER" && row.status === "ACTIVE"));
    const filteredExport = await fetch(
      `${base}/users/${target.userId}/role-bindings/export?roleCode=FACILITY_MANAGER&status=ACTIVE`,
    );
    assert.equal(filteredExport.status, 200);
    assert.match(filteredExport.headers.get("content-type") ?? "", /^text\/csv/);
    assert.equal(
      filteredExport.headers.get("content-disposition"),
      `attachment; filename="member-access-review-${target.userId}.csv"`,
    );
    const exportedCsv = await filteredExport.text();
    const exportedLines = exportedCsv.trim().split("\n");
    assert.equal(
      exportedLines[0],
      '"member_id","member_name","member_email","organization_id","organization_name","role","status","scope_type","scope_id","scope_name","scope_code","scope_parent_hierarchy","scope_target_status","starts_at","ends_at"',
    );
    assert.ok(exportedLines.length > 1);
    assert.ok(exportedLines.slice(1).every((line) =>
      line.includes(`"${target.userId}"`) &&
      line.includes('"FACILITY_MANAGER"') &&
      line.includes('"ACTIVE"')));
    const invalidExportFilter = await fetch(
      `${base}/users/${target.userId}/role-bindings/export?status=REVOKED`,
    );
    assert.equal(invalidExportFilter.status, 400);
    const invalidBindingFilter = await request(
      `/users/${target.userId}/role-bindings?status=REVOKED`,
    );
    assert.equal(invalidBindingFilter.response.status, 400);

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
    assert.equal((deleted.body as { roleCode: string }).roleCode, "FACILITY_MANAGER");
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
    const forbiddenCrossOrganizationTargets = await request(
      `/role-binding-scope-targets?scopeType=FACILITY&organizationId=${target.organizationId}`,
    );
    assert.equal(forbiddenCrossOrganizationTargets.response.status, 403);
    const organizationAudit = await request("/audit-logs");
    // The role replacement above intentionally persisted explicit DENY rows,
    // including AUDIT_LOG.VIEW_AUDIT; the manager must remain denied until
    // the test's finally block restores the canonical matrix.
    assert.equal(organizationAudit.response.status, 403);
    const crossOrgList = await request(`/users/${target.userId}/role-bindings`);
    assert.equal(crossOrgList.response.status, 403);
    const crossOrgExport = await request(`/users/${target.userId}/role-bindings/export`);
    assert.equal(crossOrgExport.response.status, 403);
    const crossOrgCreate = await request(`/users/${target.userId}/role-bindings`, {
      method: "POST",
      body: JSON.stringify({ organizationId: target.organizationId, roleId: manager.roleRegistryId, scopeType: "ORGANIZATION" }),
    });
    assert.equal(crossOrgCreate.response.status, 403);
    const crossOrgDelete = await request(`/users/${target.userId}/role-bindings/${createdBindingId}`, { method: "DELETE" });
    assert.equal(crossOrgDelete.response.status, 403);

    const mePermissions = await request("/me/permissions");
    assert.equal(mePermissions.response.status, 200);
    assert.equal((mePermissions.body as { organizationId: string }).organizationId, manager.organizationId);
    const meScope = await request("/me/scope");
    assert.equal(meScope.response.status, 200);
    assert.ok((meScope.body as Array<{ organizationId: string; roleCode: string }>).every((row) =>
      row.organizationId === manager.organizationId &&
      canonicalRoleValues.includes(row.roleCode as typeof canonicalRoleValues[number])));

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
        roleId: manager.roleCode,
        permissionId: seededPermissions.get(`${resource}.${action}`)!,
        defaultScopeType: defaultScopeType as "ORGANIZATION",
        effect: "ALLOW" as const,
      })));
    await db.insert(rolePermissionsTable).values(restored).onConflictDoNothing();
  }
});

test("large organization directory contains searches remain within the fallback budget", async () => {
  const marker = randomUUID();
  const slugPrefix = `org-search-perf-${marker}`;
  await pool.query(
    `INSERT INTO organizations (name, slug)
     SELECT 'Organization ' || value, $1 || '-' || value
       FROM generate_series(1, 32_768) AS value`,
    [slugPrefix],
  );
  await pool.query(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2), ($3, $4)`,
    [
      `Organization UniqueNameNeedle ${marker}`,
      `${slugPrefix}-name-needle`,
      `Organization Slug Match ${marker}`,
      `${slugPrefix}-UniqueSlugNeedle`,
    ],
  );

  type PlanNode = {
    "Node Type": string;
    "Relation Name"?: string;
    "Index Name"?: string;
    Plans?: PlanNode[];
  };
  const planNodes = (node: PlanNode): PlanNode[] => [
    node,
    ...(node.Plans?.flatMap(planNodes) ?? []),
  ];
  const assertSearchPlanWithinBudget = async (column: "name" | "slug", search: string) => {
    const result = await pool.query(
      `EXPLAIN (ANALYZE, FORMAT JSON)
       SELECT id FROM organizations
        WHERE is_active = true AND ${column} ILIKE $1`,
      [`%${search}%`],
    );
    const root = result.rows[0]?.["QUERY PLAN"]?.[0];
    assert.ok(root);
    planNodes(root.Plan as PlanNode);
    assert.ok(Number(root["Execution Time"]) < 250, "organization search exceeded the 250ms plan budget");
  };

  try {
    await pool.query("ANALYZE organizations");
    await assertSearchPlanWithinBudget("name", `UniqueNameNeedle ${marker}`);
    await assertSearchPlanWithinBudget("slug", "UniqueSlugNeedle");
  } finally {
    await pool.query("DELETE FROM organizations WHERE slug LIKE $1", [`${slugPrefix}%`]);
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
      roleId: manager.roleCode,
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
      roleId: manager.roleCode,
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
    for (const path of ["/facilities?q=a", "/facilities/search?q=ab"]) {
      const shortSearch = await request(path);
      assert.equal(shortSearch.response.status, 200, `${path} must allow exact short-code lookup`);
    }
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
    const firstCursorPage = await request("/assets?limit=2");
    assert.equal(firstCursorPage.response.status, 200);
    const firstCursorBody = JSON.parse(firstCursorPage.text) as {
      items: Array<{ id: string }>;
      total: number;
      nextCursor: string | null;
    };
    assert.equal(firstCursorBody.items.length, 2);
    assert.equal(firstCursorBody.total, 502);
    assert.ok(firstCursorBody.nextCursor);
    const secondCursorPage = await request(`/assets?limit=2&cursor=${encodeURIComponent(firstCursorBody.nextCursor)}`);
    assert.equal(secondCursorPage.response.status, 200);
    const secondCursorBody = JSON.parse(secondCursorPage.text) as {
      items: Array<{ id: string }>;
      total: number;
      nextCursor: string | null;
    };
    assert.equal(secondCursorBody.items.length, 2);
    assert.equal(secondCursorBody.total, 502);
    assert.deepEqual(
      new Set([...firstCursorBody.items, ...secondCursorBody.items].map((item) => item.id)).size,
      4,
    );
    const searchedCursorPage = await request("/assets/search?q=Bulk&limit=2");
    const searchedCursorBody = JSON.parse(searchedCursorPage.text) as { nextCursor: string | null };
    assert.ok(searchedCursorBody.nextCursor);
    const continuedSearch = await request(
      `/assets/search?q=Bulk&limit=2&cursor=${encodeURIComponent(searchedCursorBody.nextCursor)}`,
    );
    assert.equal(continuedSearch.response.status, 200);
    assert.equal((JSON.parse(continuedSearch.text) as { total: number }).total, 501);
    const invalidCursor = await request("/assets?cursor=not-a-cursor");
    assert.equal(invalidCursor.response.status, 400);
    const nestedCursorPage = await request(`/spaces/${space.id}/assets?limit=2`);
    assert.equal(nestedCursorPage.response.status, 200);
    const nestedCursorBody = JSON.parse(nestedCursorPage.text) as {
      total: number;
      nextCursor: string | null;
    };
    assert.equal(nestedCursorBody.total, 502);
    assert.ok(nestedCursorBody.nextCursor);
    const continuedNestedPage = await request(
      `/spaces/${space.id}/assets?limit=2&cursor=${encodeURIComponent(nestedCursorBody.nextCursor)}`,
    );
    assert.equal(continuedNestedPage.response.status, 200);
    assert.equal((JSON.parse(continuedNestedPage.text) as { total: number }).total, 502);
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
    const [facility] = await db.insert(facilitiesTable).values({ organizationId, name: `${label} Facility`, code: "Q7" }).returning();
    assert.ok(facility);
    const [building] = await db.insert(buildingsTable).values({ organizationId, facilityId: facility.id, name: `${label} Building`, code: "Q7" }).returning();
    assert.ok(building);
    const [space] = await db.insert(spacesTable).values({ organizationId, facilityId: facility.id, buildingId: building.id, name: `${label} Space`, code: "Q7" }).returning();
    assert.ok(space);
    const [system] = await db.insert(systemsTable).values({ organizationId, facilityId: facility.id, buildingId: building.id, spaceId: space.id, name: `${label} System`, code: "Q7" }).returning();
    assert.ok(system);
    const [asset] = await db.insert(assetsTable).values({ organizationId, facilityId: facility.id, buildingId: building.id, spaceId: space.id, systemId: system.id, name: `${label} Asset`, code: "Q7" }).returning();
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
      const shortCodeSearch = await request(`/${testCase.plural}/search?q=Q7`);
      assert.equal(shortCodeSearch.response.status, 200);
      const shortCodeSearchBody = JSON.parse(shortCodeSearch.text) as {
        items: Array<{ id: string }>;
        total: number;
      };
      assert.equal(shortCodeSearchBody.total, 1);
      assert.deepEqual(shortCodeSearchBody.items.map((item) => item.id), [targetRow.id]);
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

test("CSV backpressure listeners are cleaned up after close and error events", async () => {
  for (const event of ["close", "error"] as const) {
    const response = Object.assign(new EventEmitter(), { destroyed: false });
    const pending = waitForCsvDrain(response);
    assert.equal(response.listenerCount("drain"), 1);
    assert.equal(response.listenerCount("close"), 1);
    assert.equal(response.listenerCount("error"), 1);

    const streamError = new Error("socket failed");
    response.emit(event, ...(event === "error" ? [streamError] : []));
    await assert.rejects(
      pending,
      event === "close"
        ? /client disconnected/
        : (error) => error === streamError,
    );
    assert.equal(response.listenerCount("drain"), 0);
    assert.equal(response.listenerCount("close"), 0);
    assert.equal(response.listenerCount("error"), 0);
  }
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

test("registry search normalizes terms around the generated substring-search limit", async () => {
  assert.equal(normalizedRegistrySearch(undefined), undefined);
  assert.equal(normalizedRegistrySearch("   "), undefined);
  const belowMinimum = "x".repeat(REGISTRY_SEARCH_MIN_LENGTH - 1);
  const atMinimum = "x".repeat(REGISTRY_SEARCH_MIN_LENGTH);
  assert.equal(normalizedRegistrySearch(` ${atMinimum} `), atMinimum);
  assert.equal(normalizedRegistrySearch("x"), "x");
  assert.equal(normalizedRegistrySearch(` ${belowMinimum} `), belowMinimum);
});

test("large registry portfolio keeps list, search, nested totals, and export queries bounded", async () => {
  const facilityId = randomUUID();
  const actor = await makeFixture("FACILITY_MANAGER", "FACILITY", facilityId);
  const [facility] = await db.insert(facilitiesTable).values({
    id: facilityId,
    organizationId: actor.organizationId,
    name: "Performance Campus",
  }).returning();
  assert.ok(facility);
  const [building] = await db.insert(buildingsTable).values({
    organizationId: actor.organizationId,
    facilityId: facility.id,
    name: "Performance Building",
  }).returning();
  assert.ok(building);
  const spaces = await db.insert(spacesTable).values(
    Array.from({ length: 64 }, (_, index) => ({
      organizationId: actor.organizationId,
      facilityId: facility.id,
      buildingId: building.id,
      name: `Performance Space ${String(index).padStart(2, "0")}`,
    })),
  ).returning();
  assert.equal(spaces.length, 64);

  const assetRows = spaces.flatMap((space, spaceIndex) =>
    Array.from({ length: 512 }, (_, assetIndex) => ({
      organizationId: actor.organizationId,
      facilityId: facility.id,
      buildingId: building.id,
      spaceId: space.id,
      name: assetIndex === 73 && spaceIndex === 31
        ? "Performance Needle"
        : `Asset ${String(spaceIndex).padStart(2, "0")}-${String(assetIndex).padStart(3, "0")}`,
      code: `PERF-${String(spaceIndex).padStart(2, "0")}-${String(assetIndex).padStart(3, "0")}`,
    })),
  );
  for (let offset = 0; offset < assetRows.length; offset += 1_500) {
    await db.insert(assetsTable).values(assetRows.slice(offset, offset + 1_500));
  }
  await pool.query("ANALYZE assets");

  await db.update(assetsTable)
    .set({ code: "X7" })
    .where(and(
      eq(assetsTable.organizationId, actor.organizationId),
      eq(assetsTable.name, "Performance Needle"),
    ));

  const earlyStartedAt = performance.now();
  const early = await queryAuthorizedRegistryRows({
    database: db,
    kind: "ASSET",
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    limit: 25,
  });
  const earlyDuration = performance.now() - earlyStartedAt;
  assert.equal(early.rows.length, 25);
  assert.equal(early.total, 32_768);
  assert.equal(early.hasMore, true);

  const [lateBoundary] = await db.select({ id: assetsTable.id, name: assetsTable.name })
    .from(assetsTable)
    .where(eq(assetsTable.organizationId, actor.organizationId))
    .orderBy(asc(assetsTable.name), asc(assetsTable.id))
    .limit(1)
    .offset(30_999);
  assert.ok(lateBoundary);
  const lateStartedAt = performance.now();
  const late = await queryAuthorizedRegistryRows({
    database: db,
    kind: "ASSET",
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    limit: 25,
    after: { name: lateBoundary.name, id: lateBoundary.id },
  });
  const lateDuration = performance.now() - lateStartedAt;
  assert.equal(late.rows.length, 25);
  assert.equal(late.total, 32_768);
  assert.equal(late.hasMore, true);
  assert.ok(
    lateDuration < Math.max(earlyDuration * 20, 500),
    `late cursor query (${lateDuration.toFixed(1)}ms) regressed against early query (${earlyDuration.toFixed(1)}ms)`,
  );

  const search = await queryAuthorizedRegistryRows({
    database: db,
    kind: "ASSET",
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    query: "Needle",
    limit: 25,
    offset: 0,
  });
  assert.equal(search.rows.length, 1);
  assert.equal(search.total, 1);

  const shortCodeSearch = await queryAuthorizedRegistryRows({
    database: db,
    kind: "ASSET",
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    query: "X7",
    limit: 25,
    offset: 0,
  });
  assert.equal(shortCodeSearch.rows.length, 1);
  assert.equal(shortCodeSearch.rows[0]?.name, "Performance Needle");
  assert.equal(shortCodeSearch.total, 1);

  const selectedSpace = spaces[31]!;
  const nested = await queryAuthorizedRegistryRows({
    database: db,
    kind: "ASSET",
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    parent: { kind: "SPACE", id: selectedSpace.id },
    limit: 17,
    offset: 51,
  });
  assert.equal(nested.rows.length, 17);
  assert.equal(nested.total, 512);

  let exported = 0;
  let after: { name: string; id: string } | undefined;
  do {
    const batch = await listAuthorizedRegistryBatch({
      database: db,
      kind: "ASSET",
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      limit: 500,
      after,
    });
    exported += batch.length;
    const last = batch.at(-1);
    after = last ? { name: last.name, id: last.id } : undefined;
    if (batch.length < 500) break;
  } while (after);
  assert.equal(exported, 32_768);
  assert.ok(earlyDuration < 1_000, "early registry cursor query exceeded the 1s CI budget");

  type PlanNode = {
    "Node Type": string;
    "Relation Name"?: string;
    "Index Name"?: string;
    Plans?: PlanNode[];
  };
  const planNodes = (node: PlanNode): PlanNode[] => [
    node,
    ...(node.Plans?.flatMap(planNodes) ?? []),
  ];
  const explain = async (statement: string, parameters: unknown[]) => {
    const result = await pool.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${statement}`, parameters);
    const root = result.rows[0]?.["QUERY PLAN"]?.[0];
    assert.ok(root);
    return {
      executionTime: Number(root["Execution Time"]),
      nodes: planNodes(root.Plan as PlanNode),
    };
  };
  const nestedPlan = await explain(
    `SELECT id, name FROM assets
       WHERE organization_id = $1 AND space_id = $2
       ORDER BY name, id LIMIT 17 OFFSET 51`,
    [actor.organizationId, selectedSpace.id],
  );
  assert.ok(
    nestedPlan.nodes.some((node) =>
      node["Relation Name"] === "assets" &&
      node["Index Name"] === "assets_organization_space_idx"),
    "nested registry query must use its organization/space index",
  );
  assert.ok(
    !nestedPlan.nodes.some((node) => node["Relation Name"] === "assets" && node["Node Type"] === "Seq Scan"),
    "nested registry query must not scan every asset in the organization",
  );
  assert.ok(nestedPlan.executionTime < 250, "nested registry query exceeded the 250ms plan budget");

  const earlyCursorPlan = await explain(
    `SELECT id, name FROM assets
       WHERE organization_id = $1
       ORDER BY name, id LIMIT 25`,
    [actor.organizationId],
  );
  const lateCursorPlan = await explain(
    `SELECT id, name FROM assets
       WHERE organization_id = $1 AND (name > $2 OR (name = $2 AND id > $3))
       ORDER BY name, id LIMIT 25`,
    [actor.organizationId, "Asset 31-063", "00000000-0000-4000-8000-000000000000"],
  );
  for (const plan of [earlyCursorPlan, lateCursorPlan]) {
    assert.ok(
      plan.nodes.some((node) =>
        node["Relation Name"] === "assets" &&
        node["Index Name"] === "assets_organization_name_id_idx"),
      "registry cursor traversal must use its organization/name/id pagination index",
    );
  }
  assert.ok(
    lateCursorPlan.executionTime < Math.max(earlyCursorPlan.executionTime * 20, 50),
    `late cursor plan (${lateCursorPlan.executionTime}ms) regressed against early cursor plan (${earlyCursorPlan.executionTime}ms)`,
  );
  assert.ok(
    lateCursorPlan.nodes.some((node) =>
      node["Relation Name"] === "assets" &&
      node["Index Name"] === "assets_organization_name_id_idx"),
    "late registry cursor must use its pagination index",
  );
  assert.ok(lateCursorPlan.executionTime < 250, "late registry cursor query exceeded the 250ms plan budget");

  const assertSearchPlanWithinBudget = async (search: string) => {
    const searchPlan = await explain(
      `SELECT count(*) FROM assets
         WHERE organization_id = $1 AND (name ILIKE $2 OR code ILIKE $2)`,
      [actor.organizationId, `%${search}%`],
    );
    assert.ok(searchPlan.executionTime < 250, "registry search query exceeded the 250ms plan budget");
  };
  await assertSearchPlanWithinBudget("Needle");
  await assertSearchPlanWithinBudget("PERF-31-073");

  const exactCodePlan = await explain(
    `SELECT count(*) FROM assets
       WHERE organization_id = $1 AND code = $2`,
    [actor.organizationId, "X7"],
  );
  assert.ok(
    exactCodePlan.nodes.some((node) => node["Index Name"] === "assets_organization_code_idx"),
    "short exact-code search must use its organization/code index",
  );
  assert.ok(
    !exactCodePlan.nodes.some((node) =>
      node["Relation Name"] === "assets" &&
      node["Node Type"] === "Seq Scan"),
    "short exact-code search must not scan every asset",
  );
  assert.ok(exactCodePlan.executionTime < 250, "short exact-code query exceeded the 250ms plan budget");

});

test("registry export snapshot is stable across concurrent rename, insert, and delete", async () => {
  const facilityId = randomUUID();
  const actor = await makeFixture("FACILITY_MANAGER", "FACILITY", facilityId);
  const [facility] = await db.insert(facilitiesTable).values({
    id: facilityId,
    organizationId: actor.organizationId,
    name: "Snapshot Facility",
  }).returning();
  const [building] = await db.insert(buildingsTable).values({
    organizationId: actor.organizationId,
    facilityId: facility!.id,
    name: "Snapshot Building",
  }).returning();
  const [space] = await db.insert(spacesTable).values({
    organizationId: actor.organizationId,
    facilityId: facility!.id,
    buildingId: building!.id,
    name: "Snapshot Space",
  }).returning();
  const rows = Array.from({ length: 501 }, (_, index) => ({
    organizationId: actor.organizationId,
    facilityId: facility!.id,
    buildingId: building!.id,
    spaceId: space!.id,
    name: `Snapshot Asset ${String(index).padStart(3, "0")}`,
  }));
  const inserted = await db.insert(assetsTable).values(rows).returning();

  await db.transaction(async (snapshot) => {
    const first = await listAuthorizedRegistryBatch({
      database: snapshot,
      authorizationDatabase: db,
      kind: "ASSET",
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      limit: 500,
    });
    assert.equal(first.length, 500);

    const lastOriginal = inserted.at(-1)!;
    await Promise.all([
      db.update(assetsTable).set({ name: "Snapshot Asset 000 Renamed" })
        .where(eq(assetsTable.id, lastOriginal.id)),
      db.delete(assetsTable).where(eq(assetsTable.id, inserted[250]!.id)),
      db.insert(assetsTable).values({
        organizationId: actor.organizationId,
        facilityId: facility!.id,
        buildingId: building!.id,
        spaceId: space!.id,
        name: "Snapshot Asset 999 Inserted",
      }),
    ]);

    const boundary = first.at(-1)!;
    const second = await listAuthorizedRegistryBatch({
      database: snapshot,
      authorizationDatabase: db,
      kind: "ASSET",
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      limit: 500,
      after: { name: boundary.name, id: boundary.id },
    });
    const exported = [...first, ...second];
    assert.equal(exported.length, 501);
    assert.equal(new Set(exported.map((row) => row.id)).size, 501);
    assert.equal(exported.some((row) => row.id === lastOriginal.id && row.name === lastOriginal.name), true);
    assert.equal(exported.some((row) => row.name === "Snapshot Asset 999 Inserted"), false);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
});

test("registry export checks current authorization between snapshot batches", async () => {
  const facilityId = randomUUID();
  const actor = await makeFixture("FACILITY_MANAGER", "FACILITY", facilityId);
  await db.insert(facilitiesTable).values({
    id: facilityId,
    organizationId: actor.organizationId,
    name: "Revocation Snapshot Facility",
  });

  await db.transaction(async (snapshot) => {
    const first = await listAuthorizedRegistryBatch({
      database: snapshot,
      authorizationDatabase: db,
      kind: "FACILITY",
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      limit: 1,
    });
    assert.equal(first.length, 1);
    await db.update(userRoleBindingsTable).set({ status: "SUSPENDED" })
      .where(eq(userRoleBindingsTable.id, actor.bindingId));
    await assert.rejects(
      listAuthorizedRegistryBatch({
        database: snapshot,
        authorizationDatabase: db,
        kind: "FACILITY",
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        limit: 1,
        after: { name: first[0]!.name, id: first[0]!.id },
      }),
      RegistryExportAuthorizationError,
    );
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
});

test("large member access exports are complete, ordered, filtered, and organization-scoped", async () => {
  const actor = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const foreign = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  await db.insert(userContextsTable).values({
    userId: actor.userId,
    activeOrganizationId: actor.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: actor.organizationId },
  });

  const extraBindingCount = 1_005;
  await db.insert(userRoleBindingsTable).values(Array.from({ length: extraBindingCount }, () => ({
    userId: actor.userId,
    organizationId: actor.organizationId,
    roleId: actor.roleId,
    scopeType: "BUILDING" as const,
    scopeId: randomUUID(),
    status: "ACTIVE" as const,
    grantedBy: actor.userId,
  })));
  await db.insert(userRoleBindingsTable).values({
    userId: actor.userId,
    organizationId: foreign.organizationId,
    roleId: actor.roleId,
    scopeType: "ORGANIZATION",
    status: "ACTIVE",
    grantedBy: foreign.userId,
  });

  const app = express();
  app.use(createAuthorizationRouter({
    currentUser: async () => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, actor.userId));
      return user ?? null;
    },
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/users/${actor.userId}/role-bindings/export`
      + "?roleCode=FACILITY_MANAGER&status=ACTIVE",
    );
    assert.equal(response.status, 200);
    const lines = (await response.text()).trim().split("\n");
    assert.equal(lines.length, extraBindingCount + 2);
    assert.ok(lines.slice(1).every((line) =>
      line.includes(`"${actor.organizationId}"`) &&
      !line.includes(`"${foreign.organizationId}"`) &&
      line.includes('"FACILITY_MANAGER"') &&
      line.includes('"ACTIVE"')));

    const expected = await db.select({ scopeId: userRoleBindingsTable.scopeId })
      .from(userRoleBindingsTable)
      .where(and(
        eq(userRoleBindingsTable.userId, actor.userId),
        eq(userRoleBindingsTable.organizationId, actor.organizationId),
        eq(userRoleBindingsTable.status, "ACTIVE"),
      ))
      .orderBy(desc(userRoleBindingsTable.createdAt), desc(userRoleBindingsTable.id));
    assert.deepEqual(
      lines.slice(1).map((line) =>
        [...line.matchAll(/"([0-9a-f-]{36})"/g)][2]?.[1] ?? ""),
      expected.map((row) => row.scopeId ?? ""),
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function runPausedMemberAccessExport(
  actor: Fixture,
  whilePaused: () => Promise<void>,
) {
  await db.insert(userContextsTable).values({
    userId: actor.userId,
    activeOrganizationId: actor.organizationId,
  }).onConflictDoUpdate({
    target: userContextsTable.userId,
    set: { activeOrganizationId: actor.organizationId },
  });
  await db.insert(userRoleBindingsTable).values(Array.from({ length: 500 }, () => ({
    userId: actor.userId,
    organizationId: actor.organizationId,
    roleId: actor.roleId,
    scopeType: "BUILDING" as const,
    scopeId: randomUUID(),
    status: "ACTIVE" as const,
    grantedBy: actor.userId,
  })));

  let releaseFirstBatch!: () => void;
  const firstBatchReleased = new Promise<void>((resolve) => {
    releaseFirstBatch = resolve;
  });
  let firstBatchWritten!: () => void;
  const firstBatch = new Promise<void>((resolve) => {
    firstBatchWritten = resolve;
  });
  const app = express();
  app.use(createAuthorizationRouter({
    currentUser: async () => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, actor.userId));
      return user ?? null;
    },
    onMemberAccessExportBatchWritten: async ({ batchNumber }) => {
      if (batchNumber !== 1) return;
      firstBatchWritten();
      await firstBatchReleased;
    },
  }));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const responsePromise = new Promise<{ statusCode: number | undefined; text: string }>((resolve, reject) => {
      const request = httpRequest({
        hostname: "127.0.0.1",
        port: address.port,
        path: `/users/${actor.userId}/role-bindings/export`,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        const finish = () => resolve({
          statusCode: response.statusCode,
          text: Buffer.concat(chunks).toString("utf8"),
        });
        response.once("end", finish);
        response.once("aborted", finish);
        response.once("error", finish);
      });
      request.once("error", reject);
      request.end();
    });
    await firstBatch;
    await whilePaused();
    releaseFirstBatch();
    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
    return response.text.trim().split("\n");
  } finally {
    releaseFirstBatch();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("member access export stops after USER.VIEW is revoked between batches", async () => {
  const actor = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const lines = await runPausedMemberAccessExport(actor, async () => {
    await db.update(userRoleBindingsTable).set({ status: "SUSPENDED" })
      .where(eq(userRoleBindingsTable.id, actor.bindingId));
  });
  assert.equal(lines.length, 501);
});

test("organization-scoped member access export stops after active organization changes", async () => {
  const actor = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const other = await makeFixture("FACILITY_MANAGER", "ORGANIZATION");
  const lines = await runPausedMemberAccessExport(actor, async () => {
    await db.update(userContextsTable).set({ activeOrganizationId: other.organizationId })
      .where(eq(userContextsTable.userId, actor.userId));
  });
  assert.equal(lines.length, 501);
});

test("platform member access export continues only while platform USER.VIEW remains effective", async () => {
  const continuingActor = await makeFixture("PLATFORM_ADMIN", "PLATFORM");
  const completeLines = await runPausedMemberAccessExport(continuingActor, async () => {});
  assert.equal(completeLines.length, 502);

  const revokedActor = await makeFixture("PLATFORM_ADMIN", "PLATFORM");
  const stoppedLines = await runPausedMemberAccessExport(revokedActor, async () => {
    await db.update(userRoleBindingsTable).set({ status: "SUSPENDED" })
      .where(eq(userRoleBindingsTable.id, revokedActor.bindingId));
  });
  assert.equal(stoppedLines.length, 501);
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