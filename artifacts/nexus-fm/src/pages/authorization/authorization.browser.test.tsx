import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  myPermissions: vi.fn(),
  listRoles: vi.fn(),
  rolePermissions: vi.fn(),
  updateRolePermissions: vi.fn(),
  searchMembers: vi.fn(),
  bindings: vi.fn(),
  createBinding: vi.fn(),
  updateBinding: vi.fn(),
  revokeBinding: vi.fn(),
  session: vi.fn(),
  auditLogs: vi.fn(),
}));

vi.mock('@workspace/api-client-react', () => ({
  ScopeType: {
    PLATFORM: 'PLATFORM',
    ORGANIZATION: 'ORGANIZATION',
    PORTFOLIO: 'PORTFOLIO',
    FACILITY: 'FACILITY',
    BUILDING: 'BUILDING',
    SPACE: 'SPACE',
    ASSET: 'ASSET',
    ASSIGNED: 'ASSIGNED',
    TEAM: 'TEAM',
    VENDOR_ASSIGNMENT: 'VENDOR_ASSIGNMENT',
    OWNED_REQUEST: 'OWNED_REQUEST',
  },
  useGetMyPermissions: api.myPermissions,
  useListRoles: api.listRoles,
  useGetRolePermissions: api.rolePermissions,
  useUpdateRolePermissions: api.updateRolePermissions,
  useSearchOrganizationMembers: api.searchMembers,
  useGetUserRoleBindings: api.bindings,
  useCreateUserRoleBinding: api.createBinding,
  useUpdateUserRoleBinding: api.updateBinding,
  useRevokeUserRoleBinding: api.revokeBinding,
  useGetSession: api.session,
  useGetAuthorizationAuditLogs: api.auditLogs,
  getGetRolePermissionsQueryKey: (id: string) => ['role-permissions', id],
  getGetAuthorizationAuditLogsQueryKey: () => ['audit-logs'],
  getGetMyPermissionsQueryKey: () => ['my-permissions'],
  getGetUserRoleBindingsQueryKey: (id: string) => ['bindings', id],
  getSearchOrganizationMembersQueryKey: (params: unknown) => ['members', params],
  getListRolesQueryKey: () => ['roles'],
}));

import { Toaster } from '@/components/ui/toaster';
import { AuthorizationPage } from './index';

const allPermissions = [
  'ROLE.MANAGE',
  'USER.VIEW',
  'USER.MANAGE',
  'AUDIT_LOG.VIEW_AUDIT',
].map((code) => ({ code, effect: 'ALLOW', scopeType: 'PLATFORM' }));

const member = {
  userId: 'target-user',
  organizationId: 'org-1',
  organizationName: 'Nexus Operations',
  displayName: 'Target Admin',
  email: 'target@example.test',
  membershipRole: 'member',
};

const role = {
  id: 'role-1',
  code: 'PLATFORM_ADMIN',
  policyVersion: 'version-1',
  status: 'ACTIVE',
};

function mutation() {
  return { mutate: vi.fn(), isPending: false };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthorizationPage />
      <Toaster />
    </QueryClientProvider>,
  );
}

async function openBindingsForMember(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('tab-bindings'));
  await user.type(screen.getByTestId('input-target-user'), 'Target');
  await user.click(screen.getByTestId('button-search-user'));
  await user.click(await screen.findByTestId('member-result-target-user-org-1'));
}

describe('authorization administration browser regressions', () => {
  beforeEach(() => {
    api.myPermissions.mockReturnValue({
      data: { organizationId: 'org-1', permissions: allPermissions },
      isLoading: false,
    });
    api.listRoles.mockReturnValue({ data: [role], isLoading: false });
    api.rolePermissions.mockReturnValue({
      data: {
        policyVersion: 'version-1',
        permissions: [{
          permissionId: 'permission-1',
          code: 'ROLE.MANAGE',
          effect: 'ALLOW',
          defaultScopeType: 'PLATFORM',
        }],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    api.updateRolePermissions.mockReturnValue(mutation());
    api.searchMembers.mockReturnValue({
      data: { items: [member], page: 1, limit: 20, total: 1 },
      isFetching: false,
      isError: false,
    });
    api.bindings.mockReturnValue({ data: [], isLoading: false });
    api.createBinding.mockReturnValue(mutation());
    api.updateBinding.mockReturnValue(mutation());
    api.revokeBinding.mockReturnValue(mutation());
    api.session.mockReturnValue({
      data: { activeOrganization: { organization: { id: 'org-1' } } },
    });
    api.auditLogs.mockReturnValue({ data: [], isLoading: false });
  });

  afterEach(cleanup);

  it('lets an authorized administrator open every permitted tab', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId('tab-roles')).toHaveAttribute('data-state', 'active');
    await user.click(screen.getByTestId('tab-bindings'));
    expect(screen.getByText('Find a member')).toBeVisible();
    await user.click(screen.getByTestId('tab-audit'));
    expect(screen.getByText(/Audit records are immutable/)).toBeVisible();
  });

  it('renders the in-app 403 state when no administration permission is granted', async () => {
    api.myPermissions.mockReturnValue({
      data: { organizationId: 'org-1', permissions: [] },
      isLoading: false,
    });
    renderPage();

    expect(await screen.findByTestId('auth-gate-denied')).toHaveTextContent('Access Denied');
    expect(screen.queryByTestId('tab-roles')).not.toBeInTheDocument();
  });

  it('shows canonical role names to view-only administrators without loading role policy', async () => {
    const user = userEvent.setup();
    api.myPermissions.mockReturnValue({
      data: {
        organizationId: 'org-1',
        permissions: [{ code: 'USER.VIEW', effect: 'ALLOW', scopeType: 'ORGANIZATION' }],
      },
      isLoading: false,
    });
    api.bindings.mockReturnValue({
      data: [{
        id: 'view-only-binding',
        userId: member.userId,
        roleId: role.id,
        roleCode: 'PLATFORM_ADMIN',
        version: 'binding-version',
        organizationId: 'org-1',
        scopeType: 'ORGANIZATION',
        scopeId: null,
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      }],
      isLoading: false,
    });
    renderPage();

    expect(screen.queryByTestId('tab-roles')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('input-target-user'), 'Target');
    await user.click(screen.getByTestId('button-search-user'));
    await user.click(await screen.findByTestId('member-result-target-user-org-1'));

    expect(screen.getByTestId('display-rolename-view-only-binding')).toHaveTextContent('PLATFORM_ADMIN');
    expect(screen.getByTestId('display-roleid-view-only-binding')).toHaveTextContent(role.id);
    expect(api.listRoles).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ enabled: false }),
    }));
    expect(screen.queryByTestId('button-toggle-suspend-view-only-binding')).not.toBeInTheDocument();
  });

  it('recovers from stale role-policy saves and exposes self-escalation server errors', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    const save = vi.fn((_variables, options) => options.onError({ status: 409 }));
    api.rolePermissions.mockReturnValue({
      data: {
        policyVersion: 'version-1',
        permissions: [{
          permissionId: 'permission-1',
          code: 'ROLE.MANAGE',
          effect: 'ALLOW',
          defaultScopeType: 'PLATFORM',
        }],
      },
      isLoading: false,
      error: null,
      refetch,
    });
    api.updateRolePermissions.mockReturnValue({ mutate: save, isPending: false });
    renderPage();

    await user.click(screen.getByTestId('role-select-PLATFORM_ADMIN'));
    await user.click(screen.getByTestId('button-edit-policy'));
    await user.click(screen.getByTestId('button-save-policy'));
    expect(await screen.findByText(/Concurrent Update Detected/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reload Latest Policy' }));
    expect(refetch).toHaveBeenCalledOnce();

    const selfEscalation = vi.fn((_variables, options) =>
      options.onError({
        status: 403,
        data: { error: 'Administrators cannot change their own access binding' },
      }),
    );
    api.updateBinding.mockReturnValue({ mutate: selfEscalation, isPending: false });
    api.bindings.mockReturnValue({
      data: [{
        id: 'self-binding',
        userId: 'target-user',
        roleId: role.id,
        roleCode: role.code,
        version: 'self-binding-version',
        organizationId: 'org-1',
        scopeType: 'ORGANIZATION',
        scopeId: null,
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      }],
      isLoading: false,
    });

    cleanup();
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('button-toggle-suspend-self-binding'));
    expect(await screen.findByText('Failed to suspend binding')).toBeVisible();
    expect(screen.getByText('Administrators cannot change their own access binding')).toBeVisible();
  });

  it('covers suspension, expiry, confirmed revocation, and read-only audit details', async () => {
    const user = userEvent.setup();
    const revoke = vi.fn((_variables, options) => options.onSuccess());
    api.revokeBinding.mockReturnValue({ mutate: revoke, isPending: false });
    api.bindings.mockReturnValue({
      data: [
        {
          id: 'suspended',
          userId: 'target-user',
          roleId: role.id,
          roleCode: role.code,
          version: 'suspended-version',
          organizationId: 'org-1',
          scopeType: 'ORGANIZATION',
          scopeId: null,
          status: 'SUSPENDED',
          startsAt: null,
          endsAt: null,
        },
        {
          id: 'expired',
          userId: 'target-user',
          roleId: role.id,
          roleCode: role.code,
          version: 'expired-version',
          organizationId: 'org-1',
          scopeType: 'ORGANIZATION',
          scopeId: null,
          status: 'EXPIRED',
          startsAt: null,
          endsAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'active',
          userId: 'target-user',
          roleId: role.id,
          roleCode: role.code,
          version: 'active-version',
          organizationId: 'org-1',
          scopeType: 'ORGANIZATION',
          scopeId: null,
          status: 'ACTIVE',
          startsAt: null,
          endsAt: null,
        },
      ],
      isLoading: false,
    });
    api.auditLogs.mockReturnValue({
      data: [{
        id: 'audit-1',
        actorUserId: 'admin-1',
        organizationId: 'org-1',
        action: 'ROLE_REVOKED',
        resource: 'USER_ROLE_BINDING',
        resourceId: 'active',
        decision: 'ALLOW',
        reasonCode: 'AUTHORIZED',
        scopeEvaluated: 'ORGANIZATION',
        requestId: 'request-1',
        beforeState: '{"status":"ACTIVE"}',
        afterState: '{"status":"REVOKED"}',
        createdAt: '2026-09-12T12:00:00.000Z',
      }],
      isLoading: false,
    });
    renderPage();
    await openBindingsForMember(user);

    expect(screen.getByTestId('display-status-suspended')).toHaveTextContent('SUSPENDED');
    expect(screen.getByTestId('button-toggle-suspend-suspended')).toHaveAttribute('title', 'Reactivate');
    expect(screen.getByTestId('display-status-expired')).toHaveTextContent('EXPIRED');
    expect(screen.getByTestId('button-toggle-suspend-expired')).toBeDisabled();
    expect(screen.getByTestId('button-revoke-binding-expired')).toBeDisabled();

    await user.click(screen.getByTestId('button-revoke-binding-active'));
    expect(screen.getByText('Revoke Binding Permanently?')).toBeVisible();
    await user.click(screen.getByTestId('button-confirm-revoke'));
    expect(revoke).toHaveBeenCalledOnce();

    await user.click(screen.getByTestId('tab-audit'));
    await user.click(await screen.findByTestId('button-audit-details-audit-1'));
    const details = screen.getByRole('dialog');
    expect(within(details).getByText('Audit Record Details')).toBeVisible();
    expect(within(details).getByText('ROLE_REVOKED')).toBeVisible();
    expect(within(details).getByText(/"status": "REVOKED"/)).toBeVisible();
    expect(within(details).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: /save|edit|delete/i })).not.toBeInTheDocument();
  });
});