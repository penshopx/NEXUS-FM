import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let activeOrganizationId = 'org-admin';

const race = vi.hoisted(() => {
  type HeldRequest = {
    organizationId: string;
    kind: string;
    resolve: () => void;
  };

  return {
    holdOrganizationId: null as string | null,
    held: [] as HeldRequest[],
  };
});

async function organizationResponse<T>(kind: string, getValue: () => T): Promise<T> {
  const organizationId = activeOrganizationId;
  const value = getValue();

  if (race.holdOrganizationId !== organizationId) return value;

  await new Promise<void>((resolve) => {
    race.held.push({ organizationId, kind, resolve });
  });
  return value;
}

const organizations = {
  'org-admin': {
    permissions: [
      { code: 'ROLE.MANAGE', effect: 'ALLOW', scopeType: 'ORGANIZATION' },
      { code: 'USER.VIEW', effect: 'ALLOW', scopeType: 'ORGANIZATION' },
      { code: 'USER.MANAGE', effect: 'ALLOW', scopeType: 'ORGANIZATION' },
      { code: 'AUDIT_LOG.VIEW_AUDIT', effect: 'ALLOW', scopeType: 'ORGANIZATION' },
    ],
    roles: [{ id: 'admin-role', code: 'ADMIN_ORG_ROLE', policyVersion: 'admin-v1', status: 'ACTIVE' }],
    members: [{
      userId: 'admin-member',
      organizationId: 'org-admin',
      organizationName: 'Admin Organization',
      displayName: 'Admin Tenant Member',
      email: 'admin-member@example.test',
      membershipRole: 'member',
    }],
    bindings: [{
      id: 'admin-binding',
      userId: 'admin-member',
      roleId: 'admin-role',
      roleCode: 'ADMIN_ORG_ROLE',
      version: 'binding-v1',
      organizationId: 'org-admin',
      scopeType: 'ORGANIZATION',
      scopeId: null,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
    }],
    audit: [{
      id: 'admin-audit',
      actorUserId: 'admin-user',
      organizationId: 'org-admin',
      action: 'ADMIN_ORG_ACTION',
      resource: 'USER_ROLE_BINDING',
      resourceId: 'admin-binding',
      decision: 'ALLOW',
      reasonCode: 'AUTHORIZED',
      scopeEvaluated: 'ORGANIZATION',
      requestId: 'admin-request',
      beforeState: null,
      afterState: null,
      createdAt: '2026-09-17T12:00:00.000Z',
    }],
  },
  'org-viewer': {
    permissions: [
      { code: 'USER.VIEW', effect: 'ALLOW', scopeType: 'ORGANIZATION' },
    ],
    roles: [{ id: 'viewer-role', code: 'VIEWER_ORG_ROLE', policyVersion: 'viewer-v1', status: 'ACTIVE' }],
    members: [{
      userId: 'viewer-member',
      organizationId: 'org-viewer',
      organizationName: 'Viewer Organization',
      displayName: 'Viewer Tenant Member',
      email: 'viewer-member@example.test',
      membershipRole: 'member',
    }],
    bindings: [{
      id: 'viewer-binding',
      userId: 'viewer-member',
      roleId: 'viewer-role',
      roleCode: 'VIEWER_ORG_ROLE',
      version: 'binding-v1',
      organizationId: 'org-viewer',
      scopeType: 'ORGANIZATION',
      scopeId: null,
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
    }],
    audit: [],
  },
} as const;

const api = vi.hoisted(() => ({
  updateRolePermissions: vi.fn(),
  createBinding: vi.fn(),
  updateBinding: vi.fn(),
  revokeBinding: vi.fn(),
}));

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>('@workspace/api-client-react');
  const tenant = () => organizations[activeOrganizationId as keyof typeof organizations];
  return {
    ...actual,
    useGetMyPermissions: () => useQuery({
      queryKey: actual.getGetMyPermissionsQueryKey(),
      queryFn: () => organizationResponse('permissions', () => ({
        organizationId: activeOrganizationId,
        permissions: tenant().permissions,
      })),
    }),
    useListRoles: (options?: { query?: { enabled?: boolean } }) => useQuery({
      queryKey: actual.getListRolesQueryKey(),
      queryFn: () => organizationResponse('roles', () => tenant().roles),
      enabled: options?.query?.enabled,
    }),
    useGetRolePermissions: (roleId: string) => useQuery({
      queryKey: actual.getGetRolePermissionsQueryKey(roleId),
      queryFn: async () => ({ policyVersion: `${activeOrganizationId}-policy`, permissions: [] }),
    }),
    useSearchOrganizationMembers: (
      params: Parameters<typeof actual.getSearchOrganizationMembersQueryKey>[0],
    ) => useQuery({
      queryKey: actual.getSearchOrganizationMembersQueryKey(params),
      queryFn: () => organizationResponse('members', () => ({
        items: tenant().members,
        page: 1,
        limit: 20,
        total: 1,
      })),
      enabled: (params?.query.length ?? 0) >= 2,
    }),
    useGetUserRoleBindings: (userId: string) => useQuery({
      queryKey: actual.getGetUserRoleBindingsQueryKey(userId),
      queryFn: () => organizationResponse(
        'bindings',
        () => tenant().bindings.filter((binding) => binding.userId === userId),
      ),
    }),
    useGetSession: () => useQuery({
      queryKey: actual.getGetSessionQueryKey(),
      queryFn: async () => ({
        activeOrganization: { organization: { id: activeOrganizationId } },
      }),
    }),
    useGetAuthorizationAuditLogs: (
      params: Parameters<typeof actual.getGetAuthorizationAuditLogsQueryKey>[0],
    ) => useQuery({
      queryKey: actual.getGetAuthorizationAuditLogsQueryKey(params),
      queryFn: () => organizationResponse('audit', () => tenant().audit),
    }),
    useUpdateRolePermissions: () => ({ mutate: api.updateRolePermissions, isPending: false }),
    useCreateUserRoleBinding: () => ({ mutate: api.createBinding, isPending: false }),
    useUpdateUserRoleBinding: () => ({ mutate: api.updateBinding, isPending: false }),
    useRevokeUserRoleBinding: () => ({ mutate: api.revokeBinding, isPending: false }),
  };
});

import {
  getGetAuthorizationAuditLogsQueryKey,
  getGetMyPermissionsQueryKey,
  getGetSessionQueryKey,
  getGetUserRoleBindingsQueryKey,
  getListRolesQueryKey,
  getSearchOrganizationMembersQueryKey,
  useGetAuthorizationAuditLogs,
  useGetMyPermissions,
  useGetUserRoleBindings,
  useListRoles,
  useSearchOrganizationMembers,
} from '@workspace/api-client-react';
import { replaceOrganizationContext } from '@/lib/organization-context';
import { AuthorizationPage } from './index';

function OrganizationSwitchHarness({ client }: { client: QueryClient }) {
  const [organizationId, setOrganizationId] = useState(activeOrganizationId);

  const switchOrganization = (nextOrganizationId: string) => {
    activeOrganizationId = nextOrganizationId;
    replaceOrganizationContext(client, {
      activeOrganization: {
        organization: { id: nextOrganizationId },
      },
    } as never);
    setOrganizationId(nextOrganizationId);
  };

  return (
    <>
      <button onClick={() => switchOrganization('org-admin')}>Switch to admin organization</button>
      <button onClick={() => switchOrganization('org-viewer')}>Switch to viewer organization</button>
      <div data-testid="active-organization">{organizationId}</div>
      <div key={organizationId}>
        <AuthorizationPage />
      </div>
    </>
  );
}

const memberSearchParams = { query: 'member', page: 1, limit: 20 };
const auditParams = {};

function InFlightAuthorizationHarness({ client }: { client: QueryClient }) {
  const [organizationId, setOrganizationId] = useState(activeOrganizationId);
  const permissions = useGetMyPermissions();
  const roles = useListRoles();
  const members = useSearchOrganizationMembers(memberSearchParams);
  const bindings = useGetUserRoleBindings(
    organizationId === 'org-admin' ? 'admin-member' : 'viewer-member',
  );
  const audit = useGetAuthorizationAuditLogs(auditParams);

  const switchOrganization = () => {
    activeOrganizationId = 'org-viewer';
    replaceOrganizationContext(client, {
      activeOrganization: {
        organization: { id: 'org-viewer' },
      },
    } as never);
    setOrganizationId('org-viewer');
  };

  return (
    <>
      <button onClick={switchOrganization}>Switch while requests are pending</button>
      <div data-testid="race-active-organization">{organizationId}</div>
      <div data-testid="race-permissions">
        {permissions.data?.organizationId}
      </div>
      <div data-testid="race-roles">
        {roles.data?.map((role) => role.code).join(',')}
      </div>
      <div data-testid="race-members">
        {members.data?.items.map((member) => member.displayName).join(',')}
      </div>
      <div data-testid="race-bindings">
        {bindings.data?.map((binding) => binding.roleCode).join(',')}
      </div>
      <div data-testid="race-audit">
        {audit.data?.map((entry) => entry.action).join(',')}
      </div>
    </>
  );
}

describe('organization switching authorization isolation', () => {
  beforeEach(() => {
    activeOrganizationId = 'org-admin';
    race.holdOrganizationId = null;
    race.held = [];
  });

  afterEach(cleanup);

  it('never renders cached administration data from another organization', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });

    render(
      <QueryClientProvider client={client}>
        <OrganizationSwitchHarness client={client} />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('tab-roles')).toBeVisible();
    expect(await screen.findByTestId('role-select-ADMIN_ORG_ROLE')).toBeVisible();

    await user.click(screen.getByTestId('tab-bindings'));
    await user.type(screen.getByTestId('input-target-user'), 'member');
    await user.click(screen.getByTestId('button-search-user'));
    await user.click(await screen.findByTestId('member-result-admin-member-org-admin'));
    expect(await screen.findByTestId('row-binding-admin-binding')).toBeVisible();

    await user.click(screen.getByTestId('tab-audit'));
    expect(await screen.findByTestId('row-audit-admin-audit')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Switch to viewer organization' }));

    expect(screen.getByTestId('active-organization')).toHaveTextContent('org-viewer');
    expect(client.getQueryData(getGetSessionQueryKey())).toMatchObject({
      activeOrganization: { organization: { id: 'org-viewer' } },
    });
    expect(await screen.findByTestId('tab-bindings')).toHaveAttribute('data-state', 'active');
    expect(screen.queryByTestId('tab-roles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-audit')).not.toBeInTheDocument();
    expect(screen.queryByText('ADMIN_ORG_ROLE')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-result-admin-member-org-admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-binding-admin-binding')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-audit-admin-audit')).not.toBeInTheDocument();

    expect(screen.getByTestId('input-target-user')).toHaveValue('member');
    await user.click(await screen.findByTestId('member-result-viewer-member-org-viewer'));
    expect(await screen.findByTestId('row-binding-viewer-binding')).toBeVisible();
    expect(screen.queryByText('ADMIN_ORG_ROLE')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch to admin organization' }));

    expect(await screen.findByTestId('tab-bindings')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('input-target-user')).toHaveValue('member');
    expect(screen.queryByTestId('member-result-viewer-member-org-viewer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-binding-viewer-binding')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('tab-roles'));
    await waitFor(() => expect(screen.getByTestId('tab-roles')).toHaveAttribute('data-state', 'active'));
    expect(await screen.findByTestId('role-select-ADMIN_ORG_ROLE')).toBeVisible();
    expect(screen.queryByText('VIEWER_ORG_ROLE')).not.toBeInTheDocument();
  });

  it('ignores previous-organization authorization responses that resolve after switching', async () => {
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    race.holdOrganizationId = 'org-admin';

    render(
      <QueryClientProvider client={client}>
        <InFlightAuthorizationHarness client={client} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(race.held.map(({ kind }) => kind).sort()).toEqual([
        'audit',
        'bindings',
        'members',
        'permissions',
        'roles',
      ]);
    });

    await user.click(screen.getByRole('button', { name: 'Switch while requests are pending' }));
    expect(screen.getByTestId('race-active-organization')).toHaveTextContent('org-viewer');

    for (const request of race.held) request.resolve();

    await waitFor(() => {
      expect(screen.getByTestId('race-permissions')).toHaveTextContent('org-viewer');
      expect(screen.getByTestId('race-roles')).toHaveTextContent('VIEWER_ORG_ROLE');
      expect(screen.getByTestId('race-members')).toHaveTextContent('Viewer Tenant Member');
      expect(screen.getByTestId('race-bindings')).toHaveTextContent('VIEWER_ORG_ROLE');
      expect(screen.getByTestId('race-audit')).toBeEmptyDOMElement();
    });

    expect(document.body).not.toHaveTextContent('org-admin');
    expect(document.body).not.toHaveTextContent('ADMIN_ORG_ROLE');
    expect(document.body).not.toHaveTextContent('Admin Tenant Member');
    expect(document.body).not.toHaveTextContent('ADMIN_ORG_ACTION');

    const cachedValues = [
      client.getQueryData(getGetMyPermissionsQueryKey()),
      client.getQueryData(getListRolesQueryKey()),
      client.getQueryData(getSearchOrganizationMembersQueryKey(memberSearchParams)),
      client.getQueryData(getGetUserRoleBindingsQueryKey('admin-member')),
      client.getQueryData(getGetAuthorizationAuditLogsQueryKey(auditParams)),
    ];
    expect(JSON.stringify(cachedValues)).not.toContain('org-admin');
    expect(JSON.stringify(cachedValues)).not.toContain('ADMIN_ORG_ROLE');
    expect(JSON.stringify(cachedValues)).not.toContain('Admin Tenant Member');
    expect(JSON.stringify(cachedValues)).not.toContain('ADMIN_ORG_ACTION');
  });
});
