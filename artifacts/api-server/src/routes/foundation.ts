import { Router, type IRouter, type Request } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  GetFoundationSummaryResponse,
  GetSessionResponse,
  ListOrganizationsResponse,
  SelectOrganizationBody,
  SelectOrganizationResponse,
} from "@workspace/api-zod";
import {
  ensureFoundationUser,
  getAppSession,
  getSummary,
  listMemberships,
  selectOrganization,
} from "../services/foundation";

const router: IRouter = Router();

async function identityFromRequest(req: Request) {
  const auth = getAuth(req);
  const claimedUserId = auth.sessionClaims?.userId;
  const externalAuthId =
    typeof claimedUserId === "string" ? claimedUserId : auth.userId;
  if (!externalAuthId) return null;
  const claims = auth.sessionClaims as Record<string, unknown> | null;
  const clerkUser = await clerkClient.users.getUser(externalAuthId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    (typeof claims?.email === "string" ? claims.email : null);
  if (!email) {
    throw new Error("Authenticated Clerk user has no primary email address");
  }
  const displayName =
    clerkUser.fullName ??
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ??
    "NEXUS-FM User";
  return { externalAuthId, email, displayName };
}

async function currentUser(req: Request) {
  const identity = await identityFromRequest(req);
  return identity ? ensureFoundationUser(identity) : null;
}

router.get("/session", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json(GetSessionResponse.parse(await getAppSession(user)));
});

router.get("/organizations", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json(ListOrganizationsResponse.parse(await listMemberships(user.id)));
});

router.put("/session/organization", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const input = SelectOrganizationBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: input.error.message });
    return;
  }
  const session = await selectOrganization(user, input.data.organizationId);
  if (!session) {
    res.status(403).json({ error: "Organization access denied" });
    return;
  }
  res.json(SelectOrganizationResponse.parse(session));
});

router.get("/foundation/summary", async (req, res): Promise<void> => {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const summary = await getSummary(user);
  if (!summary) {
    res.status(403).json({ error: "Active organization context required" });
    return;
  }
  res.json(GetFoundationSummaryResponse.parse(summary));
});

export default router;