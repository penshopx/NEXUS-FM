import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  membershipsTable,
  rolesTable,
  userRoleBindingsTable,
} from "@workspace/db";

export type AccessRevisionEvent = {
  userId: string;
  organizationId: string;
  reason: "MEMBERSHIP_CHANGED" | "ROLE_BINDING_CHANGED" | "ROLE_PERMISSIONS_CHANGED";
};

type Listener = (event: AccessRevisionEvent) => void;
const listeners = new Map<string, Set<Listener>>();

function listenerKey(userId: string, organizationId: string) {
  return `${userId}:${organizationId}`;
}

export function subscribeToAccessRevisions(
  userId: string,
  organizationId: string,
  listener: Listener,
) {
  const key = listenerKey(userId, organizationId);
  const subscribers = listeners.get(key) ?? new Set<Listener>();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(key);
  };
}

export function publishAccessRevision(event: AccessRevisionEvent) {
  for (const listener of listeners.get(listenerKey(event.userId, event.organizationId)) ?? []) {
    listener(event);
  }
}

export async function getAccessRevision(
  userId: string,
  organizationId: string,
  database = db,
) {
  const [membership] = await database.select({
    isActive: membershipsTable.isActive,
    role: membershipsTable.role,
    createdAt: membershipsTable.createdAt,
  }).from(membershipsTable).where(and(
    eq(membershipsTable.userId, userId),
    eq(membershipsTable.organizationId, organizationId),
  ));

  const bindings = await database.select({
    id: userRoleBindingsTable.id,
    version: userRoleBindingsTable.version,
    rolePolicyVersion: rolesTable.policyVersion,
  }).from(userRoleBindingsTable)
    .innerJoin(rolesTable, eq(userRoleBindingsTable.roleId, rolesTable.id))
    .where(and(
      eq(userRoleBindingsTable.userId, userId),
      eq(userRoleBindingsTable.organizationId, organizationId),
    ))
    .orderBy(asc(userRoleBindingsTable.id));

  const source = JSON.stringify({
    membership: membership
      ? [membership.isActive, membership.role, membership.createdAt.toISOString()]
      : null,
    bindings: bindings.map((binding) => [
      binding.id,
      binding.version,
      binding.rolePolicyVersion,
    ]),
  });

  return createHash("sha256").update(source).digest("base64url");
}