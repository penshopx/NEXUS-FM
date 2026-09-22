import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  membershipsTable,
  pool,
  rolesTable,
  userRoleBindingsTable,
} from "@workspace/db";

export type AccessRevisionEvent = {
  userId: string;
  organizationId: string;
  reason: "MEMBERSHIP_CHANGED" | "ROLE_BINDING_CHANGED" | "ROLE_PERMISSIONS_CHANGED";
};

type Listener = (event: AccessRevisionEvent) => void;
type Notification = { channel: string; payload?: string };
type NotificationClient = {
  query(query: string): Promise<unknown>;
  on(event: "notification", listener: (notification: Notification) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  removeAllListeners(event: "notification" | "error"): unknown;
  release(): void;
};
type NotificationPool = {
  connect(): Promise<NotificationClient>;
  query(query: string, values?: unknown[]): Promise<unknown>;
};

const ACCESS_REVISION_CHANNEL = "nexus_access_revisions";
const reconnectDelayMs = 1_000;

function listenerKey(userId: string, organizationId: string) {
  return `${userId}:${organizationId}`;
}

function isAccessRevisionEvent(value: unknown): value is AccessRevisionEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.userId === "string" &&
    typeof event.organizationId === "string" &&
    (
      event.reason === "MEMBERSHIP_CHANGED" ||
      event.reason === "ROLE_BINDING_CHANGED" ||
      event.reason === "ROLE_PERMISSIONS_CHANGED"
    );
}

export function createAccessRevisionBus(
  notificationPool: NotificationPool,
  options: {
    onError?: (error: Error) => void;
    reconnectDelayMs?: number;
  } = {},
) {
  const listeners = new Map<string, Set<Listener>>();
  let client: NotificationClient | undefined;
  let connecting: Promise<void> | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let closed = false;

  const reportError = options.onError ?? ((error: Error) => {
    process.emitWarning(error, { type: "AccessRevisionNotificationWarning" });
  });

  function dispatch(event: AccessRevisionEvent) {
    for (const listener of listeners.get(listenerKey(event.userId, event.organizationId)) ?? []) {
      listener(event);
    }
  }

  function scheduleReconnect() {
    if (closed || listeners.size === 0 || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void ensureListening().catch(reportError);
    }, options.reconnectDelayMs ?? reconnectDelayMs);
    reconnectTimer.unref();
  }

  async function ensureListening() {
    if (client || closed || listeners.size === 0) return;
    if (connecting) return connecting;
    connecting = (async () => {
      const nextClient = await notificationPool.connect();
      nextClient.on("notification", (notification) => {
        if (notification.channel !== ACCESS_REVISION_CHANNEL || !notification.payload) return;
        try {
          const event: unknown = JSON.parse(notification.payload);
          if (isAccessRevisionEvent(event)) dispatch(event);
        } catch (error) {
          reportError(error instanceof Error ? error : new Error(String(error)));
        }
      });
      nextClient.on("error", (error) => {
        if (client !== nextClient) return;
        client = undefined;
        nextClient.removeAllListeners("notification");
        nextClient.removeAllListeners("error");
        nextClient.release();
        reportError(error);
        scheduleReconnect();
      });
      try {
        await nextClient.query(`LISTEN ${ACCESS_REVISION_CHANNEL}`);
        if (closed || listeners.size === 0) {
          nextClient.removeAllListeners("notification");
          nextClient.removeAllListeners("error");
          nextClient.release();
          return;
        }
        client = nextClient;
      } catch (error) {
        nextClient.removeAllListeners("notification");
        nextClient.removeAllListeners("error");
        nextClient.release();
        scheduleReconnect();
        throw error;
      }
    })().finally(() => {
      connecting = undefined;
    });
    return connecting;
  }

  return {
    async subscribe(userId: string, organizationId: string, listener: Listener) {
      if (closed) throw new Error("Access revision bus is closed");
      const key = listenerKey(userId, organizationId);
      const subscribers = listeners.get(key) ?? new Set<Listener>();
      subscribers.add(listener);
      listeners.set(key, subscribers);
      try {
        await ensureListening();
      } catch (error) {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(key);
        throw error;
      }
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(key);
      };
    },
    async publish(event: AccessRevisionEvent) {
      await notificationPool.query("SELECT pg_notify($1, $2)", [
        ACCESS_REVISION_CHANNEL,
        JSON.stringify(event),
      ]);
    },
    async close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      await connecting?.catch(() => undefined);
      if (client) {
        await client.query(`UNLISTEN ${ACCESS_REVISION_CHANNEL}`).catch(() => undefined);
        client.removeAllListeners("notification");
        client.removeAllListeners("error");
        client.release();
        client = undefined;
      }
      listeners.clear();
    },
  };
}

const accessRevisionBus = createAccessRevisionBus(pool);

export const subscribeToAccessRevisions = accessRevisionBus.subscribe;
export const publishAccessRevision = accessRevisionBus.publish;

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