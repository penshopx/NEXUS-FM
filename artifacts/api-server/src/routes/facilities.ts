import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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
  csvForRows,
  listRegistryRows,
  REGISTRY_KINDS,
  resolveRegistryObject,
  type RegistryKind,
  type RegistryRow,
} from "../services/facilities";
import { getActiveOrganizationId } from "./authorization";

type Database = typeof db;
type CurrentUser = typeof defaultCurrentUser;

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

function resourceTypeFor(kind: RegistryKind) {
  return kind;
}

async function authorizedRows(
  database: Database,
  kind: RegistryKind,
  organizationId: string,
  actorUserId: string,
  query: string | undefined,
  requestId: string,
) {
  const candidates = await listRegistryRows(database, kind, organizationId, query);
  const rows: RegistryRow[] = [];
  for (const candidate of candidates) {
    const resolved = await resolveRegistryObject(database, kind, candidate.id, organizationId);
    if (!resolved.found) continue;
    const decision = await authorize({
      actorUserId,
      organizationId,
      permission: `${resourceTypeFor(kind)}.VIEW`,
      resourceType: resourceTypeFor(kind),
      resourceId: candidate.id,
      verifiedContext: resolved.value.verifiedContext,
      requestId,
    });
    if (decision.allowed) rows.push(candidate);
  }
  return rows;
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

export function createFacilitiesRouter(dependencies: FacilitiesRouteDependencies = {}) {
  const router: IRouter = Router();
  const database = dependencies.db ?? db;
  const resolveCurrentUser = dependencies.currentUser ?? defaultCurrentUser;

  async function list(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const all = await authorizedRows(database, kind, actor.organizationId, actor.user.id,
      typeof req.query.q === "string" ? req.query.q : undefined, String(req.id));
    const page = parsePage(req.query.page, 1, 1_000_000);
    const limit = parsePage(req.query.limit, 50, 100);
    res.json({ items: all.slice((page - 1) * limit, page * limit), page, limit, total: all.length });
  }

  async function exportRows(req: import("express").Request, res: import("express").Response, kind: RegistryKind) {
    const actor = await actorContext(req, res, resolveCurrentUser, database);
    if (!actor) return;
    const rows = await authorizedRows(database, kind, actor.organizationId, actor.user.id,
      typeof req.query.q === "string" ? req.query.q : undefined, String(req.id));
    res.type("text/csv").set("Content-Disposition", `attachment; filename="${plural[kind]}.csv"`).send(csvForRows(rows));
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
    res.status(201).json(outcome.row);
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
    res.json(result.resolved.value.row);
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
    res.json(outcome.row);
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
      const rows = await authorizedRows(database, childKind, actor.organizationId, actor.user.id, undefined, String(req.id));
      const key = parentKind === "FACILITY" ? "facilityId" : parentKind === "BUILDING" ? "buildingId" : parentKind === "SPACE" ? "spaceId" : "systemId";
      const filtered = rows.filter((row) => (row as unknown as Record<string, unknown>)[key] === req.params.parentId);
      res.json({ items: filtered, page: 1, limit: filtered.length, total: filtered.length });
    });
  }
  return router;
}

const router = createFacilitiesRouter();
export default router;