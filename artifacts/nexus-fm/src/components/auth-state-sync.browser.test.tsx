import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({
  revision: 'revision-1',
  session: {
    activeOrganization: {
      organization: { id: 'org-1', name: 'Nexus Operations' },
    },
  } as { activeOrganization: { organization: { id: string; name: string } } | null },
  permissions: {
    organizationId: 'org-1',
    permissions: [{ code: 'ROLE.MANAGE', effect: 'ALLOW', scopeType: 'ORGANIZATION' }],
  },
  scope: [],
  sessionGate: null as Promise<void> | null,
  sessionResponses: [] as Promise<{
    activeOrganization: { organization: { id: string; name: string } } | null;
  }>[],
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ userId: 'affected-user', isLoaded: true }),
}));

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>(
    '@workspace/api-client-react',
  );
  return {
    ...actual,
    getGetSessionQueryOptions: () => ({
      queryKey: actual.getGetSessionQueryKey(),
      queryFn: async () => {
        await server.sessionGate;
        return server.session;
      },
    }),
    getGetMyAccessRevisionQueryOptions: () => ({
      queryKey: actual.getGetMyAccessRevisionQueryKey(),
      queryFn: async () => ({ organizationId: 'org-1', revision: server.revision }),
    }),
    getGetMyPermissionsQueryOptions: () => ({
      queryKey: actual.getGetMyPermissionsQueryKey(),
      queryFn: async () => server.permissions,
    }),
    getGetMyScopeQueryOptions: () => ({
      queryKey: actual.getGetMyScopeQueryKey(),
      queryFn: async () => server.scope,
    }),
  };
});


import {
  getGetMyPermissionsQueryOptions,
  getGetSessionQueryOptions,
} from '@workspace/api-client-react';
import { AuthStateSync } from './auth-state-sync';

type EventSourceListener = (event: Event) => void;

class FakeEventSource {
  static latest: FakeEventSource | null = null;
  private listeners = new Map<string, Set<EventSourceListener>>();

  constructor() {
    FakeEventSource.latest = this;
  }

  addEventListener(type: string, listener: EventSourceListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventSourceListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type));
    }
  }

  close() {}
}

function AffectedSession() {
  const session = useQuery(getGetSessionQueryOptions());
  const permissions = useQuery(getGetMyPermissionsQueryOptions());
  const canManageRoles = permissions.data?.permissions.some(
    (permission) => permission.code === 'ROLE.MANAGE' && permission.effect === 'ALLOW',
  );

  if (!session.data?.activeOrganization) {
    return <p>No active organization membership</p>;
  }

  return canManageRoles
    ? <button type="button">Manage role bindings</button>
    : <p>Role management access revoked</p>;
}

function renderAffectedSession() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const fetchQuery = client.fetchQuery.bind(client);
  vi.spyOn(client, 'fetchQuery').mockImplementation(((options) => {
    if (
      JSON.stringify(options.queryKey) === JSON.stringify(getGetSessionQueryOptions().queryKey)
    ) {
      const response = server.sessionResponses.shift();
      if (response) return response;
    }
    return fetchQuery(options);
  }) as typeof client.fetchQuery);
  client.setQueryData(getGetSessionQueryOptions().queryKey, server.session);
  client.setQueryData(getGetMyPermissionsQueryOptions().queryKey, server.permissions);

  render(
    <QueryClientProvider client={client}>
      <AuthStateSync>
        <AffectedSession />
      </AuthStateSync>
    </QueryClientProvider>,
  );
  return client;
}

function holdSessionRefresh() {
  let release!: () => void;
  server.sessionGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => {
    server.sessionGate = null;
    release();
  };
}

function queueSessionRefresh(
  session: { activeOrganization: { organization: { id: string; name: string } } | null },
) {
  let release!: () => void;
  const response = new Promise<typeof session>((resolve) => {
    release = () => resolve(session);
  });
  server.sessionResponses.push(response);
  return release;
}

describe('revoked-session browser synchronization', () => {
  beforeEach(() => {
    server.revision = 'revision-1';
    server.session = {
      activeOrganization: {
        organization: { id: 'org-1', name: 'Nexus Operations' },
      },
    };
    server.permissions = {
      organizationId: 'org-1',
      permissions: [{ code: 'ROLE.MANAGE', effect: 'ALLOW', scopeType: 'ORGANIZATION' }],
    };
    server.scope = [];
    server.sessionGate = null;
    server.sessionResponses = [];
    FakeEventSource.latest = null;
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('blocks stale controls immediately when another session suspends the active role binding', async () => {
    renderAffectedSession();

    expect(await screen.findByRole('button', { name: 'Manage role bindings' })).toBeVisible();
    await waitFor(() => expect(FakeEventSource.latest).not.toBeNull());

    const releaseSession = holdSessionRefresh();
    server.revision = 'revision-2';
    server.permissions = { organizationId: 'org-1', permissions: [] };

    act(() => FakeEventSource.latest?.emit('access-revision'));

    expect(screen.getByTestId('organization-context-sync')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage role bindings' })).not.toBeInTheDocument();

    await act(async () => releaseSession());

    expect(await screen.findByText('Role management access revoked')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage role bindings' })).not.toBeInTheDocument();
  });

  it('recovers a missed membership revocation when the disconnected session regains focus', async () => {
    renderAffectedSession();

    expect(await screen.findByRole('button', { name: 'Manage role bindings' })).toBeVisible();
    await waitFor(() => expect(FakeEventSource.latest).not.toBeNull());

    const releaseSession = holdSessionRefresh();
    server.revision = 'revision-2';
    server.session = { activeOrganization: null };
    server.permissions = { organizationId: 'org-1', permissions: [] };

    act(() => window.dispatchEvent(new Event('focus')));

    expect(screen.getByTestId('organization-context-sync')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage role bindings' })).not.toBeInTheDocument();

    await act(async () => releaseSession());

    expect(await screen.findByText('No active organization membership')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage role bindings' })).not.toBeInTheDocument();
  });

  it('keeps the newest permissions when an older access refresh resolves last', async () => {
    const client = renderAffectedSession();

    expect(await screen.findByRole('button', { name: 'Manage role bindings' })).toBeVisible();
    await waitFor(() => expect(FakeEventSource.latest).not.toBeNull());

    const releaseOlderSession = queueSessionRefresh(server.session);
    server.revision = 'revision-2';
    act(() => FakeEventSource.latest?.emit('access-revision'));
    await waitFor(() => expect(server.sessionResponses).toHaveLength(0));

    const releaseNewestSession = queueSessionRefresh({ activeOrganization: null });
    server.revision = 'revision-3';
    server.permissions = { organizationId: 'org-1', permissions: [] };
    act(() => FakeEventSource.latest?.emit('access-revision'));
    await waitFor(() => expect(server.sessionResponses).toHaveLength(0));

    expect(screen.getByTestId('organization-context-sync')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage role bindings' })).not.toBeInTheDocument();

    await act(async () => releaseNewestSession());

    expect(await screen.findByText('No active organization membership')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage role bindings' })).not.toBeInTheDocument();

    await act(async () => {
      releaseOlderSession();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByText('No active organization membership')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Manage role bindings' })).not.toBeInTheDocument();
    expect(client.getQueryData(getGetSessionQueryOptions().queryKey)).toEqual({
      activeOrganization: null,
    });
  });
});