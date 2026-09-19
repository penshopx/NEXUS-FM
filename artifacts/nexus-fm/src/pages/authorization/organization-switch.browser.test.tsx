import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let activeOrganizationId = 'org-admin';

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
      queryFn: async () => ({
        organizationId: activeOrganizationId,
        permissions: tenant().permissions,
      }),
    }),
    useListRoles: (options?: { query?: { enabled?: boolean } }) => useQuery({
      queryKey: actual.getListRolesQueryKey(),
      queryFn: async () => tenant().roles,
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
      queryFn: async () => ({ items: tenant().members, page: 1, limit: 20, total: 1 }),
      enabled: (params?.query.length ?? 0) >= 2,
    }),
    useGetUserRoleBindings: (userId: string) => useQuery({
      queryKey: actual.getGetUserRoleBindingsQueryKey(userId),
      queryFn: async () => tenant().bindings.filter((binding) => binding.userId === userId),
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
      queryFn: async () => tenant().audit,
    }),
    useUpdateRolePermissions: () => ({ mutate: api.updateRolePermissions, isPending: false }),
    useCreateUserRoleBinding: () => ({ mutate: api.createBinding, isPending: false }),
    useUpdateUserRoleBinding: () => ({ mutate: api.updateBinding, isPending: false }),
    useRevokeUserRoleBinding: () => ({ mutate: api.revokeBinding, isPending: false }),
  };
});

import { getGetSessionQueryKey } from '@workspace/api-client-react';
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

describe('organization switching authorization isolation', () => {
  beforeEach(() => {
    activeOrganizationId = 'org-admin';
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
});