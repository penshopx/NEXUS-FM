import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationApiHookMock } from './authorization-api-mocks';
import { expectNoHighImpactAccessibilityViolations } from '@/test/accessibility';

const api = vi.hoisted(() => ({
  myPermissions: vi.fn<AuthorizationApiHookMock<'useGetMyPermissions'>>(),
  listRoles: vi.fn<AuthorizationApiHookMock<'useListRoles'>>(),
  rolePermissions: vi.fn<AuthorizationApiHookMock<'useGetRolePermissions'>>(),
  updateRolePermissions: vi.fn<AuthorizationApiHookMock<'useUpdateRolePermissions'>>(),
  searchMembers: vi.fn<AuthorizationApiHookMock<'useSearchOrganizationMembers'>>(),
  searchOrganizations: vi.fn<AuthorizationApiHookMock<'useSearchPlatformOrganizations'>>(),
  searchScopeTargets: vi.fn<AuthorizationApiHookMock<'useSearchRoleBindingScopeTargets'>>(),
  bindings: vi.fn<AuthorizationApiHookMock<'useGetUserRoleBindings'>>(),
  createBinding: vi.fn<AuthorizationApiHookMock<'useCreateUserRoleBinding'>>(),
  updateBinding: vi.fn<AuthorizationApiHookMock<'useUpdateUserRoleBinding'>>(),
  revokeBinding: vi.fn<AuthorizationApiHookMock<'useRevokeUserRoleBinding'>>(),
  session: vi.fn<AuthorizationApiHookMock<'useGetSession'>>(),
  auditLogs: vi.fn<AuthorizationApiHookMock<'useGetAuthorizationAuditLogs'>>(),
}));

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
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
  useSearchPlatformOrganizations: api.searchOrganizations,
  useSearchRoleBindingScopeTargets: api.searchScopeTargets,
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
  getSearchPlatformOrganizationsQueryKey: (params: unknown) => ['organizations', params],
  getSearchRoleBindingScopeTargetsQueryKey: (params: unknown) => ['scope-targets', params],
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
    HTMLElement.prototype.hasPointerCapture ??= () => false;
    HTMLElement.prototype.setPointerCapture ??= () => {};
    HTMLElement.prototype.releasePointerCapture ??= () => {};
    HTMLElement.prototype.scrollIntoView ??= () => {};
    window.history.replaceState(null, '', '/authorization');
    analytics.track.mockReset();
    window.umami = { track: analytics.track };
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
    api.searchOrganizations.mockReturnValue({
      data: [{ id: 'org-2', name: 'Acme Facilities', slug: 'acme-facilities' }],
      isFetching: false,
      isError: false,
    });
    api.searchScopeTargets.mockReturnValue({
      data: [
        {
          id: 'facility-1',
          name: 'North Campus',
          code: 'FAC-NORTH',
          parentPath: [],
          scopeType: 'FACILITY',
          organizationId: 'org-1',
        },
        {
          id: 'building-1',
          name: 'Central Plant',
          code: 'BLDG-NORTH',
          parentPath: ['North Campus'],
          scopeType: 'BUILDING',
          organizationId: 'org-1',
        },
        {
          id: 'building-2',
          name: 'Central Plant',
          code: 'BLDG-SOUTH',
          parentPath: ['South Campus'],
          scopeType: 'BUILDING',
          organizationId: 'org-1',
        },
        {
          id: 'team-1',
          name: 'Night Operations',
          code: 'TEAM-NIGHT',
          parentPath: [],
          scopeType: 'TEAM',
          organizationId: 'org-1',
        },
        {
          id: 'vendor-assignment-1',
          name: 'Elevator Maintenance',
          code: 'VENDOR-ELEVATOR',
          parentPath: [],
          scopeType: 'VENDOR_ASSIGNMENT',
          organizationId: 'org-1',
        },
      ],
      isFetching: false,
      isError: false,
    });
    api.bindings.mockReturnValue({
      data: { items: [], page: 1, limit: 20, total: 0 },
      isLoading: false,
    });
    api.createBinding.mockReturnValue(mutation());
    api.updateBinding.mockReturnValue(mutation());
    api.revokeBinding.mockReturnValue(mutation());
    api.session.mockReturnValue({
      data: { activeOrganization: { organization: { id: 'org-1' } } },
    });
    api.auditLogs.mockReturnValue({ data: [], isLoading: false });
  });

  afterEach(() => {
    cleanup();
    delete window.umami;
    window.history.replaceState(null, '', '/authorization');
  });

  it('lets an authorized administrator open every permitted tab', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId('tab-roles')).toHaveAttribute('data-state', 'active');
    await user.click(screen.getByTestId('tab-bindings'));
    expect(screen.getByText('Find a member')).toBeVisible();
    await user.click(screen.getByTestId('tab-audit'));
    expect(screen.getByText(/Audit records are immutable/)).toBeVisible();
  });

  it('has no serious or critical accessibility violations on administration tabs and dialogs', async () => {
    const user = userEvent.setup();
    api.bindings.mockReturnValue({
      data: { items: [{
        id: 'active',
        userId: member.userId,
        roleId: role.id,
        roleCode: role.code,
        version: 'active-version',
        organizationId: 'org-1',
        scopeType: 'ORGANIZATION',
        scopeId: null,
        scopeTargetName: 'Nexus Operations',
        scopeTargetStatus: 'RESOLVED',
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      }], page: 1, limit: 20, total: 1 },
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

    await screen.findByTestId('tab-roles');
    await expectNoHighImpactAccessibilityViolations();

    await openBindingsForMember(user);
    await expectNoHighImpactAccessibilityViolations();

    await user.click(screen.getByTestId('button-new-binding'));
    expect(screen.getByRole('dialog', { name: 'Create Role Binding' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('button-edit-binding-active'));
    expect(screen.getByRole('dialog', { name: /Edit Role Binding/i })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('button-revoke-binding-active'));
    expect(screen.getByRole('alertdialog', { name: 'Revoke Binding Permanently?' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('tab-audit'));
    await expectNoHighImpactAccessibilityViolations();

    await user.click(await screen.findByTestId('button-audit-details-audit-1'));
    expect(screen.getByRole('dialog', { name: 'Audit Record Details' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
  });

  it('lets platform administrators choose and retain an organization by name', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('tab-bindings'));
    await user.click(screen.getByTestId('button-member-organization'));
    await user.type(screen.getByTestId('input-member-organization'), 'Acme');
    await user.click(await screen.findByTestId('organization-option-org-2'));
    await user.type(screen.getByTestId('input-target-user'), 'Target');
    await user.click(screen.getByTestId('button-search-user'));

    expect(api.searchMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ organizationId: 'org-2' }),
      expect.anything(),
    );
    expect(screen.getByTestId('member-search-page-summary')).toHaveTextContent(
      'Organization Acme Facilities (acme-facilities)',
    );
    expect(window.location.search).toContain('query=Target');
    expect(window.location.search).toContain('organizationId=org-2');
  });

  it('creates an object-scoped binding by selecting a current target name', async () => {
    const user = userEvent.setup();
    const create = vi.fn((_variables, options) => options.onSuccess());
    api.createBinding.mockReturnValue({ mutate: create, isPending: false });
    renderPage();
    await openBindingsForMember(user);

    await user.click(screen.getByTestId('button-new-binding'));
    await user.click(screen.getByTestId('select-role'));
    await user.click(screen.getByRole('option', { name: 'PLATFORM_ADMIN' }));
    await user.click(screen.getByTestId('select-scopetype'));
    await user.click(screen.getByRole('option', { name: 'BUILDING' }));
    await user.click(screen.getByTestId('input-scopeid'));
    expect(await screen.findByText('BLDG-NORTH · North Campus')).toBeVisible();
    expect(screen.getByText('BLDG-SOUTH · South Campus')).toBeVisible();
    await user.click(await screen.findByTestId('input-scopeid-option-building-1'));
    expect(screen.getByText('BLDG-NORTH · North Campus')).toBeVisible();
    await user.click(screen.getByTestId('button-create-binding'));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: member.userId,
        data: expect.objectContaining({
          organizationId: member.organizationId,
          scopeType: 'BUILDING',
          scopeId: 'building-1',
        }),
      }),
      expect.any(Object),
    );
  });

  it('preserves stable ID creation for contextual scope types without a directory', async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    api.createBinding.mockReturnValue({ mutate: create, isPending: false });
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('button-new-binding'));
    await user.click(screen.getByTestId('select-role'));
    await user.click(screen.getByRole('option', { name: 'PLATFORM_ADMIN' }));

    for (const scopeType of ['ASSIGNED', 'OWNED_REQUEST']) {
      await user.click(screen.getByTestId('select-scopetype'));
      await user.click(screen.getByRole('option', { name: scopeType }));
      const targetInput = screen.getByTestId('input-scopeid');
      await user.type(targetInput, `${scopeType.toLowerCase()}-target`);
      await user.click(screen.getByTestId('button-create-binding'));
      expect(create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scopeType,
            scopeId: `${scopeType.toLowerCase()}-target`,
          }),
        }),
        expect.any(Object),
      );
    }
  });

  it('creates team and vendor bindings by selecting their permanent directory names', async () => {
    const user = userEvent.setup();
    const create = vi.fn();
    api.createBinding.mockReturnValue({ mutate: create, isPending: false });
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('button-new-binding'));
    await user.click(screen.getByTestId('select-role'));
    await user.click(screen.getByRole('option', { name: 'PLATFORM_ADMIN' }));

    for (const [scopeType, targetId] of [
      ['TEAM', 'team-1'],
      ['VENDOR_ASSIGNMENT', 'vendor-assignment-1'],
    ] as const) {
      await user.click(screen.getByTestId('select-scopetype'));
      await user.click(screen.getByRole('option', { name: scopeType }));
      await user.click(screen.getByTestId('input-scopeid'));
      await user.click(await screen.findByTestId(`input-scopeid-option-${targetId}`));
      await user.click(screen.getByTestId('button-create-binding'));
      expect(create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scopeType, scopeId: targetId }),
        }),
        expect.any(Object),
      );
      expect(api.searchScopeTargets).toHaveBeenCalledWith(
        expect.objectContaining({
          scopeType,
          organizationId: member.organizationId,
        }),
        expect.objectContaining({
          query: expect.objectContaining({ enabled: true }),
        }),
      );
    }
  });

  it('shows a historical target without offering it as a current choice', async () => {
    const user = userEvent.setup();
    api.bindings.mockReturnValue({
      data: { items: [{
        id: 'historical',
        userId: member.userId,
        roleId: role.id,
        roleCode: role.code,
        version: 'historical-version',
        organizationId: member.organizationId,
        scopeType: 'FACILITY',
        scopeId: 'missing-facility',
        scopeTargetName: null,
        scopeTargetStatus: 'MISSING',
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      }], page: 1, limit: 20, total: 1 },
      isLoading: false,
    });
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('button-edit-binding-historical'));

    expect(screen.getByText('Missing or historical target')).toBeVisible();
    expect(screen.getByText('missing-facility')).toBeVisible();
    await user.click(screen.getByTestId('input-edit-scopeid'));
    expect(screen.queryByTestId('input-edit-scopeid-option-missing-facility')).not.toBeInTheDocument();
    expect(await screen.findByTestId('input-edit-scopeid-option-facility-1')).toBeVisible();
    expect(screen.getByText('FAC-NORTH')).toBeVisible();
  });

  it('requires confirmation before saving a broader binding scope', async () => {
    const user = userEvent.setup();
    const update = mutation();
    api.updateBinding.mockReturnValue(update);
    api.bindings.mockReturnValue({
      data: { items: [{
        id: 'space-binding',
        userId: member.userId,
        roleId: role.id,
        roleCode: role.code,
        version: 'space-version',
        organizationId: member.organizationId,
        scopeType: 'SPACE',
        scopeId: 'space-1',
        scopeTargetName: 'Boiler Room',
        scopeTargetStatus: 'RESOLVED',
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      }], page: 1, limit: 20, total: 1 },
      isLoading: false,
    });
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('button-edit-binding-space-binding'));
    await user.click(screen.getByTestId('select-edit-scopetype'));
    await user.click(screen.getByRole('option', { name: 'TEAM' }));
    await user.click(screen.getByTestId('input-edit-scopeid'));
    await user.click(await screen.findByTestId('input-edit-scopeid-option-team-1'));
    await user.click(screen.getByTestId('button-save-binding'));

    expect(update.mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('broader-scope-current')).toHaveTextContent('SPACE: Boiler Room');
    expect(screen.getByTestId('broader-scope-new')).toHaveTextContent('TEAM: team-1');

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog', { name: 'Edit Role Binding' })).toBeVisible();
    expect(screen.getByTestId('select-edit-scopetype')).toHaveTextContent('TEAM');
    expect(update.mutate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('button-save-binding'));
    await user.click(screen.getByTestId('button-confirm-broader-scope'));
    expect(update.mutate).toHaveBeenCalledTimes(1);
    expect(update.mutate).toHaveBeenCalledWith(
      {
        userId: member.userId,
        bindingId: 'space-binding',
        data: expect.objectContaining({
          scopeType: 'TEAM',
          scopeId: 'team-1',
        }),
      },
      expect.anything(),
    );
  });

  it('saves expiry-only binding edits without a broader-scope warning', async () => {
    const user = userEvent.setup();
    const update = mutation();
    api.updateBinding.mockReturnValue(update);
    api.bindings.mockReturnValue({
      data: { items: [{
        id: 'expiry-binding',
        userId: member.userId,
        roleId: role.id,
        roleCode: role.code,
        version: 'expiry-version',
        organizationId: member.organizationId,
        scopeType: 'SPACE',
        scopeId: 'space-1',
        scopeTargetName: 'Boiler Room',
        scopeTargetStatus: 'RESOLVED',
        status: 'ACTIVE',
        startsAt: null,
        endsAt: null,
      }], page: 1, limit: 20, total: 1 },
      isLoading: false,
    });
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('button-edit-binding-expiry-binding'));
    await user.type(screen.getByTestId('input-edit-endsat'), '2027-01-15');
    await user.click(screen.getByTestId('button-save-binding'));

    expect(screen.queryByTestId('broader-scope-confirmation')).not.toBeInTheDocument();
    expect(update.mutate).toHaveBeenCalledTimes(1);
    expect(update.mutate).toHaveBeenCalledWith(
      {
        userId: member.userId,
        bindingId: 'expiry-binding',
        data: expect.objectContaining({
          scopeType: 'SPACE',
          scopeId: 'space-1',
        }),
      },
      expect.anything(),
    );
  });

  it('restores member search filters and pagination from the URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/authorization?query=Target&organizationId=org-2&organizationName=Acme+Facilities&organizationSlug=acme-facilities&page=2',
    );
    api.searchMembers.mockReturnValue({
      data: { items: [member], page: 2, limit: 20, total: 41 },
      isFetching: false,
      isError: false,
    });

    renderPage();

    expect(await screen.findByTestId('tab-bindings')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('input-target-user')).toHaveValue('Target');
    expect(screen.getByTestId('button-member-organization')).toHaveTextContent('Acme Facilities');
    expect(api.searchMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Target', organizationId: 'org-2', page: 2 }),
      expect.anything(),
    );
  });

  it('bookmarks and restores an authorized selected member from the URL', async () => {
    const user = userEvent.setup();
    renderPage();

    await openBindingsForMember(user);

    expect(window.location.search).toContain('memberId=target-user');
    expect(window.location.search).toContain('memberOrganizationId=org-1');
    expect(screen.getByText('Role Bindings for Target Admin')).toBeVisible();

    cleanup();
    window.history.replaceState(
      null,
      '',
      '/authorization?query=Target&memberId=target-user&memberOrganizationId=org-1',
    );
    renderPage();

    expect(await screen.findByText('Role Bindings for Target Admin')).toBeVisible();
    expect(api.bindings).toHaveBeenLastCalledWith(
      'target-user',
      { page: 1, limit: 20 },
      expect.anything(),
    );
  });

  it('shows a generic notice for an unavailable bookmarked member and lets it be cleared', async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      '',
      '/authorization?query=Target&memberId=unauthorized-user&memberOrganizationId=org-secret',
    );
    renderPage();

    expect(await screen.findByTestId('member-search-results')).toBeVisible();
    expect(screen.getByTestId('saved-member-unavailable')).toHaveTextContent(
      'This saved member selection is no longer available.',
    );
    expect(screen.getByTestId('saved-member-unavailable')).not.toHaveTextContent('unauthorized-user');
    expect(screen.getByTestId('saved-member-unavailable')).not.toHaveTextContent('org-secret');
    expect(screen.queryByText(/Role Bindings for/)).not.toBeInTheDocument();
    expect(api.bindings).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('button-clear-unavailable-member'));

    expect(screen.queryByTestId('saved-member-unavailable')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?query=Target');
    expect(screen.getByTestId('member-search-results')).toBeVisible();
  });

  it('restores selected members through browser back and forward navigation', async () => {
    const secondMember = {
      ...member,
      userId: 'second-user',
      displayName: 'Second Admin',
      email: 'second@example.test',
    };
    api.searchMembers.mockReturnValue({
      data: { items: [member, secondMember], page: 1, limit: 20, total: 2 },
      isFetching: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('tab-bindings'));
    await user.type(screen.getByTestId('input-target-user'), 'Admin');
    await user.click(screen.getByTestId('button-search-user'));
    await user.click(await screen.findByTestId('member-result-target-user-org-1'));
    await user.click(screen.getByTestId('member-result-second-user-org-1'));
    expect(screen.getByText('Role Bindings for Second Admin')).toBeVisible();

    window.history.back();
    await waitFor(() => expect(screen.getByText('Role Bindings for Target Admin')).toBeVisible());

    window.history.forward();
    await waitFor(() => expect(screen.getByText('Role Bindings for Second Admin')).toBeVisible());
  });

  it('restores earlier search state through browser navigation', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('tab-bindings'));
    await user.type(screen.getByTestId('input-target-user'), 'First');
    await user.click(screen.getByTestId('button-search-user'));
    await user.clear(screen.getByTestId('input-target-user'));
    await user.type(screen.getByTestId('input-target-user'), 'Second');
    await user.click(screen.getByTestId('button-search-user'));

    window.history.back();

    await waitFor(() => expect(window.location.search).toContain('query=First'));
    await waitFor(() => expect(screen.getByTestId('input-target-user')).toHaveValue('First'));
    expect(api.searchMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'First', page: 1 }),
      expect.anything(),
    );
  });

  it('clears a saved member search and restores it through browser navigation', async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      '',
      '/authorization?query=Target&organizationId=org-2&organizationName=Acme+Facilities&organizationSlug=acme-facilities&page=2',
    );
    api.searchMembers.mockReturnValue({
      data: { items: [member], page: 2, limit: 20, total: 41 },
      isFetching: false,
      isError: false,
    });
    renderPage();

    await user.click(await screen.findByTestId('member-result-target-user-org-1'));
    expect(screen.getByText('Role Bindings for Target Admin')).toBeVisible();

    await user.click(screen.getByTestId('button-clear-member-search'));

    expect(screen.getByTestId('input-target-user')).toHaveValue('');
    expect(screen.getByTestId('button-member-organization')).toHaveTextContent('All organizations');
    expect(screen.queryByTestId('member-search-results')).not.toBeInTheDocument();
    expect(screen.queryByText('Role Bindings for Target Admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-clear-member-search')).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
    expect(analytics.track).toHaveBeenCalledOnce();
    expect(analytics.track).toHaveBeenCalledWith('member_search_reset', {
      had_pagination: true,
      had_organization_filter: true,
    });
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('Target');
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('org-2');
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('Acme Facilities');

    window.history.back();

    await waitFor(() => expect(window.location.search).toContain('query=Target'));
    await waitFor(() => expect(screen.getByTestId('input-target-user')).toHaveValue('Target'));
    expect(screen.getByTestId('button-member-organization')).toHaveTextContent('Acme Facilities');
    expect(screen.getByTestId('button-clear-member-search')).toBeVisible();
    expect(screen.getByTestId('member-search-results')).toBeVisible();
    expect(api.searchMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Target', organizationId: 'org-2', page: 2 }),
      expect.anything(),
    );
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
    const visibleBindings = [
        {
          id: 'view-only-binding',
          userId: member.userId,
          roleId: role.id,
          roleCode: 'PLATFORM_ADMIN',
          version: 'binding-version',
          organizationId: 'org-1',
          scopeType: 'ORGANIZATION',
          scopeId: null,
          scopeTargetName: 'Organization One',
          scopeTargetStatus: 'RESOLVED',
          status: 'ACTIVE',
          startsAt: null,
          endsAt: null,
        },
        {
          id: 'historical-binding',
          userId: member.userId,
          roleId: role.id,
          roleCode: 'PLATFORM_ADMIN',
          version: 'historical-binding-version',
          organizationId: 'org-1',
          scopeType: 'FACILITY',
          scopeId: 'facility-deleted',
          scopeTargetName: null,
          scopeTargetStatus: 'MISSING',
          status: 'EXPIRED',
          startsAt: null,
          endsAt: '2026-01-01T00:00:00.000Z',
        },
      ];
    api.bindings.mockImplementation((_userId, params) => ({
      data: {
        items: params?.status === 'SUSPENDED' ? [] : visibleBindings,
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        total: params?.status === 'SUSPENDED' ? 0 : 42,
      },
      isLoading: false,
    }));
    renderPage();

    expect(screen.queryByTestId('tab-roles')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-member-organization')).not.toBeInTheDocument();
    expect(api.searchOrganizations).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ query: expect.objectContaining({ enabled: false }) }),
    );
    await user.type(screen.getByTestId('input-target-user'), 'Target');
    await user.click(screen.getByTestId('button-search-user'));
    await user.click(await screen.findByTestId('member-result-target-user-org-1'));

    expect(screen.getByTestId('display-rolename-view-only-binding')).toHaveTextContent('PLATFORM_ADMIN');
    expect(screen.getByTestId('display-roleid-view-only-binding')).toHaveTextContent(role.id);
    expect(screen.getByTestId('display-scopename-view-only-binding')).toHaveTextContent('ORGANIZATION: Organization One');
    expect(screen.getByTestId('display-scope-view-only-binding')).toHaveTextContent('Scope ID: None');
    expect(screen.getByTestId('display-scopename-historical-binding')).toHaveTextContent('FACILITY: Missing or historical target');
    expect(screen.getByTestId('display-scope-historical-binding')).toHaveTextContent('Scope ID: facility-deleted');
    expect(screen.getByTestId('binding-page-summary')).toHaveTextContent('Page 1 of 3 · 42 results');
    await user.click(screen.getByTestId('button-binding-next-page'));
    expect(api.bindings).toHaveBeenLastCalledWith(
      member.userId,
      { page: 2, limit: 20 },
      expect.anything(),
    );
    expect(analytics.track).toHaveBeenLastCalledWith('binding_page_navigated', {
      direction: 'next',
      page: 2,
      role_filter: 'ALL',
      status_filter: 'ALL',
    });
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(member.userId);
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(member.organizationId);
    expect(api.listRoles).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ enabled: false }),
    }));
    expect(screen.queryByTestId('button-toggle-suspend-view-only-binding')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('select-binding-role-filter'));
    await user.click(await screen.findByRole('option', { name: 'PLATFORM ADMIN' }));
    expect(api.bindings).toHaveBeenLastCalledWith(
      member.userId,
      { roleCode: 'PLATFORM_ADMIN', page: 1, limit: 20 },
      expect.anything(),
    );
    await user.click(screen.getByTestId('button-binding-next-page'));
    expect(analytics.track).toHaveBeenLastCalledWith('binding_page_navigated', {
      direction: 'next',
      page: 2,
      role_filter: 'PLATFORM_ADMIN',
      status_filter: 'ALL',
    });
    await user.click(screen.getByTestId('button-binding-previous-page'));
    expect(analytics.track).toHaveBeenLastCalledWith('binding_page_navigated', {
      direction: 'previous',
      page: 1,
      role_filter: 'PLATFORM_ADMIN',
      status_filter: 'ALL',
    });

    await user.click(screen.getByTestId('select-binding-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'SUSPENDED' }));
    expect(api.bindings).toHaveBeenLastCalledWith(
      member.userId,
      { roleCode: 'PLATFORM_ADMIN', status: 'SUSPENDED', page: 1, limit: 20 },
      expect.anything(),
    );
    expect(screen.getByText('No bindings match these filters.')).toBeVisible();
    expect(screen.queryByText('No role bindings found for this user.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-new-binding')).not.toBeInTheDocument();
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
      data: { items: [{
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
      }], page: 1, limit: 20, total: 1 },
      isLoading: false,
    });

    cleanup();
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('button-toggle-suspend-self-binding'));
    expect(await screen.findByText('Failed to suspend binding')).toBeVisible();
    expect(screen.getByText('Administrators cannot change their own access binding')).toBeVisible();
  });

  it('announces suspension, expiry, and read-only binding actions clearly', async () => {
    const user = userEvent.setup();
    const revoke = vi.fn((_variables, options) => options.onSuccess());
    api.revokeBinding.mockReturnValue({ mutate: revoke, isPending: false });
    api.bindings.mockReturnValue({
      data: { items: [
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
      ], page: 1, limit: 20, total: 2 },
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
    expect(screen.getByRole('button', { name: 'Reactivate PLATFORM_ADMIN binding' })).toBeEnabled();
    expect(screen.getByTestId('display-status-expired')).toHaveTextContent('EXPIRED');
    expect(screen.getByText(/PLATFORM_ADMIN binding is expired and read-only/)).toHaveClass('sr-only');
    expect(screen.getByTestId('button-toggle-suspend-expired')).toHaveAccessibleName('Suspend PLATFORM_ADMIN binding');
    expect(screen.getByTestId('button-toggle-suspend-expired')).toBeDisabled();
    expect(screen.getByTestId('button-edit-binding-expired')).toHaveAccessibleName('Edit expiry and scope for PLATFORM_ADMIN binding');
    expect(screen.getByTestId('button-edit-binding-expired')).toBeDisabled();
    expect(screen.getByTestId('button-revoke-binding-expired')).toHaveAccessibleName('Permanently revoke PLATFORM_ADMIN binding');
    expect(screen.getByTestId('button-revoke-binding-expired')).toBeDisabled();
  });

  it('supports cancelling and confirming permanent revocation with the keyboard while containing and restoring focus', async () => {
    const user = userEvent.setup();
    const revoke = vi.fn((_variables, options) => options.onSuccess());
    api.revokeBinding.mockReturnValue({ mutate: revoke, isPending: false });
    api.bindings.mockReturnValue({
      data: { items: [{
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
      }], page: 1, limit: 20, total: 1 },
      isLoading: false,
    });
    renderPage();
    await openBindingsForMember(user);

    const trigger = screen.getByRole('button', { name: 'Permanently revoke PLATFORM_ADMIN binding' });
    trigger.focus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('alertdialog', { name: 'Revoke Binding Permanently?' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel permanent revocation of PLATFORM_ADMIN binding' });
    const confirm = within(dialog).getByRole('button', { name: 'Confirm permanent revocation of PLATFORM_ADMIN binding' });
    expect(cancel).toHaveFocus();

    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(revoke).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    const reopenedDialog = screen.getByRole('alertdialog', { name: 'Revoke Binding Permanently?' });
    const reopenedCancel = within(reopenedDialog).getByRole('button', { name: 'Cancel permanent revocation of PLATFORM_ADMIN binding' });
    const reopenedConfirm = within(reopenedDialog).getByRole('button', { name: 'Confirm permanent revocation of PLATFORM_ADMIN binding' });
    expect(reopenedCancel).toHaveFocus();
    await user.tab();
    expect(reopenedConfirm).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(revoke).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps authorization audit details read-only', async () => {
    const user = userEvent.setup();
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