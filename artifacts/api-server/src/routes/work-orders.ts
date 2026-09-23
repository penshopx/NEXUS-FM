import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  CreateTeamWorkOrderBody,
  CreateTeamWorkOrderResponse,
  ExecuteVendorWorkOrderBody,
  ExecuteVendorWorkOrderResponse,
  GetTeamWorkOrderResponse,
  GetVendorWorkOrderResponse,
  ListTeamWorkOrdersResponse,
  ListVendorWorkOrdersResponse,
  SubmitVendorWorkOrderResponse,
  CompleteTeamWorkOrderResponse,
  UpdateTeamWorkOrderBody,
  UpdateTeamWorkOrderResponse,
} from "@workspace/api-zod";
import { authorizationAuditLogsTable, db, workOrdersTable } from "@workspace/db";
import { authorize, resolveTeamWorkScope, resolveVendorAssignmentTargetWorkScope, resolveVendorAssignmentWorkScope } from "../services/authorization";
import { currentUser as defaultCurrentUser } from "./foundation";
import { getActiveOrganizationId } from "./authorization";
import { createWorkOrderScopeGuard, type VerifiedWorkOrderScope } from "./work-order-scope";

type Kind = "team" | "vendor";
type Action = "CREATE" | "VIEW" | "UPDATE" | "CLOSE" | "EXECUTE" | "SUBMIT" | "ASSIGN";
const notFound = (res: Response) => res.status(404).json({ error: "Work order not found" });
const validId = (id: unknown): id is string => z.string().uuid().safeParse(id).success;
const scopeId = (scope: VerifiedWorkOrderScope, kind: Kind) =>
  kind === "team" ? scope.teamId! : scope.vendorAssignmentId!;
const scopeFilter = (organizationId: string, id: string, kind: Kind) =>
  and(eq(workOrdersTable.organizationId, organizationId),
    kind === "team" ? eq(workOrdersTable.teamId, id) : eq(workOrdersTable.vendorAssignmentId, id));

// The matrix intentionally does not give vendors CREATE, UPDATE or CLOSE.
// Vendors may EXECUTE an open assignment and SUBMIT it; only teams CLOSE it.
const actionFor = {
  team: { edit: "UPDATE", finish: "CLOSE" },
  vendor: { edit: "EXECUTE", finish: "SUBMIT" },
} as const;

export function createWorkOrdersRouter(
  database: typeof db = db,
  currentUser: typeof defaultCurrentUser = defaultCurrentUser,
): IRouter {
  const router: IRouter = Router();
  const actorId = async (req: Request) => (await currentUser(req))?.id;

  async function recheckScope(kind: Kind, scope: VerifiedWorkOrderScope, userId: string, tx: any) {
    return kind === "team"
      ? resolveTeamWorkScope(tx, scope.organizationId, scope.teamId!)
      : resolveVendorAssignmentWorkScope(tx, scope.organizationId, scope.vendorAssignmentId!, userId);
  }

  async function permitted(req: Request, kind: Kind, action: Action, resourceId?: string, tx?: any) {
    const scope = req.res!.locals.verifiedWorkOrderScope as VerifiedWorkOrderScope;
    const userId = await actorId(req);
    if (!userId) return false;
    const verified = tx ? await recheckScope(kind, scope, userId, tx) : { found: true, verifiedContext: scope };
    if (!verified.found) return false;
    return (await authorize({
      ...(tx ? { database: tx } : { auditDecision: false }),
      actorUserId: userId, organizationId: scope.organizationId,
      permission: `WORK_ORDER.${action}`, resourceType: "WORK_ORDER",
      resourceId, verifiedContext: verified.verifiedContext,
      requestId: String(req.id),
    })).allowed;
  }

  async function auditSuccess(tx: any, req: Request, id: string, action: Action) {
    const scope = req.res!.locals.verifiedWorkOrderScope as VerifiedWorkOrderScope;
    await tx.insert(authorizationAuditLogsTable).values({
      actorUserId: await actorId(req), organizationId: scope.organizationId,
      action, resource: "WORK_ORDER", resourceId: id,
      decision: "ALLOW", reasonCode: "ALLOWED", requestId: String(req.id),
    });
  }

  function mount(kind: Kind) {
    const base = kind === "team" ? "/work-orders/teams/:teamId" : "/work-orders/vendor-assignments/:vendorAssignmentId";
    const parameter = kind === "team" ? "teamId" : "vendorAssignmentId";
    const guard = createWorkOrderScopeGuard(kind === "team" ? "TEAM" : "VENDOR_ASSIGNMENT", parameter, {
      database, currentUser, getActiveOrganizationId,
    });
    router.use(base, guard);

    router.get(base, async (req, res): Promise<void> => {
      const scope = res.locals.verifiedWorkOrderScope as VerifiedWorkOrderScope;
      if (!await permitted(req, kind, "VIEW")) { notFound(res); return; }
      const rows = await database.select().from(workOrdersTable)
        .where(scopeFilter(scope.organizationId, scopeId(scope, kind), kind))
        .orderBy(desc(workOrdersTable.createdAt), desc(workOrdersTable.id)).limit(100);
      res.json((kind === "team" ? ListTeamWorkOrdersResponse : ListVendorWorkOrdersResponse).parse(rows));
    });

    if (kind === "team") {
      router.post(base, async (req, res): Promise<void> => {
        const body = CreateTeamWorkOrderBody.strict().safeParse(req.body);
        if (!body.success || !body.data.title.trim()) { res.status(400).json({ error: "Invalid work order" }); return; }
        const scope = res.locals.verifiedWorkOrderScope as VerifiedWorkOrderScope;
        const outcome = await database.transaction(async (tx) => {
          if (!await permitted(req, "team", "CREATE", undefined, tx)) return { error: 404 as const };
          const vendorId = body.data.vendorAssignmentId;
          if (vendorId) {
            if (!await permitted(req, "team", "ASSIGN", undefined, tx)) return { error: 404 as const };
            if (!(await resolveVendorAssignmentTargetWorkScope(tx as unknown as typeof db, scope.organizationId, vendorId)).found) {
              return { error: 404 as const };
            }
          }
          const [row] = await tx.insert(workOrdersTable).values({
            organizationId: scope.organizationId, teamId: scope.teamId!,
            vendorAssignmentId: vendorId ?? null, title: body.data.title.trim(),
            description: body.data.description ?? null, createdByUserId: (await actorId(req))!,
          }).returning();
          await auditSuccess(tx, req, row.id, "CREATE");
          return { row };
        });
        if (!outcome.row) { notFound(res); return; }
        res.status(201).json(CreateTeamWorkOrderResponse.parse(outcome.row));
      });
    }

    router.get(`${base}/:id`, async (req, res): Promise<void> => {
      const scope = res.locals.verifiedWorkOrderScope as VerifiedWorkOrderScope;
      if (!validId(req.params.id) || !await permitted(req, kind, "VIEW", req.params.id)) { notFound(res); return; }
      const [row] = await database.select().from(workOrdersTable).where(and(
        scopeFilter(scope.organizationId, scopeId(scope, kind), kind), eq(workOrdersTable.id, req.params.id),
      ));
      if (!row) { notFound(res); return; }
      res.json((kind === "team" ? GetTeamWorkOrderResponse : GetVendorWorkOrderResponse).parse(row));
    });

    async function mutate(req: Request, res: Response, finish: boolean) {
      if (!validId(req.params.id)) { notFound(res); return; }
      const body = finish ? null : (kind === "team" ? UpdateTeamWorkOrderBody : ExecuteVendorWorkOrderBody).strict().safeParse(req.body);
      if (body && (!body.success || (kind === "team" && ("title" in body.data && typeof body.data.title === "string" && !body.data.title.trim())) ||
        (kind === "team" && Object.keys(body.data).length === 0))) {
        res.status(400).json({ error: "Invalid work order update" }); return;
      }
      const scope = res.locals.verifiedWorkOrderScope as VerifiedWorkOrderScope;
      const action = finish ? actionFor[kind].finish : actionFor[kind].edit;
      const outcome = await database.transaction(async (tx) => {
        // Re-resolve the active directory scope and lock authorization state before touching the row.
        if (!await permitted(req, kind, action, req.params.id as string, tx)) return { error: 404 as const };
        const [row] = await tx.select().from(workOrdersTable).where(and(
          scopeFilter(scope.organizationId, scopeId(scope, kind), kind), eq(workOrdersTable.id, req.params.id as string),
        )).for("update");
        if (!row) return { error: 404 as const };
        if (row.status === "COMPLETED" || (kind === "vendor" && row.status === "SUBMITTED")) return { error: 409 as const };
        if (finish && kind === "vendor" && row.status !== "IN_PROGRESS") return { error: 409 as const };
        if (finish && kind === "team" && row.vendorAssignmentId && row.status !== "SUBMITTED") return { error: 409 as const };
        const changes = finish
          ? kind === "team"
            ? { status: "COMPLETED", completedAt: new Date(), updatedAt: new Date() }
            : { status: "SUBMITTED", updatedAt: new Date() }
          : kind === "vendor"
            ? { description: (body!.data as { description: string | null }).description, status: "IN_PROGRESS", updatedAt: new Date() }
            : { ...body!.data, title: "title" in body!.data && body!.data.title
              ? body!.data.title.trim() : row.title, updatedAt: new Date() };
        const [updated] = await tx.update(workOrdersTable).set(changes).where(eq(workOrdersTable.id, row.id)).returning();
        await auditSuccess(tx, req, row.id, action);
        return { row: updated };
      });
      if (!outcome.row) {
        if (outcome.error === 409) res.status(409).json({ error: "Work order cannot be changed in its current state" });
        else notFound(res);
        return;
      }
      const schema = finish
        ? kind === "team" ? CompleteTeamWorkOrderResponse : SubmitVendorWorkOrderResponse
        : kind === "team" ? UpdateTeamWorkOrderResponse : ExecuteVendorWorkOrderResponse;
      res.json(schema.parse(outcome.row));
    }
    router.patch(`${base}/:id`, (req, res) => mutate(req, res, false));
    router.post(`${base}/:id/${kind === "team" ? "complete" : "submit"}`, (req, res) => mutate(req, res, true));
  }

  mount("team");
  mount("vendor");
  return router;
}

export default createWorkOrdersRouter();