import { and, eq, sql } from "drizzle-orm";
import {
  auditEventsTable,
  canonicalRoleValues,
  db,
  membershipsTable,
  organizationsTable,
  userContextsTable,
  usersTable,
} from "@workspace/db";

type Identity = { externalAuthId: string; displayName: string; email: string };

export async function ensureFoundationUser(identity: Identity) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(usersTable).where(eq(usersTable.externalAuthId, identity.externalAuthId));
    if (existing) {
      if (existing.displayName !== identity.displayName || existing.email !== identity.email) {
        const [updated] = await tx.update(usersTable).set({
          displayName: identity.displayName,
          email: identity.email,
        }).where(eq(usersTable.id, existing.id)).returning();
        return updated;
      }
      return existing;
    }

    const [user] = await tx.insert(usersTable).values(identity).returning();
    const [organization] = await tx.insert(organizationsTable).values({
      name: `${identity.displayName}'s Organization`,
      slug: `org-${user.id.slice(0, 8)}`,
    }).returning();
    await tx.insert(membershipsTable).values({
      userId: user.id,
      organizationId: organization.id,
      role: "FACILITY_MANAGER",
    });
    await tx.insert(userContextsTable).values({
      userId: user.id,
      activeOrganizationId: organization.id,
    });
    await tx.insert(auditEventsTable).values({
      actorUserId: user.id,
      organizationId: organization.id,
      action: "FOUNDATION.ORGANIZATION_CREATED",
      targetType: "organization",
      targetId: organization.id,
    });
    return user;
  });
}

export async function listMemberships(userId: string) {
  return db.select({
    organization: {
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
    },
    role: membershipsTable.role,
  }).from(membershipsTable)
    .innerJoin(organizationsTable, eq(membershipsTable.organizationId, organizationsTable.id))
    .where(eq(membershipsTable.userId, userId));
}

export async function getAppSession(user: typeof usersTable.$inferSelect) {
  const memberships = await listMemberships(user.id);
  const [context] = await db.select().from(userContextsTable).where(eq(userContextsTable.userId, user.id));
  return {
    user: {
      id: user.id,
      externalAuthId: user.externalAuthId,
      displayName: user.displayName,
      email: user.email,
    },
    activeOrganization: memberships.find((membership) =>
      membership.organization.id === context?.activeOrganizationId) ?? null,
    memberships,
  };
}

export async function selectOrganization(user: typeof usersTable.$inferSelect, organizationId: string) {
  const [membership] = await db.select().from(membershipsTable).where(and(
    eq(membershipsTable.userId, user.id),
    eq(membershipsTable.organizationId, organizationId),
  ));
  if (!membership) return null;
  await db.transaction(async (tx) => {
    await tx.insert(userContextsTable).values({
      userId: user.id,
      activeOrganizationId: organizationId,
    }).onConflictDoUpdate({
      target: userContextsTable.userId,
      set: { activeOrganizationId: organizationId },
    });
    await tx.insert(auditEventsTable).values({
      actorUserId: user.id,
      organizationId,
      action: "FOUNDATION.ORGANIZATION_CONTEXT_SELECTED",
      targetType: "organization",
      targetId: organizationId,
    });
  });
  return getAppSession(user);
}

export async function getSummary(user: typeof usersTable.$inferSelect) {
  const session = await getAppSession(user);
  if (!session.activeOrganization) return null;
  const [count] = await db.select({ value: sql<number>`count(*)::int` })
    .from(membershipsTable)
    .where(eq(membershipsTable.organizationId, session.activeOrganization.organization.id));
  return {
    organization: session.activeOrganization.organization,
    currentRole: session.activeOrganization.role,
    memberCount: count?.value ?? 0,
    canonicalRoleCount: canonicalRoleValues.length,
    authenticationStatus: "READY" as const,
    organizationContextStatus: "READY" as const,
    authorizationStatus: "MINIMUM_RBAC" as const,
    auditStatus: "ACTIVE" as const,
  };
}