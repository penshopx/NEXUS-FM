import { clerkClient, getAuth } from "@clerk/express";
import { Router, type IRouter, type Request } from "express";
import {
  CheckAuthorizationBody,
  CheckAuthorizationResponse,
  CreateRoleBindingBody,
  CreateRoleBindingResponse,
  GetMyAuthorizationResponse,
  ListPermissionCatalogResponse,
  ListRoleCapabilitiesResponse,
  ListUserRoleBindingsParams,
  ListUserRoleBindingsResponse,
  RevokeRoleBindingParams,
  RevokeRoleBindingBody,
  RevokeRoleBindingResponse,
  UpdateRoleBindingBody,
  UpdateRoleBindingParams,
  UpdateRoleBindingResponse,
} from "@workspace/api-zod";
import { ensureFoundationUser, getAppSession } from "../services/foundation";
import {
  auditDecision,
  authorize,
  createBinding,
  getAuthorizationProfile,
  listBindings,
  listPermissionCatalog,
  listRoleCapabilities,
  revokeBinding,
  updateBinding,
} from "../services/authorization";

const router: IRouter = Router();

async function actor(req: Request) {
  const auth = getAuth(req);
  const claimedUserId = auth.sessionClaims?.userId;
  const externalAuthId = typeof claimedUserId === "string" ? claimedUserId : auth.userId;
  if (!externalAuthId) return null;
  const clerkUser = await clerkClient.users.getUser(externalAuthId);
  const email = clerkUser.primaryEmailAddress?.emailAddress;
  if (!email) throw new Error("Authenticated Clerk user has no primary email address");
  const displayName = clerkUser.fullName ||
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    "NEXUS-FM User";
  const user = await ensureFoundationUser({ externalAuthId, email, displayName });
  const session = await getAppSession(user);
  return { user, organizationId: session.activeOrganization?.organization.id ?? null };
}

async function requireAdmin(req: Request) {
  const current = await actor(req);
  if (!current?.organizationId) return { current, decision: null };
  const decision = await authorize({
    actorUserId: current.user.id,
    organizationId: current.organizationId,
    permission: "ROLE.MANAGE",
  });
  return { current, decision };
}

router.get("/authorization/me", async (req, res): Promise<void> => {
  const current = await actor(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!current.organizationId) {
    res.status(403).json({ error: "Active organization context required" });
    return;
  }
  res.json(GetMyAuthorizationResponse.parse(
    await getAuthorizationProfile(current.user.id, current.organizationId),
  ));
});

router.post("/authorization/check", async (req, res): Promise<void> => {
  const current = await actor(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = CheckAuthorizationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!current.organizationId) {
    res.json(CheckAuthorizationResponse.parse({
      allowed: false,
      reasonCode: "ORGANIZATION_MISMATCH",
      permission: parsed.data.permission,
      scopeType: null,
    }));
    return;
  }
  const decision = await authorize({
    actorUserId: current.user.id,
    organizationId: current.organizationId,
    permission: parsed.data.permission,
    resourceId: parsed.data.resourceId,
  });
  if (!decision.allowed) {
    await auditDecision({
      actorUserId: current.user.id,
      organizationId: current.organizationId,
      permission: parsed.data.permission,
      resourceId: parsed.data.resourceId,
      decision,
    });
  }
  res.json(CheckAuthorizationResponse.parse(decision));
});

router.get("/authorization/permissions", async (req, res): Promise<void> => {
  const { current, decision } = await requireAdmin(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!decision?.allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(ListPermissionCatalogResponse.parse(await listPermissionCatalog()));
});

router.get("/authorization/roles", async (req, res): Promise<void> => {
  const { current, decision } = await requireAdmin(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!decision?.allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(ListRoleCapabilitiesResponse.parse(await listRoleCapabilities()));
});

router.get("/users/:userId/role-bindings", async (req, res): Promise<void> => {
  const params = ListUserRoleBindingsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { current, decision } = await requireAdmin(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!current.organizationId || !decision?.allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(ListUserRoleBindingsResponse.parse(
    await listBindings(params.data.userId, current.organizationId),
  ));
});

router.post("/admin/role-bindings", async (req, res): Promise<void> => {
  const parsed = CreateRoleBindingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { current, decision } = await requireAdmin(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!current.organizationId || !decision?.allowed ||
      parsed.data.organizationId !== current.organizationId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const binding = await createBinding({
      actorUserId: current.user.id,
      ...parsed.data,
    });
    res.status(201).json(CreateRoleBindingResponse.parse(binding));
  } catch (error) {
    req.log.warn({ reason: error instanceof Error ? error.message : "UNKNOWN" }, "Role binding rejected");
    res.status(400).json({ error: "Invalid role binding" });
  }
});

router.patch("/admin/role-bindings/:bindingId", async (req, res): Promise<void> => {
  const params = UpdateRoleBindingParams.safeParse(req.params);
  const body = UpdateRoleBindingBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid role binding update" });
    return;
  }
  const { current, decision } = await requireAdmin(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!current.organizationId || !decision?.allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const binding = await updateBinding({
      actorUserId: current.user.id,
      organizationId: current.organizationId,
      bindingId: params.data.bindingId,
      ...body.data,
    });
    if (!binding) {
      res.status(404).json({ error: "Role binding not found" });
      return;
    }
    res.json(UpdateRoleBindingResponse.parse(binding));
  } catch {
    res.status(400).json({ error: "Invalid role binding update" });
  }
});

router.delete("/admin/role-bindings/:bindingId", async (req, res): Promise<void> => {
  const params = RevokeRoleBindingParams.safeParse(req.params);
  const body = RevokeRoleBindingBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid role binding revocation" });
    return;
  }
  const { current, decision } = await requireAdmin(req);
  if (!current) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!current.organizationId || !decision?.allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const binding = await revokeBinding({
      actorUserId: current.user.id,
      organizationId: current.organizationId,
      bindingId: params.data.bindingId,
      reason: body.data.reason,
    });
    if (!binding) {
      res.status(404).json({ error: "Role binding not found" });
      return;
    }
    res.json(RevokeRoleBindingResponse.parse(binding));
  } catch {
    res.status(403).json({ error: "Forbidden" });
  }
});

export default router;