import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assetsTable,
  authorizationAuditLogsTable,
  buildingsTable,
  db,
  facilitiesTable,
  spacesTable,
  systemsTable,
} from "@workspace/db";
import { currentUser as defaultCurrentUser } from "./foundation";
import { authorize } from "../services/authorization";
import {
  authorizeRegistryObject,
  csvForRow,
  listAuthorizedRegistryBatch,
  portfolioImportHeaderLine,
  PORTFOLIO_IMPORT_MAX_BYTES,
  queryAuthorizedRegistryRows,
  REGISTRY_KINDS,
  RegistryExportAuthorizationError,
  registryCsvHeader,
  resolveRegistryObject,
  validatePortfolioImport,
  type RegistryKind,
  type RegistryRow,
} from "../services/facilities";
import { getActiveOrganizationId } from "./authorization";

type Database = typeof db;
type CurrentUser = typeof defaultCurrentUser;
type RegistryCapabilities = {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  createChildren: Partial<Record<RegistryKind, boolean>>;
};
type RegistryCollectionCapabilities = { create: boolean };
type AuthorizedRegistryRow = RegistryRow & { capabilities: RegistryCapabilities };

type DrainableResponse = {
  destroyed: boolean;
  once(event: "drain" | "close" | "error", listener: (...args: any[]) => void): unknown;
  removeListener(event: "drain" | "close" | "error", listener: (...args: any[]) => void): unknown;
};

export function waitForCsvDrain(response: DrainableResponse) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.removeListener("drain", onDrain);
      response.removeListener("close", onClose);
      response.removeListener("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error("CSV export client disconnected"));
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(error);
    };
    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);
    if (response.destroyed) onClose();
  });
}

export type FacilitiesRouteDependencies = {
  currentUser?: CurrentUser;
  db?: Database;
};

const nameInput = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(100).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
const facilityInput = nameInput.extend({ organizationId: z.string().uuid().optional() });
const childInput = nameInput.extend({
  facilityId: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  spaceId: z.string().uuid().optional(),
  systemId: z.string().uuid().nullable().optional(),
});

const plural: Record<RegistryKind, string> = {
  FACILITY: "facilities",
  BUILDING: "buildings",
  SPACE: "spaces",
  SYSTEM: "systems",
  ASSET: "assets",
};

function parsePage(value: unknown, fallback: number, max: number) {
  const parsed = typeof value === "string" ? Number(value) : fallback;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

const registryCursorSchema = z.object({
  v: z.literal(1),
  name: z.string().max(200),
  id: z.string().uuid(),
}).strict();

type RegistryCursor = z.infer<typeof registryCursorSchema>;

function encodeRegistryCursor(cursor: Omit<RegistryCursor, "v">) {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor }), "utf8").toString("base64url");
}

function parseRegistryCursor(value: unknown): RegistryCursor | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 1_000) return null;
  try {
    return registryCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

async function actorContext(
  req: import("express").Request,
  res: import("express").Response,
  resolveCurrentUser: CurrentUser,
  database: Database,
) {
  const user = await resolveCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const organizationId = await getActiveOrganizationId(user.id, database);
  if (!organizationId) {
    res.status(403).json({ error: "Active organization context required" });
    return null;
  }
  return { user, organizationId };
}

const childKinds: Record<RegistryKind, RegistryKind[]> = {
  FACILITY: ["BUILDING"],
  BUILDING: ["SPACE"],
  SPACE: ["SYSTEM", "ASSET"],
  SYSTEM: ["ASSET"],
  ASSET: [],
};

async function collectionCreateCapability(
  database: Database,
  kind: RegistryKind,
  actorUserId: string,
  organizationId: string,
  verifiedContext: Record<string, unknown>,
  resourceId: string,
  requestId: string,
): Promise<RegistryCollectionCapabilities> {
  const decision = await authorize({
    database,
    actorUserId,
    organizationId,
    permission: `${kind}.CREATE`,
    resourceType: kind,
    resourceId,
    verifiedContext,
    requestId,
  });
  return { create: decision.allowed };
}

async function registryCapabilities(
  database: Database,
  kind: RegistryKind,
  resolved: Extract<Awaited<ReturnType<typeof resolveRegistryObject>>, { found: true }>,
  actorUserId: string,
  organizationId: string,
  requestId: string,
  viewDecision?: Awaited<ReturnType<typeof authorize>>,
): Promise<RegistryCapabilities> {
  const evaluate = (action: "CREATE" | "UPDATE" | "MANAGE", capabilityKind = kind) =>
    authorize({
      database,
      actorUserId,
      organizationId,
      permission: `${capabilityKind}.${action}`,
      resourceType: capabilityKind,
      resourceId: resolved.value.row.id,
      verifiedContext: resolved.value.verifiedContext,
      requestId,
    });
  const view = viewDecision ?? await authorize({
    database,
    actorUserId,
    organizationId,
    permission: `${kind}.VIEW`,
    resourceType: kind,
    resourceId: resolved.value.row.id,
    verifiedContext: resolved.value.verifiedContext,
    requestId,
  });
  const [create, update, remove] = await Promise.all([
    evaluate("CREATE"),
    evaluate("UPDATE"),
    // Registry DELETE is intentionally evaluated through the existing MANAGE
    // permission; the UI only receives the resulting boolean.
    evaluate("MANAGE"),
  ]);
  const createChildren = Object.fromEntries(await Promise.all(
    childKinds[kind].map(async (childKind) => [
      childKind,
      (await evaluate("CREATE", childKind)).allowed,
    ] as const),
  ));
  return {
    view: view.allowed,
    create: create.allowed,
    update: update.allowed,
    delete: remove.allowed,
    createChildren,
  };
}

async function decorateRow(
  database: Database,
  kind: RegistryKind,
  row: RegistryRow,
  actorUserId: string,
  organizationId: string,
  requestId: string,
): Promise<AuthorizedRegistryRow | null> {
  const resolved = await resolveRegistryObject(database, kind, row.id, organizationId);
  if (!resolved.found) {
    // A concurrent deletion or invalid ancestry must never result in an
    // inferred capability or an exposed record.
    return null;
  }
  return {
    ...row,
    capabilities: await registryCapabilities(database, kind, resolved, actorUserId, organizationId, requestId),
  };
}

async function authorizedRows(
  database: Database,
  kind: RegistryKind,
  organizationId: string,
  actorUserId: string,
  query: string | undefined,
  requestId: string,
  page: number,
  limit: number,
  parent?: { kind: "FACILITY" | "BUILDING" | "SPACE" | "SYSTEM"; id: string },
  after?: { name: string; id: string },
) {
  const result = await queryAuthorizedRegistryRows({
    database,
    kind,
    organizationId,
    actorUserId,
    query,
    parent,
    limit,
    offset: after ? undefined : (page - 1) * limit,
    after,
  });
  const rows: AuthorizedRegistryRow[] = [];
  for (const candidate of result.rows) {
    const resolved = await resolveRegistryObject(database, kind, candidate.id, organizationId);
    if (!resolved.found) continue;
    const capabilities = await registryCapabilities(
      database, kind, resolved, actorUserId, organizationId, requestId,
    );
    if (!capabilities.view) continue;
    rows.push({
      ...candidate,
      capabilities,
    });
  }
  const last = result.rows.at(-1);
  return {
    rows,
    total: result.total,
    nextCursor: result.hasMore && last ? encodeRegistryCursor({ name: last.name, id: last.id }) : null,
  };
}

async function insertRegistryRow(database: any, kind: RegistryKind, values: Record<string, unknown>) {
  switch (kind) {
    case "FACILITY": return (await database.insert(facilitiesTable).values(values as typeof facilitiesTable.$inferInsert).returning())[0];
    case "BUILDING": return (await database.insert(buildingsTable).values(values as typeof buildingsTable.$inferInsert).returning())[0];
    case "SPACE": return (await database.insert(spacesTable).values(values as typeof spacesTable.$inferInsert).returning())[0];
    case "SYSTEM": return (await database.insert(systemsTable).values(values as typeof systemsTable.$inferInsert).returning())[0];
    case "ASSET": return (await database.insert(assetsTable).values(values as typeof assetsTable.$inferInsert).returning())[0];
  }
}

async function updateRegistryRow(database: any, kind: RegistryKind, id: string, organizationId: string, values: Record<string, unknown>) {
  const where = and(eq(registryTable(kind).id, id), eq(registryTable(kind).organizationId, organizationId));
  switch (kind) {
    case "FACILITY": return (await database.update(facilitiesTable).set(values).where(where).returning())[0];
    case "BUILDING": return (await database.update(buildingsTable).set(values).where(where).returning())[0];
    case "SPACE": return (await database.update(spacesTable).set(values).where(where).returning())[0];
    case "SYSTEM": return (await database.update(systemsTable).set(values).where(where).returning())[0];
    case "ASSET": return (await database.update(assetsTable).set(values).where(where).returning())[0];
  }
}

function registryTable(kind: RegistryKind) {
  switch (kind) {
    case "FACILITY": return facilitiesTable;
    case "BUILDING": return buildingsTable;
    case "SPACE": return spacesTable;
    case "SYSTEM": return systemsTable;
    case "ASSET": return assetsTable;
  }
}

async function deleteRegistryRow(database: any, kind: RegistryKind, id: string, organizationId: string) {
  const table = registryTable(kind);
  return (await database.delete(table)
    .where(and(eq(table.id, id), eq(table.organizationId, organizationId)))
    .returning({ id: table.id }))[0];
}

function parentFor(kind: RegistryKind, body: Record<string, unknown>) {
  if (kind === "BUILDING") return typeof body.facilityId === "string" ? { kind: "FACILITY" as const, id: body.facilityId } : null;
  if (kind === "SPACE") return typeof body.buildingId === "string" ? { kind: "BUILDING" as const, id: body.buildingId } : null;
  if (kind === "SYSTEM" || kind === "ASSET") return typeof body.spaceId === "string" ? { kind: "SPACE" as const, id: body.spaceId } : null;
  return null;
}

function ancestorsFromParent(kind: RegistryKind, parent: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...parent, scopeVerified: true };
  if (kind === "BUILDING") result.facilityId = parent.id;
  return result;
}

function mutationValues(kind: RegistryKind, input: Record<string, unknown>, id: string, organizationId: string, parent: Record<string, unknown> | null) {
  const values: Record<string, unknown> = {
    id,
    organizationId,
    name: input.name,
    code: input.code ?? null,
    description: input.description ?? null,
    status: input.status ?? "ACTIVE",
  };
  if (kind === "BUILDING") values.facilityId = parent?.facilityId;
  if (kind === "SPACE") {
    values.facilityId = parent?.facilityId;
    values.buildingId = parent?.buildingId;
  }
  if (kind === "SYSTEM") {
    values.facilityId = parent?.facilityId;
    values.buildingId = parent?.buildingId;
    values.spaceId = parent?.spaceId;
  }
  if (kind === "ASSET") {
    values.facilityId = parent?.facilityId;
    values.buildingId = parent?.buildingId;
    values.spaceId = parent?.spaceId;
    values.systemId = input.systemId ?? null;
  }
  return values;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function sendImportErrors(
  res: import("express").Response,
  errors: Array<{ row: number; error: string }>,
) {
  res.status(400).type("text/csv")
    .set("Content-Disposition", 'attachment; filename="facility-portfolio-import-errors.csv"');
  res.send(["row,error", ...errors.map((entry) => `${entry.row},${csvCell(entry.error)}`)].join("\n") + "\n");
}

class PortfolioImportAuthorizationError extends Error {
  constructor(
    public readonly reasonCode: string,
    public readonly kind: RegistryKind,
    public readonly row: number,
  ) {
    super(`Authorization denied for ${kind} row ${row}`);
  }
}

export function createFacilitiesRouter(dependencies: FacilitiesRouteDependencies = {}) {
  const router: IRouter = Router();
  const database = dependencies.db ?? db;
  const resolveCurrentUser = dependencies.currentUser ?? defaultCurrentUser;

  async function list(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const bootstrapResourceId = randomUUID();
    const collectionCapabilities = kind === "FACILITY"
      ? await collectionCreateCapability(
        database,
        "FACILITY",
        actor.user.id,
        actor.organizationId,
        // This is the same verified organization bootstrap context used by
        // POST /facilities; the generated ID is server-only.
        { organizationId: actor.organizationId, scopeVerified: true, resourceScopeId: bootstrapResourceId },
        bootstrapResourceId,
        String(req.id),
      )
      : { create: false };
    const page = parsePage(req.query.page, 1, 1_000_000);
    const limit = parsePage(req.query.limit, 50, 100);
    const cursor = parseRegistryCursor(req.query.cursor);
    if (cursor === null) {
      res.status(400).json({ error: "Invalid registry cursor" });
      return;
    }
    const result = await authorizedRows(database, kind, actor.organizationId, actor.user.id,
      typeof req.query.q === "string" ? req.query.q : undefined, String(req.id), page, limit,
      undefined, cursor);
    res.json({
      items: result.rows,
      page,
      limit,
      total: result.total,
      nextCursor: result.nextCursor,
      collectionCapabilities,
    });
  }

  async function exportRows(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const write = async (chunk: string) => {
      if (res.destroyed) throw new Error("CSV export client disconnected");
      if (!res.write(chunk)) await waitForCsvDrain(res);
    };
    try {
      await database.transaction(async (snapshot: any) => {
        const batchSize = 500;
        let after: { name: string; id: string } | undefined;
        let headerWritten = false;
        for (;;) {
          const rows = await listAuthorizedRegistryBatch({
            database: snapshot,
            // Authorization is deliberately checked against current committed
            // state before every snapshot batch. Revocation therefore stops a
            // long export even though registry rows retain their start-time view.
            authorizationDatabase: database,
            kind,
            organizationId: actor.organizationId,
            actorUserId: actor.user.id,
            query: typeof req.query.q === "string" ? req.query.q : undefined,
            limit: batchSize,
            after,
          });
          if (!headerWritten) {
            res.type("text/csv").set("Content-Disposition", `attachment; filename="${plural[kind]}.csv"`);
            await write(registryCsvHeader);
            headerWritten = true;
          }
          for (const row of rows) await write(csvForRow(row));
          if (rows.length < batchSize) break;
          const last = rows.at(-1)!;
          after = { name: last.name, id: last.id };
        }
      }, { isolationLevel: "repeatable read", accessMode: "read only" });
      res.end();
    } catch (error) {
      if (error instanceof RegistryExportAuthorizationError) {
        if (!res.headersSent) {
          res.status(403).json({ error: "Authorization denied", reasonCode: "NO_APPLICABLE_GRANT" });
        } else {
          res.destroy(error);
        }
        return;
      }
      throw error;
    }
  }

  async function create(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const parsed = (kind === "FACILITY" ? facilityInput : childInput).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const input = parsed.data as Record<string, unknown>;
    if (typeof input.organizationId === "string" && input.organizationId !== actor.organizationId) {
      res.status(403).json({ error: "Organization is outside active organization scope" });
      return;
    }
    const outcome = await database.transaction(async (tx: any) => {
      const parentSpec = parentFor(kind, input);
      let parentContext: Record<string, unknown> = {
        organizationId: actor.organizationId,
        scopeVerified: true,
      };
      if (kind !== "FACILITY" && !parentSpec) return { errorStatus: 400 as const, error: "A persisted ancestor is required" };
      if (parentSpec) {
        const parent = await resolveRegistryObject(tx, parentSpec.kind, parentSpec.id, actor.organizationId);
        if (!parent.found) {
          return { errorStatus: parent.reason === "ORGANIZATION_MISMATCH" ? 404 as const : 400 as const, error: "Ancestor not found" };
        }
        parentContext = { ...parent.value.verifiedContext };
      }
      if (kind === "ASSET" && typeof input.systemId === "string") {
        const system = await resolveRegistryObject(tx, "SYSTEM", input.systemId, actor.organizationId);
        if (!system.found || system.value.verifiedContext.spaceId !== parentContext.spaceId) {
          return { errorStatus: 400 as const, error: "systemId must belong to the requested space" };
        }
      }
      const id = randomUUID();
      const values = mutationValues(kind, input, id, actor.organizationId, {
        facilityId: parentContext.facilityId,
        buildingId: parentContext.buildingId,
        spaceId: parentContext.spaceId,
      });
      const decision = await authorize({
        database: tx,
        actorUserId: actor.user.id,
        organizationId: actor.organizationId,
        permission: `${kind}.CREATE`,
        resourceType: kind,
        resourceId: id,
        verifiedContext: {
          ...parentContext,
          ...values,
          resourceScopeId: id,
          scopeVerified: true,
        },
        requestId: String(req.id),
      });
      if (!decision.allowed) return { errorStatus: 403 as const, error: "Authorization denied", reasonCode: decision.reasonCode };
      const created = await insertRegistryRow(tx, kind, values);
      if (!created) return { errorStatus: 409 as const, error: "Resource was not created" };
      await tx.insert(authorizationAuditLogsTable).values({
        actorUserId: actor.user.id,
        organizationId: actor.organizationId,
        action: "CREATE",
        resource: kind,
        resourceId: created.id,
        decision: "ALLOW",
        reasonCode: "ALLOWED",
        requestId: String(req.id),
      });
      return { row: created };
    });
    if ("errorStatus" in outcome) {
      res.status(outcome.errorStatus ?? 500).json({
        error: outcome.error,
        ...("reasonCode" in outcome ? { reasonCode: outcome.reasonCode } : {}),
      });
      return;
    }
    const decorated = await decorateRow(
      database, kind, outcome.row, actor.user.id, actor.organizationId, String(req.id),
    );
    if (!decorated) {
      res.status(409).json({ error: "Resource changed concurrently" });
      return;
    }
    res.status(201).json(decorated);
  }

  async function importPortfolio(req: import("express").Request, res: import("express").Response) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const text = typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : null;
    if (text === null) {
      sendImportErrors(res, [{ row: 1, error: "Request body must be text/csv" }]);
      return;
    }
    if (Buffer.byteLength(text, "utf8") > PORTFOLIO_IMPORT_MAX_BYTES) {
      sendImportErrors(res, [{ row: 1, error: `CSV exceeds the ${PORTFOLIO_IMPORT_MAX_BYTES}-byte limit` }]);
      return;
    }
    try {
      const outcome = await database.transaction(async (tx: any) => {
        // Duplicate checks and writes must observe prior imports for this
        // organization. The transaction-scoped lock is acquired before any
        // validation reads and is released automatically on commit/rollback.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.organizationId}))`);
        return processPortfolioImport(tx, text, actor, String(req.id), true);
      });
      if ("validation" in outcome && outcome.validation) {
        sendImportErrors(res, outcome.validation.errors);
        return;
      }
      res.status(201).json({ imported: outcome.imported, importId: outcome.importId });
    } catch (error) {
      if (error instanceof PortfolioImportAuthorizationError) {
        res.status(403).json({
          error: "Authorization denied",
          reasonCode: error.reasonCode,
          row: error.row,
          kind: error.kind,
        });
        return;
      }
      throw error;
    }
  }

  async function processPortfolioImport(
    transaction: any,
    text: string,
    actor: { user: { id: string }; organizationId: string },
    requestId: string,
    commit: boolean,
  ) {
        const validation = await validatePortfolioImport(transaction, text, actor.organizationId);
        if (validation.errors.length) return { validation };
        const references = new Map<string, {
          id: string;
          kind: RegistryKind;
          context: Record<string, unknown>;
        }>();
        const importedFacilityIds = new Set<string>();
        let createdCount = 0;
        const summary: Record<RegistryKind, number> = {
          FACILITY: 0, BUILDING: 0, SPACE: 0, SYSTEM: 0, ASSET: 0,
        };
        const previewGroups = new Map<string, {
          name: string;
          clientRef: string;
          id: string | null;
          code: string | null;
          counts: { buildings: number; spaces: number; systems: number; assets: number };
          records: Array<{
            row: number;
            kind: Exclude<RegistryKind, "FACILITY">;
            name: string;
            clientRef: string;
            id: string | null;
            parentRef: string | null;
            systemRef: string | null;
            code: string | null;
            status: "ACTIVE" | "INACTIVE";
          }>;
        }>();
        for (const record of validation.records) {
          const parentKind = record.kind === "BUILDING" ? "FACILITY"
            : record.kind === "SPACE" ? "BUILDING"
              : record.kind === "SYSTEM" || record.kind === "ASSET" ? "SPACE" : undefined;
          let parentContext: Record<string, unknown> = {
            organizationId: actor.organizationId,
            resourceOrganizationId: actor.organizationId,
            scopeVerified: true,
          };
          if (parentKind && record.parentRef) {
            const inFileParent = references.get(`${parentKind}:${record.parentRef.toLowerCase()}`);
            if (inFileParent) {
              parentContext = inFileParent.context;
            } else {
              const parent = await resolveRegistryObject(transaction, parentKind, record.parentRef, actor.organizationId);
              if (!parent.found) throw new Error("Validated ancestor changed before import");
              parentContext = parent.value.verifiedContext;
            }
          }
          let systemId: string | null = null;
          if (record.kind === "ASSET" && record.systemRef) {
            const inFileSystem = references.get(`SYSTEM:${record.systemRef.toLowerCase()}`);
            if (inFileSystem) {
              systemId = inFileSystem.id;
              if (inFileSystem.context.spaceId !== parentContext.spaceId) {
                throw new Error("Validated system ancestry changed before import");
              }
            } else {
              const system = await resolveRegistryObject(transaction, "SYSTEM", record.systemRef, actor.organizationId);
              if (!system.found || system.value.verifiedContext.spaceId !== parentContext.spaceId) {
                throw new Error("Validated system ancestry changed before import");
              }
              systemId = system.value.row.id;
            }
          }
          const id = record.id ?? randomUUID();
          const values = mutationValues(record.kind, {
            name: record.name,
            code: record.code ?? null,
            description: record.description ?? null,
            status: record.status,
            ...(record.kind === "ASSET" ? { systemId } : {}),
          }, id, actor.organizationId, {
            facilityId: parentContext.facilityId ?? (record.kind === "FACILITY" ? id : undefined),
            buildingId: parentContext.buildingId,
            spaceId: parentContext.spaceId,
          });
          const verifiedContext: Record<string, unknown> = record.kind === "FACILITY"
            ? { organizationId: actor.organizationId, resourceOrganizationId: actor.organizationId, facilityId: id, resourceScopeId: id, scopeVerified: true }
            : {
              ...parentContext,
              ...values,
              resourceScopeId: id,
              scopeVerified: true,
              ...(record.kind === "BUILDING" ? { buildingId: id } : {}),
              ...(record.kind === "SPACE" ? { spaceId: id } : {}),
              ...(record.kind === "SYSTEM" ? { systemId: id } : {}),
              ...(record.kind === "ASSET" ? { assetId: id, ...(systemId ? { systemId } : {}) } : {}),
            };
          const decision = await authorize({
            database: transaction,
            actorUserId: actor.user.id,
            organizationId: actor.organizationId,
            permission: `${record.kind}.CREATE`,
            resourceType: record.kind,
            resourceId: id,
            verifiedContext,
            requestId,
            auditDecision: commit,
            allowImportedFacilityDescendantBootstrap:
              record.kind !== "FACILITY" &&
              typeof verifiedContext.facilityId === "string" &&
              importedFacilityIds.has(verifiedContext.facilityId),
          });
          if (!decision.allowed) {
            throw new PortfolioImportAuthorizationError(decision.reasonCode, record.kind, record.rowNumber);
          }
          const facilityId = String(verifiedContext.facilityId);
          if (!commit) {
            if (record.kind === "FACILITY") {
              previewGroups.set(facilityId, {
                name: record.name,
                clientRef: record.clientRef,
                id: record.id ?? null,
                code: record.code ?? null,
                counts: { buildings: 0, spaces: 0, systems: 0, assets: 0 },
                records: [],
              });
            } else {
              let group = previewGroups.get(facilityId);
              if (!group) {
                const facility = await resolveRegistryObject(transaction, "FACILITY", facilityId, actor.organizationId);
                if (!facility.found) throw new Error("Validated facility changed before preview");
                group = {
                  name: facility.value.row.name,
                  clientRef: facility.value.row.id,
                  id: facility.value.row.id,
                  code: facility.value.row.code ?? null,
                  counts: { buildings: 0, spaces: 0, systems: 0, assets: 0 },
                  records: [],
                };
                previewGroups.set(facilityId, group);
              }
              const countKey = `${record.kind.toLowerCase()}s` as keyof typeof group.counts;
              group.counts[countKey] += 1;
              group.records.push({
                row: record.rowNumber,
                kind: record.kind,
                name: record.name,
                clientRef: record.clientRef,
                id: record.id ?? null,
                parentRef: record.parentRef ?? null,
                systemRef: record.systemRef ?? null,
                code: record.code ?? null,
                status: record.status,
              });
            }
          }
          const created = commit ? await insertRegistryRow(transaction, record.kind, values) : { id };
          if (!created) throw new Error(`Failed to create ${record.kind} row`);
          if (commit) {
            await transaction.insert(authorizationAuditLogsTable).values({
              actorUserId: actor.user.id,
              organizationId: actor.organizationId,
              action: "CREATE",
              resource: record.kind,
              resourceId: created.id,
              decision: "ALLOW",
              reasonCode: "ALLOWED",
              requestId,
            });
          }
          references.set(`${record.kind}:${record.clientRef.toLowerCase()}`, {
            id: created.id,
            kind: record.kind,
            context: record.kind === "FACILITY"
              ? verifiedContext
              : { ...verifiedContext, [`${record.kind.toLowerCase()}Id`]: created.id },
          });
          if (record.kind === "FACILITY") importedFacilityIds.add(created.id);
          createdCount += 1;
          summary[record.kind] += 1;
        }
        if (!commit) {
          return {
            total: createdCount,
            facilities: summary.FACILITY,
            buildings: summary.BUILDING,
            spaces: summary.SPACE,
            systems: summary.SYSTEM,
            assets: summary.ASSET,
            facilityGroups: [...previewGroups.values()],
          };
        }
        const importId = randomUUID();
        await transaction.insert(authorizationAuditLogsTable).values({
          actorUserId: actor.user.id,
          organizationId: actor.organizationId,
          action: "IMPORT",
          resource: "FACILITY_PORTFOLIO_IMPORT",
          resourceId: importId,
          decision: "ALLOW",
          reasonCode: "ALLOWED",
          requestId,
          afterState: { rows: createdCount },
        });
        return { imported: createdCount, importId };
  }

  async function validatePortfolio(req: import("express").Request, res: import("express").Response) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const text = typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : null;
    if (text === null) {
      sendImportErrors(res, [{ row: 1, error: "Request body must be text/csv" }]);
      return;
    }
    if (Buffer.byteLength(text, "utf8") > PORTFOLIO_IMPORT_MAX_BYTES) {
      sendImportErrors(res, [{ row: 1, error: `CSV exceeds the ${PORTFOLIO_IMPORT_MAX_BYTES}-byte limit` }]);
      return;
    }
    try {
      const outcome = await processPortfolioImport(database, text, actor, String(req.id), false);
      if ("validation" in outcome && outcome.validation) {
        sendImportErrors(res, outcome.validation.errors);
        return;
      }
      res.json(outcome);
    } catch (error) {
      if (error instanceof PortfolioImportAuthorizationError) {
        res.status(403).json({
          error: "Authorization denied",
          reasonCode: error.reasonCode,
          row: error.row,
          kind: error.kind,
        });
        return;
      }
      throw error;
    }
  }

  async function detail(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const result = await authorizeRegistryObject({
      database, actorUserId: actor.user.id, organizationId: actor.organizationId, kind,
      action: "VIEW", id: String(req.params.id), requestId: String(req.id),
    });
    if (!result.resolved.found) {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
    if (!result.decision.allowed) {
      res.status(403).json({ error: "Authorization denied", reasonCode: result.decision.reasonCode });
      return;
    }
    res.json({
      ...result.resolved.value.row,
      capabilities: await registryCapabilities(
        database,
        kind,
        result.resolved,
        actor.user.id,
        actor.organizationId,
        String(req.id),
        result.decision,
      ),
    });
  }

  async function update(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const parsed = nameInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const id = String(req.params.id);
    const outcome = await database.transaction(async (tx: any) => {
      const result = await authorizeRegistryObject({
        database: tx, actorUserId: actor.user.id, organizationId: actor.organizationId, kind,
        action: "UPDATE", id, requestId: String(req.id),
      });
      if (!result.resolved.found) return { errorStatus: 404 as const, error: "Resource not found" };
      if (!result.decision.allowed) {
        return { errorStatus: 403 as const, error: "Authorization denied", reasonCode: result.decision.reasonCode };
      }
      const updated = await updateRegistryRow(tx, kind, id, actor.organizationId, parsed.data);
      if (!updated) return { errorStatus: 409 as const, error: "Resource changed concurrently" };
      await tx.insert(authorizationAuditLogsTable).values({
        actorUserId: actor.user.id,
        organizationId: actor.organizationId,
        action: "UPDATE",
        resource: kind,
        resourceId: updated.id,
        decision: "ALLOW",
        reasonCode: "ALLOWED",
        requestId: String(req.id),
      });
      return { row: updated };
    });
    if ("errorStatus" in outcome) {
      res.status(outcome.errorStatus ?? 500).json({
        error: outcome.error,
        ...("reasonCode" in outcome ? { reasonCode: outcome.reasonCode } : {}),
      });
      return;
    }
    const decorated = await decorateRow(
      database, kind, outcome.row, actor.user.id, actor.organizationId, String(req.id),
    );
    if (!decorated) {
      res.status(409).json({ error: "Resource changed concurrently" });
      return;
    }
    res.json(decorated);
  }

  async function remove(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const id = String(req.params.id);
    const outcome = await database.transaction(async (tx: any) => {
      const result = await authorizeRegistryObject({
        database: tx, actorUserId: actor.user.id, organizationId: actor.organizationId, kind,
        action: "MANAGE", id, requestId: String(req.id),
      });
      if (!result.resolved.found) return { errorStatus: 404 as const, error: "Resource not found" };
      if (!result.decision.allowed) {
        return { errorStatus: 403 as const, error: "Authorization denied", reasonCode: result.decision.reasonCode };
      }
      const deleted = await deleteRegistryRow(tx, kind, id, actor.organizationId);
      if (!deleted) return { errorStatus: 409 as const, error: "Resource changed concurrently" };
      await tx.insert(authorizationAuditLogsTable).values({
        actorUserId: actor.user.id,
        organizationId: actor.organizationId,
        action: "DELETE",
        resource: kind,
        resourceId: id,
        decision: "ALLOW",
        reasonCode: "ALLOWED",
        requestId: String(req.id),
      });
      return { deleted: true };
    });
    if ("errorStatus" in outcome) {
      res.status(outcome.errorStatus ?? 500).json({
        error: outcome.error,
        ...("reasonCode" in outcome ? { reasonCode: outcome.reasonCode } : {}),
      });
      return;
    }
    res.status(204).send();
  }

  router.get("/facilities/import-template", async (req, res) => {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    res.type("text/csv")
      .set("Content-Disposition", 'attachment; filename="facility-portfolio-template.csv"')
      .send(portfolioImportHeaderLine);
  });
  router.post("/facilities/import", (req, res) => importPortfolio(req, res));
  router.post("/facilities/import/validate", (req, res) => validatePortfolio(req, res));

  for (const kind of REGISTRY_KINDS) {
    const path = `/${plural[kind]}`;
    router.get(`${path}/search`, (req, res) => list(req, res, kind));
    router.get(`${path}/export`, (req, res) => exportRows(req, res, kind));
    router.get(path, (req, res) => list(req, res, kind));
    router.post(path, (req, res) => create(req, res, kind));
    router.get(`${path}/:id`, (req, res) => detail(req, res, kind));
    router.patch(`${path}/:id`, (req, res) => update(req, res, kind));
    router.put(`${path}/:id`, (req, res) => update(req, res, kind));
    router.delete(`${path}/:id`, (req, res) => remove(req, res, kind));
  }

  const nested: Array<[string, RegistryKind, RegistryKind]> = [
    ["facilities", "FACILITY", "BUILDING"],
    ["buildings", "BUILDING", "SPACE"],
    ["spaces", "SPACE", "SYSTEM"],
    ["spaces", "SPACE", "ASSET"],
    ["systems", "SYSTEM", "ASSET"],
  ];
  for (const [parentPath, parentKind, childKind] of nested) {
    router.post(`/${parentPath}/:parentId/${plural[childKind]}`, async (req, res): Promise<void> => {
      // create() performs the trusted active-organization and ancestor
      // resolution. This route only supplies the structural parent ID; it
      // never treats it as an authorization claim.
      let extra: Record<string, unknown> = {};
      if (parentKind === "SYSTEM") {
        const actor = await actorContext(req, res, resolveCurrentUser, database);
        if (!actor) return;
        const system = await resolveRegistryObject(database, "SYSTEM", String(req.params.parentId), actor.organizationId);
        if (!system.found) {
          res.status(404).json({ error: "Resource not found" });
          return;
        }
        extra = { spaceId: system.value.verifiedContext.spaceId };
      }
      req.body = { ...(req.body ?? {}), ...(parentKind === "FACILITY"
        ? { facilityId: req.params.parentId }
        : parentKind === "BUILDING"
          ? { buildingId: req.params.parentId }
          : parentKind === "SPACE"
            ? { spaceId: req.params.parentId }
            : { systemId: req.params.parentId, ...extra }) };
      await create(req, res, childKind);
    });
    router.get(`/${parentPath}/:parentId/${plural[childKind]}`, async (req, res): Promise<void> => {
      const actor = await actorContext(req, res, resolveCurrentUser, database);
      if (!actor) return;
      const parent = await authorizeRegistryObject({
        database, actorUserId: actor.user.id, organizationId: actor.organizationId,
        kind: parentKind, action: "VIEW", id: req.params.parentId, requestId: String(req.id),
      });
      if (!parent.resolved.found) {
        res.status(404).json({ error: "Resource not found" });
        return;
      }
      if (!parent.decision.allowed) {
        res.status(403).json({ error: "Authorization denied", reasonCode: parent.decision.reasonCode });
        return;
      }
      const page = parsePage(req.query.page, 1, 1_000_000);
      const limit = parsePage(req.query.limit, 50, 100);
      const cursor = parseRegistryCursor(req.query.cursor);
      if (cursor === null) {
        res.status(400).json({ error: "Invalid registry cursor" });
        return;
      }
      const result = await authorizedRows(
        database,
        childKind,
        actor.organizationId,
        actor.user.id,
        typeof req.query.q === "string" ? req.query.q : undefined,
        String(req.id),
        page,
        limit,
        { kind: parentKind as "FACILITY" | "BUILDING" | "SPACE" | "SYSTEM", id: req.params.parentId },
        cursor,
      );
      const collectionCapabilities = await collectionCreateCapability(
        database,
        childKind,
        actor.user.id,
        actor.organizationId,
        parent.resolved.value.verifiedContext,
        String(req.params.parentId),
        String(req.id),
      );
      res.json({
        items: result.rows,
        page,
        limit,
        total: result.total,
        nextCursor: result.nextCursor,
        collectionCapabilities,
      });
    });
  }
  return router;
}

const router = createFacilitiesRouter();
export default router;