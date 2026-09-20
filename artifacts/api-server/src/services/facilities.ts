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
  authorizationDatabase?: Database;
  kind: RegistryKind;
  organizationId: string;
  actorUserId: string;
  query?: string;
  parent?: RegistryParent;
  limit?: number;
  offset?: number;
  after?: { name: string; id: string };
};

export class RegistryExportAuthorizationError extends Error {
  constructor() {
    super("Registry export authorization is no longer valid");
    this.name = "RegistryExportAuthorizationError";
  }
}

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
  );
}

function registryCursorPredicate(input: RegistryQuery, table: any) {
  return and(
    input.after ? or(
      gt(table.name, input.after.name),
      and(eq(table.name, input.after.name), gt(table.id, input.after.id)),
    ) : undefined,
  );
}

export async function queryAuthorizedRegistryRows(input: RegistryQuery) {
  const table = registryTable(input.kind);
  const authorizationPredicate = await registryAuthorizationPredicate(input, table);
  if (!authorizationPredicate) return { rows: [] as RegistryRow[], total: 0, hasMore: false };
  const baseWhere = registryBasePredicate(input, table, authorizationPredicate);
  const rowsWhere = and(baseWhere, registryCursorPredicate(input, table));
  const rowsQuery = input.database.select().from(table).where(rowsWhere)
    .orderBy(asc(table.name), asc(table.id));
  const requestedRows = input.limit === undefined
    ? await rowsQuery
    : await rowsQuery.limit(input.limit + 1).offset(input.after ? 0 : input.offset ?? 0);
  const hasMore = input.limit !== undefined && requestedRows.length > input.limit;
  const rows = hasMore ? requestedRows.slice(0, input.limit) : requestedRows;
  const [total] = await input.database.select({ value: count() }).from(table).where(baseWhere);
  return { rows: rows as RegistryRow[], total: Number(total?.value ?? 0), hasMore };
}

export async function listAuthorizedRegistryBatch(input: RegistryQuery) {
  const table = registryTable(input.kind);
  const authorizationPredicate = await registryAuthorizationPredicate({
    ...input,
    database: input.authorizationDatabase ?? input.database,
  }, table);
  if (!authorizationPredicate) {
    if (input.authorizationDatabase) throw new RegistryExportAuthorizationError();
    return [] as RegistryRow[];
  }
  return input.database.select().from(table)
    .where(and(
      registryBasePredicate(input, table, authorizationPredicate),
      registryCursorPredicate(input, table),
    ))
    .orderBy(asc(table.name), asc(table.id))
    .limit(input.limit ?? 500) as Promise<RegistryRow[]>;
}

export const registryCsvHeader = "id,organizationId,name,code,status\n";

/**
 * The portfolio import deliberately has a different, stable contract from
 * the per-kind export.  clientRef is the portable identifier used by
 * descendants; ids are optional and are only accepted when importing an
 * object with a caller-selected UUID.
 */
export const portfolioImportHeader = [
  "kind", "clientRef", "id", "organizationId", "parentRef", "systemRef",
  "name", "code", "description", "status",
] as const;
export const portfolioImportHeaderLine = `${portfolioImportHeader.join(",")}\n`;
export const PORTFOLIO_IMPORT_MAX_ROWS = 10_000;
export const PORTFOLIO_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const PORTFOLIO_IMPORT_MAX_ERRORS = 1_000;

export type PortfolioImportRecord = {
  rowNumber: number;
  kind: RegistryKind;
  clientRef: string;
  id?: string;
  organizationId?: string;
  parentRef?: string;
  systemRef?: string;
  name: string;
  code?: string;
  description?: string;
  status: "ACTIVE" | "INACTIVE";
};

export type PortfolioImportError = { row: number; error: string };

export type PortfolioImportValidation = {
  records: PortfolioImportRecord[];
  errors: PortfolioImportError[];
};

function csvError(row: number, error: string): PortfolioImportError {
  return { row, error };
}

function limitedImportErrors(errors: PortfolioImportError[]) {
  if (errors.length <= PORTFOLIO_IMPORT_MAX_ERRORS) return errors;
  return [
    ...errors.slice(0, PORTFOLIO_IMPORT_MAX_ERRORS - 1),
    csvError(1, `Additional errors omitted after ${PORTFOLIO_IMPORT_MAX_ERRORS - 1} entries`),
  ];
}

/**
 * Small strict CSV reader.  It supports RFC-4180 quoting, but intentionally
 * rejects multiline fields and whitespace after a closing quote so row
 * numbers in error reports remain useful and deterministic.
 */
function parseCsvText(text: string): { rows: string[][]; errors: PortfolioImportError[] } {
  const rows: string[][] = [];
  const errors: PortfolioImportError[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  let row = 1;
  let rowStart = 1;
  const finishField = () => {
    fields.push(quoted ? field : field.trim());
    field = "";
    quoted = false;
    quoteClosed = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(fields);
    fields = [];
    rowStart = row + 1;
  };

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (/\r(?!\n)/.test(text)) {
    return { rows: [], errors: [csvError(1, "CSV must use LF or CRLF line endings")] };
  }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else if (char === "\n" || char === "\r") {
        errors.push(csvError(rowStart, "Multiline CSV fields are not supported"));
        while (i < text.length && text[i] !== "\n") i += 1;
        fields = [];
        field = "";
        quoted = false;
        quoteClosed = false;
        row += 1;
        rowStart = row;
      } else {
        field += char;
      }
      continue;
    }
    if (quoteClosed) {
      if (char === " " || char === "\t") {
        errors.push(csvError(rowStart, "Whitespace after a closing quote is not allowed"));
        quoteClosed = false;
        field += char;
      } else if (char === ",") {
        finishField();
      } else if (char === "\r" && text[i + 1] === "\n") {
        finishRow();
        i += 1;
        row += 1;
      } else if (char === "\n") {
        finishRow();
        row += 1;
      } else {
        errors.push(csvError(rowStart, "Unexpected characters after a closing quote"));
        quoteClosed = false;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.length > 0) {
        errors.push(csvError(rowStart, "A quote is only valid at the start of a field"));
      } else {
        quoted = true;
      }
    } else if (char === ",") {
      finishField();
    } else if (char === "\r" && text[i + 1] === "\n") {
      finishRow();
      i += 1;
      row += 1;
    } else if (char === "\n") {
      finishRow();
      row += 1;
    } else {
      field += char;
    }
  }
  if (quoted) errors.push(csvError(rowStart, "Unclosed quoted field"));
  if (fields.length > 0 || field.length > 0 || quoteClosed) finishRow();
  return { rows, errors };
}

function optionalValue(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed;
}

export function parsePortfolioImport(text: string): PortfolioImportValidation {
  let physicalRows = text.length > 0 ? 1 : 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n" && index < text.length - 1) physicalRows += 1;
    if (physicalRows > PORTFOLIO_IMPORT_MAX_ROWS + 1) {
      return {
        records: [],
        errors: [csvError(1, `CSV may contain at most ${PORTFOLIO_IMPORT_MAX_ROWS} data rows`)],
      };
    }
  }
  const parsed = parseCsvText(text);
  const errors = [...parsed.errors];
  if (!parsed.rows.length) {
    errors.push(csvError(1, "CSV is empty"));
    return { records: [], errors: limitedImportErrors(errors) };
  }
  const header = parsed.rows[0]!;
  if (header.length !== portfolioImportHeader.length ||
    header.some((value, index) => value !== portfolioImportHeader[index])) {
    errors.push(csvError(1, `Header must be exactly ${portfolioImportHeader.join(",")}`));
    return { records: [], errors: limitedImportErrors(errors) };
  }
  const records: PortfolioImportRecord[] = [];
  for (let index = 1; index < parsed.rows.length; index += 1) {
    const row = parsed.rows[index]!;
    const rowNumber = index + 1;
    if (row.length !== portfolioImportHeader.length) {
      errors.push(csvError(rowNumber, `Expected ${portfolioImportHeader.length} fields, received ${row.length}`));
      continue;
    }
    const [kindValue, clientRefValue, idValue, organizationValue, parentRefValue,
      systemRefValue, nameValue, codeValue, descriptionValue, statusValue] = row;
    const kind = kindValue as RegistryKind;
    if (!REGISTRY_KINDS.includes(kind)) {
      errors.push(csvError(rowNumber, "kind must be FACILITY, BUILDING, SPACE, SYSTEM, or ASSET"));
      continue;
    }
    const clientRef = clientRefValue.trim();
    const name = nameValue.trim();
    const status = statusValue.trim();
    const id = optionalValue(idValue);
    const organizationId = optionalValue(organizationValue);
    const parentRef = optionalValue(parentRefValue);
    const systemRef = optionalValue(systemRefValue);
    const code = optionalValue(codeValue);
    const description = optionalValue(descriptionValue);
    const rowErrors: string[] = [];
    if (!clientRef || clientRef.length > 100) rowErrors.push("clientRef is required and must be at most 100 characters");
    if (!name || name.length > 200) rowErrors.push("name is required and must be at most 200 characters");
    if (parentRef && parentRef.length > 100) rowErrors.push("parentRef must be at most 100 characters");
    if (code && code.length > 100) rowErrors.push("code must be at most 100 characters");
    if (description && description.length > 4000) rowErrors.push("description must be at most 4000 characters");
    if (status !== "ACTIVE" && status !== "INACTIVE") rowErrors.push("status must be ACTIVE or INACTIVE");
    for (const [label, value] of [["id", id], ["organizationId", organizationId]] as const) {
      if (value && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        rowErrors.push(`${label} must be a UUID`);
      }
    }
    if (kind === "FACILITY" && parentRef) rowErrors.push("FACILITY rows cannot have parentRef");
    if (kind !== "FACILITY" && !parentRef) rowErrors.push(`${kind} rows require parentRef`);
    if (kind !== "ASSET" && systemRef) rowErrors.push("Only ASSET rows can have systemRef");
    if (kind === "ASSET" && systemRef && systemRef.length > 100) rowErrors.push("systemRef must be at most 100 characters");
    if (rowErrors.length) {
      for (const error of rowErrors) errors.push(csvError(rowNumber, error));
      continue;
    }
    records.push({
      rowNumber, kind, clientRef, ...(id ? { id } : {}),
      ...(organizationId ? { organizationId } : {}), ...(parentRef ? { parentRef } : {}),
      ...(systemRef ? { systemRef } : {}), name, ...(code ? { code } : {}),
      ...(description ? { description } : {}), status: status as "ACTIVE" | "INACTIVE",
    });
  }
  if (records.length > PORTFOLIO_IMPORT_MAX_ROWS) {
    errors.push(csvError(1, `CSV may contain at most ${PORTFOLIO_IMPORT_MAX_ROWS} data rows`));
  }
  const refs = new Map<string, PortfolioImportRecord>();
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const record of records) {
    const refKey = record.clientRef.toLowerCase();
    if (refs.has(refKey)) errors.push(csvError(record.rowNumber, `Duplicate clientRef "${record.clientRef}"`));
    refs.set(refKey, record);
    if (record.id && ids.has(record.id)) errors.push(csvError(record.rowNumber, `Duplicate id "${record.id}"`));
    if (record.id) ids.add(record.id);
    if (record.code) {
      const codeKey = `${record.kind}:${record.code}`;
      if (codes.has(codeKey)) errors.push(csvError(record.rowNumber, `Duplicate ${record.kind} code "${record.code}"`));
      codes.add(codeKey);
    }
  }
  if (records.length === 0 && errors.length === 0) {
    errors.push(csvError(1, "CSV must contain at least one data row"));
  }
  return { records, errors: limitedImportErrors(errors) };
}

function parentKind(kind: RegistryKind): RegistryKind | undefined {
  if (kind === "BUILDING") return "FACILITY";
  if (kind === "SPACE") return "BUILDING";
  if (kind === "SYSTEM" || kind === "ASSET") return "SPACE";
  return undefined;
}

function rowLookupKey(kind: RegistryKind, reference: string) {
  return `${kind}:${reference.toLowerCase()}`;
}

/**
 * Performs all database-backed checks without writing.  It also returns a
 * dependency order, allowing the route to authorize and insert in one
 * transaction after this function succeeds.
 */
export async function validatePortfolioImport(
  database: Database,
  text: string,
  organizationId: string,
): Promise<PortfolioImportValidation> {
  const result = parsePortfolioImport(text);
  const errors = [...result.errors];
  // Syntax and row-shape failures cannot be improved by database lookups.
  // Returning early also keeps malformed uploads entirely read-only.
  if (errors.length) return result;
  const byRef = new Map<string, PortfolioImportRecord>();
  const byId = new Map<string, PortfolioImportRecord>();
  for (const record of result.records) {
    byRef.set(rowLookupKey(record.kind, record.clientRef), record);
    if (record.id) byId.set(record.id, record);
    if (record.organizationId && record.organizationId !== organizationId) {
      errors.push(csvError(record.rowNumber, "organizationId is outside the active organization"));
    }
  }
  const ordered: PortfolioImportRecord[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (record: PortfolioImportRecord) => {
    const key = rowLookupKey(record.kind, record.clientRef);
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      errors.push(csvError(record.rowNumber, "Ancestor references contain a cycle"));
      return;
    }
    visiting.add(key);
    const expectedKind = parentKind(record.kind);
    if (expectedKind && record.parentRef) {
      const inFile = byRef.get(rowLookupKey(expectedKind, record.parentRef));
      if (inFile) visit(inFile);
      else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.parentRef)) {
        errors.push(csvError(record.rowNumber, `parentRef does not name a ${expectedKind} clientRef or UUID`));
      }
    }
    if (record.kind === "ASSET" && record.systemRef) {
      const system = byRef.get(rowLookupKey("SYSTEM", record.systemRef));
      if (system) visit(system);
      else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.systemRef)) {
        errors.push(csvError(record.rowNumber, "systemRef does not name a SYSTEM clientRef or UUID"));
      }
    }
    visiting.delete(key);
    visited.add(key);
    ordered.push(record);
  };
  for (const record of result.records) visit(record);

  const existingIds = new Set<string>();
  const existingCodes = new Set<string>();
  for (const kind of REGISTRY_KINDS) {
    const table = registryTable(kind);
    const existing = await database.select({
      id: table.id,
      code: table.code,
      organizationId: table.organizationId,
    }).from(table).where(eq(table.organizationId, organizationId));
    for (const row of existing) {
      existingIds.add(row.id);
      if (row.code && row.organizationId === organizationId) existingCodes.add(`${kind}:${row.code}`);
    }
  }
  for (const record of result.records) {
    if (record.id && existingIds.has(record.id)) errors.push(csvError(record.rowNumber, `id "${record.id}" already exists`));
    if (record.code && existingCodes.has(`${record.kind}:${record.code}`)) {
      errors.push(csvError(record.rowNumber, `${record.kind} code "${record.code}" already exists`));
    }
    const expectedKind = parentKind(record.kind);
    if (expectedKind && record.parentRef && !byRef.has(rowLookupKey(expectedKind, record.parentRef))) {
      const parent = await resolveRegistryObject(database, expectedKind, record.parentRef, organizationId);
      if (!parent.found) errors.push(csvError(record.rowNumber, "Persisted ancestor was not found in the active organization"));
    }
    if (record.kind === "ASSET" && record.systemRef && !byRef.has(rowLookupKey("SYSTEM", record.systemRef))) {
      const system = await resolveRegistryObject(database, "SYSTEM", record.systemRef, organizationId);
      if (!system.found) errors.push(csvError(record.rowNumber, "Persisted system was not found in the active organization"));
      const parent = record.parentRef && /^[0-9a-f-]{36}$/i.test(record.parentRef)
        ? await resolveRegistryObject(database, "SPACE", record.parentRef, organizationId) : null;
      if (system.found && parent?.found && system.value.verifiedContext.spaceId !== parent.value.row.id) {
        errors.push(csvError(record.rowNumber, "systemRef must belong to the asset parent space"));
      }
      if (system.found && record.parentRef && !parent) {
        errors.push(csvError(record.rowNumber, "A persisted system cannot be attached to a new in-file space"));
      }
    } else if (record.kind === "ASSET" && record.systemRef) {
      const system = byRef.get(rowLookupKey("SYSTEM", record.systemRef));
      if (system && record.parentRef &&
        system.parentRef?.toLowerCase() !== record.parentRef.toLowerCase()) {
        errors.push(csvError(record.rowNumber, "systemRef must belong to the asset parent space"));
      }
    }
  }
  return { records: ordered, errors: limitedImportErrors(errors) };
}

export function csvForRow(row: RegistryRow) {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [row.id, row.organizationId, row.name, row.code, row.status].map(escape).join(",") + "\n";
}
