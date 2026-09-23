import type { NextFunction, Request, RequestHandler, Response } from "express";
import { db } from "@workspace/db";
import {
  resolveTeamWorkScope,
  resolveVendorAssignmentWorkScope,
} from "../services/authorization";
import { currentUser as defaultCurrentUser } from "./foundation";
import { getActiveOrganizationId as defaultGetActiveOrganizationId } from "./authorization";
import { z } from "zod";

type WorkOrderScopeKind = "TEAM" | "VENDOR_ASSIGNMENT";

export type WorkOrderScopeGuardDependencies = {
  database?: typeof db;
  currentUser?: typeof defaultCurrentUser;
  getActiveOrganizationId?: typeof defaultGetActiveOrganizationId;
  resolveTeam?: typeof resolveTeamWorkScope;
  resolveVendorAssignment?: typeof resolveVendorAssignmentWorkScope;
};

export type VerifiedWorkOrderScope = {
  organizationId: string;
  scopeVerified: true;
  teamId?: string;
  vendorAssignmentId?: string;
  vendorUserId?: string;
};

/**
 * Resolves work-order scope from the directory before a resource handler runs.
 * The guard deliberately selects only the route ID; no request-provided context
 * object or scopeVerified value is copied into the authorization context.
 */
export function createWorkOrderScopeGuard(
  kind: WorkOrderScopeKind,
  routeIdParameter: string,
  dependencies: WorkOrderScopeGuardDependencies = {},
): RequestHandler {
  const database = dependencies.database ?? db;
  const currentUser = dependencies.currentUser ?? defaultCurrentUser;
  const getActiveOrganizationId =
    dependencies.getActiveOrganizationId ?? defaultGetActiveOrganizationId;
  const resolveTeam = dependencies.resolveTeam ?? resolveTeamWorkScope;
  const resolveVendorAssignment =
    dependencies.resolveVendorAssignment ?? resolveVendorAssignmentWorkScope;

  return async (req: Request, res: Response, next: NextFunction) => {
    const actor = await currentUser(req);
    const actorUserId = actor?.id;
    const targetId = req.params[routeIdParameter];

    if (!actorUserId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const organizationId = await getActiveOrganizationId(actorUserId, database);
    if (!organizationId) {
      res.status(403).json({ error: "Active organization required" });
      return;
    }
    if (typeof targetId !== "string" || !z.string().uuid().safeParse(targetId).success) {
      res.status(404).json({ error: "Work-order scope not found" });
      return;
    }

    const resolution = kind === "TEAM"
      ? await resolveTeam(database, organizationId, targetId)
      : await resolveVendorAssignment(database, organizationId, targetId, actorUserId);

    if (!resolution.found) {
      res.status(404).json({ error: "Work-order scope not found" });
      return;
    }

    res.locals.verifiedWorkOrderScope =
      resolution.verifiedContext as VerifiedWorkOrderScope;
    next();
  };
}