import { and, asc, eq, ilike, or } from "drizzle-orm";
import {
  assetsTable,
  buildingsTable,
  db,
  facilitiesTable,
  spacesTable,
  systemsTable,
} from "@workspace/db";
import type { Asset, Building, Facility, Space, System } from "@workspace/db";
import { authorize, type AuthorizationDecision } from "./authorization";

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

export async function listRegistryRows(
  database: Database,
  kind: RegistryKind,
  organizationId: string,
  query?: string,
) {
  const table = registryTable(kind);
  const where = query?.trim()
    ? and(eq(table.organizationId, organizationId), or(
      ilike(table.name, `%${query.trim()}%`),
      ilike(table.code, `%${query.trim()}%`),
    ))
    : eq(table.organizationId, organizationId);
  return database.select().from(table).where(where).orderBy(asc(table.name), asc(table.id));
}

export function csvForRows(rows: RegistryRow[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    ["id", "organizationId", "name", "code", "status"].join(","),
    ...rows.map((row) => [row.id, row.organizationId, row.name, row.code, row.status].map(escape).join(",")),
  ].join("\n") + "\n";
}
