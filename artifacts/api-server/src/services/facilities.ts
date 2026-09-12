import { and, asc, count, eq, gt, ilike, isNull, lte, or } from "drizzle-orm";
import {
  assetsTable,
  buildingsTable,
  db,
  facilitiesTable,
  membershipsTable,
  organizationsTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  spacesTable,
  systemsTable,
  userRoleBindingsTable,
  usersTable,
} from "@workspace/db";
import type { Asset, Building, Facility, Space, System } from "@workspace/db";
import { authorize, isBindingScopeCompatible, type AuthorizationDecision } from "./authorization";

export const REGISTRY_KINDS = ["FACILITY", "BUILDING", "SPACE", "SYSTEM", "ASSET"] as const;
export type RegistryKind = typeof REGISTRY_KINDS[number];
export type RegistryRow = Facility | Building | Space | System | Asset;

type Database = any;

export type ResolvedRegistryObject = {
  row: RegistryRow;
  kind: RegistryKind;
  organizationId: string;
  verifiedContext: Record<string, unknown>;
};

export type ResolveResult =
  | { found: true; value: ResolvedRegistryObject }
  | { found: false; reason: "NOT_FOUND" | "INVALID_ANCESTOR" | "ORGANIZATION_MISMATCH" };

function contextFor(kind: RegistryKind, row: RegistryRow) {
  const context: Record<string, unknown> = {
    organizationId: row.organizationId,
    resourceOrganizationId: row.organizationId,
    scopeVerified: true,
  };
  context[`${kind.toLowerCase()}Id`] = row.id;
  context.resourceScopeId = row.id;
  if (kind === "FACILITY") context.facilityId = row.id;
  if (kind === "BUILDING") {
    const value = row as Building;
    context.facilityId = value.facilityId;
    context.buildingId = value.id;
  }
  if (kind === "SPACE") {
    const value = row as Space;
    context.facilityId = value.facilityId;
    context.buildingId = value.buildingId;
    context.spaceId = value.id;
  }
  if (kind === "SYSTEM") {
    const value = row as System;
    context.facilityId = value.facilityId;
    context.buildingId = value.buildingId;
    context.spaceId = value.spaceId;
    context.systemId = value.id;
  }
  if (kind === "ASSET") {
    const value = row as Asset;
    context.facilityId = value.facilityId;
    context.buildingId = value.buildingId;
    context.spaceId = value.spaceId;
    context.assetId = value.id;
    if (value.systemId) context.systemId = value.systemId;
  }
  return context;
}

async function getRow(database: Database, kind: RegistryKind, id: string): Promise<RegistryRow | undefined> {
  const locked = async (table: any) => {
    const query = database.select().from(table).where(eq(table.id, id));
    const rows = typeof query.for === "function" ? await query.for("update") : await query;
    return rows[0];
  };
  switch (kind) {
    case "FACILITY": return locked(facilitiesTable);
    case "BUILDING": return locked(buildingsTable);
    case "SPACE": return locked(spacesTable);
    case "SYSTEM": return locked(systemsTable);
    case "ASSET": return locked(assetsTable);
  }
}

/**
 * Loads the complete ancestor chain using persisted rows. No request body,
 * query parameter, or session claim is accepted as relationship proof.
 * Invalid chains are fail-closed and are never returned to callers.
 */
export async function resolveRegistryObject(
  database: Database,
  kind: RegistryKind,
  id: string,
  organizationId: string,
): Promise<ResolveResult> {
  const row = await getRow(database, kind, id);
  if (!row || row.organizationId !== organizationId) {
    return { found: false, reason: row ? "ORGANIZATION_MISMATCH" : "NOT_FOUND" };
  }
  if (kind === "FACILITY") {
    return { found: true, value: { row, kind, organizationId, verifiedContext: contextFor(kind, row) } };
  }

  const value = row as Building | Space | System | Asset;
  const facilityId = value.facilityId;
  const [facility] = await database.select().from(facilitiesTable).where(and(
    eq(facilitiesTable.id, facilityId),
    eq(facilitiesTable.organizationId, organizationId),
  ));
  if (!facility) return { found: false, reason: "INVALID_ANCESTOR" };
  if (kind === "BUILDING") {
    return { found: true, value: { row, kind, organizationId, verifiedContext: contextFor(kind, row) } };
  }

  const buildingId = (value as Space).buildingId;
  const [building] = await database.select().from(buildingsTable).where(and(
    eq(buildingsTable.id, buildingId),
    eq(buildingsTable.facilityId, facilityId),
    eq(buildingsTable.organizationId, organizationId),
  ));
  if (!building) return { found: false, reason: "INVALID_ANCESTOR" };
  if (kind === "SPACE") {
    return { found: true, value: { row, kind, organizationId, verifiedContext: contextFor(kind, row) } };
  }

  const spaceId = (value as System | Asset).spaceId;
  const [space] = await database.select().from(spacesTable).where(and(
    eq(spacesTable.id, spaceId),
    eq(spacesTable.buildingId, buildingId),
    eq(spacesTable.facilityId, facilityId),
    eq(spacesTable.organizationId, organizationId),
  ));
  if (!space) return { found: false, reason: "INVALID_ANCESTOR" };
  if (kind === "SYSTEM") {
    return { found: true, value: { row, kind, organizationId, verifiedContext: contextFor(kind, row) } };
  }

  const asset = row as Asset;
  if (asset.systemId) {
    const [system] = await database.select().from(systemsTable).where(and(
      eq(systemsTable.id, asset.systemId),
      eq(systemsTable.spaceId, spaceId),
      eq(systemsTable.buildingId, buildingId),
      eq(systemsTable.facilityId, facilityId),
      eq(systemsTable.organizationId, organizationId),
    ));
    if (!system) return { found: false, reason: "INVALID_ANCESTOR" };
  }
  return { found: true, value: { row, kind, organizationId, verifiedContext: contextFor(kind, row) } };
}

export async function authorizeRegistryObject(input: {
  database?: Database;
  actorUserId: string;
  organizationId: string;
  kind: RegistryKind;
  action: "VIEW" | "CREATE" | "UPDATE" | "MANAGE";
  id: string;
  requestId?: string;
}) {
  const database = input.database ?? db;
  const resolved = await resolveRegistryObject(database, input.kind, input.id, input.organizationId);
  if (!resolved.found) {
    return { resolved, decision: { allowed: false, reasonCode: "RESOURCE_NOT_FOUND", permission: `${input.kind}.${input.action}` } as AuthorizationDecision };
  }
  const decision = await authorize({
    ...(input.database ? { database } : {}),
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    permission: `${input.kind}.${input.action}`,
    resourceType: input.kind,
    resourceId: input.id,
    verifiedContext: resolved.value.verifiedContext,
    requestId: input.requestId,
  });
  return { resolved, decision };
}

/** Explicit resource-specific entry points keep callers from constructing
 * authorization context from untrusted route parameters. */
export const resolveFacility = (database: Database, id: string, organizationId: string) =>
  resolveRegistryObject(database, "FACILITY", id, organizationId);
export const resolveBuilding = (database: Database, id: string, organizationId: string) =>
  resolveRegistryObject(database, "BUILDING", id, organizationId);
export const resolveSpace = (database: Database, id: string, organizationId: string) =>
  resolveRegistryObject(database, "SPACE", id, organizationId);
export const resolveSystem = (database: Database, id: string, organizationId: string) =>
  resolveRegistryObject(database, "SYSTEM", id, organizationId);
export const resolveAsset = (database: Database, id: string, organizationId: string) =>
  resolveRegistryObject(database, "ASSET", id, organizationId);

export function registryTable(kind: RegistryKind) {
  switch (kind) {
    case "FACILITY": return facilitiesTable;
    case "BUILDING": return buildingsTable;
    case "SPACE": return spacesTable;
    case "SYSTEM": return systemsTable;
    case "ASSET": return assetsTable;
  }
}

type RegistryParent = {
  kind: "FACILITY" | "BUILDING" | "SPACE" | "SYSTEM";
  id: string;
};

type RegistryQuery = {
  database: Database;
  kind: RegistryKind;
  organizationId: string;
  actorUserId: string;
  query?: string;
  parent?: RegistryParent;
  limit?: number;
  offset?: number;
  after?: { name: string; id: string };
};

function bindingColumn(table: any, kind: RegistryKind, scopeType: string) {
  if (scopeType === "FACILITY") return kind === "FACILITY" ? table.id : table.facilityId;
  if (scopeType === "BUILDING") return kind === "BUILDING" ? table.id : ["SPACE", "SYSTEM", "ASSET"].includes(kind) ? table.buildingId : undefined;
  if (scopeType === "SPACE") return kind === "SPACE" ? table.id : ["SYSTEM", "ASSET"].includes(kind) ? table.spaceId : undefined;
  if (scopeType === "ASSET") return kind === "ASSET" ? table.id : undefined;
  return undefined;
}

function parentPredicate(table: any, kind: RegistryKind, parent?: RegistryParent) {
  if (!parent) return undefined;
  if (parent.kind === "FACILITY") return kind === "FACILITY" ? eq(table.id, parent.id) : eq(table.facilityId, parent.id);
  if (parent.kind === "BUILDING") return ["FACILITY", "BUILDING"].includes(kind)
    ? eq(table.id, parent.id)
    : eq(table.buildingId, parent.id);
  if (parent.kind === "SPACE") return ["FACILITY", "BUILDING", "SPACE"].includes(kind)
    ? eq(table.id, parent.id)
    : eq(table.spaceId, parent.id);
  return kind === "ASSET" ? eq(table.systemId, parent.id) : eq(table.id, parent.id);
}

async function registryAuthorizationPredicate(input: RegistryQuery, table: any) {
  const now = new Date();
  const permission = `${input.kind}.VIEW`;
  const grants = await input.database.select({
    effect: rolePermissionsTable.effect,
    defaultScopeType: rolePermissionsTable.defaultScopeType,
    scopeType: userRoleBindingsTable.scopeType,
    scopeId: userRoleBindingsTable.scopeId,
  }).from(userRoleBindingsTable)
    .innerJoin(rolesTable, eq(userRoleBindingsTable.roleId, rolesTable.id))
    .innerJoin(rolePermissionsTable, eq(userRoleBindingsTable.roleId, rolePermissionsTable.roleId))
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .innerJoin(usersTable, and(eq(userRoleBindingsTable.userId, usersTable.id), eq(usersTable.isActive, true)))
    .innerJoin(organizationsTable, and(
      eq(userRoleBindingsTable.organizationId, organizationsTable.id),
      eq(organizationsTable.isActive, true),
    ))
    .innerJoin(membershipsTable, and(
      eq(membershipsTable.userId, userRoleBindingsTable.userId),
      eq(membershipsTable.organizationId, userRoleBindingsTable.organizationId),
      eq(membershipsTable.isActive, true),
    ))
    .where(and(
      eq(userRoleBindingsTable.userId, input.actorUserId),
      eq(userRoleBindingsTable.organizationId, input.organizationId),
      eq(userRoleBindingsTable.status, "ACTIVE"),
      eq(rolesTable.status, "ACTIVE"),
      eq(permissionsTable.code, permission),
      eq(permissionsTable.status, "ACTIVE"),
      or(isNull(userRoleBindingsTable.startsAt), lte(userRoleBindingsTable.startsAt, now)),
      or(isNull(userRoleBindingsTable.endsAt), gt(userRoleBindingsTable.endsAt, now)),
    ));
  const objectScopes = new Set(["FACILITY", "BUILDING", "SPACE", "ASSET"]);
  const validGrants = grants.filter((grant: any) =>
    !objectScopes.has(grant.scopeType) || Boolean(grant.scopeId));
  if (validGrants.some((grant: any) => grant.effect === "DENY")) return undefined;
  const predicates = validGrants
    .filter((grant: any) =>
      grant.effect === "ALLOW" &&
      grant.scopeId &&
      isBindingScopeCompatible(grant.defaultScopeType, grant.scopeType))
    .map((grant: any) => {
      const column = bindingColumn(table, input.kind, grant.scopeType);
      return column ? eq(column, grant.scopeId) : undefined;
    })
    .filter(Boolean);
  return predicates.length ? or(...predicates) : undefined;
}

function registryBasePredicate(input: RegistryQuery, table: any, authorizationPredicate: any) {
  const search = input.query?.trim();
  return and(
    eq(table.organizationId, input.organizationId),
    authorizationPredicate,
    parentPredicate(table, input.kind, input.parent),
    search ? or(ilike(table.name, `%${search}%`), ilike(table.code, `%${search}%`)) : undefined,
    input.after ? or(
      gt(table.name, input.after.name),
      and(eq(table.name, input.after.name), gt(table.id, input.after.id)),
    ) : undefined,
  );
}

export async function queryAuthorizedRegistryRows(input: RegistryQuery) {
  const table = registryTable(input.kind);
  const authorizationPredicate = await registryAuthorizationPredicate(input, table);
  if (!authorizationPredicate) return { rows: [] as RegistryRow[], total: 0 };
  const where = registryBasePredicate(input, table, authorizationPredicate);
  const rowsQuery = input.database.select().from(table).where(where)
    .orderBy(asc(table.name), asc(table.id));
  const rows = input.limit === undefined
    ? await rowsQuery
    : await rowsQuery.limit(input.limit).offset(input.offset ?? 0);
  const [total] = await input.database.select({ value: count() }).from(table).where(where);
  return { rows: rows as RegistryRow[], total: Number(total?.value ?? 0) };
}

export async function listAuthorizedRegistryBatch(input: RegistryQuery) {
  const table = registryTable(input.kind);
  const authorizationPredicate = await registryAuthorizationPredicate(input, table);
  if (!authorizationPredicate) return [] as RegistryRow[];
  return input.database.select().from(table)
    .where(registryBasePredicate(input, table, authorizationPredicate))
    .orderBy(asc(table.name), asc(table.id))
    .limit(input.limit ?? 500) as Promise<RegistryRow[]>;
}

export const registryCsvHeader = "id,organizationId,name,code,status\n";

export function csvForRow(row: RegistryRow) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [row.id, row.organizationId, row.name, row.code, row.status].map(escape).join(",") + "\n";
}
