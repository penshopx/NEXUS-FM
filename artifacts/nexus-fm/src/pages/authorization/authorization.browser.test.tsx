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
  exportBindings: vi.fn(),
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
  exportUserRoleBindings: api.exportBindings,
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
    api.exportBindings.mockResolvedValue('role,status\nPLATFORM_ADMIN,ACTIVE');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:access-review'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    delete window.umami;
    window.history.replaceState(null, '', '/authorization');
    vi.restoreAllMocks();
  });

  it('lets an authorized administrator open every permitted tab', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId('tab-roles')).toHaveAttribute('data-state', 'active');
    await user.click(screen.getByTestId('tab-bindings'));
    expect(screen.getByText('Cari anggota')).toBeVisible();
    await user.click(screen.getByTestId('tab-audit'));
    expect(screen.getByText(/Catatan audit tidak dapat diubah/)).toBeVisible();
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
    expect(screen.getByRole('dialog', { name: 'Buat Penetapan Peran' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('button-edit-binding-active'));
    expect(screen.getByRole('dialog', { name: 'Ubah Penetapan Peran' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('button-revoke-binding-active'));
    expect(screen.getByRole('alertdialog', { name: 'Cabut Penetapan Secara Permanen?' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('tab-audit'));
    await expectNoHighImpactAccessibilityViolations();

    await user.click(await screen.findByTestId('button-audit-details-audit-1'));
    expect(screen.getByRole('dialog', { name: 'Detail Catatan Audit' })).toBeVisible();
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
      'Organisasi Acme Facilities (acme-facilities)',
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

    expect(screen.getByText('Target hilang atau historis')).toBeVisible();
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

    await user.click(screen.getByRole('button', { name: 'Lanjutkan mengedit' }));
    expect(screen.getByRole('dialog', { name: 'Ubah Penetapan Peran' })).toBeVisible();
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
    const replace = vi.spyOn(window.history, 'replaceState');

    renderPage();

    expect(await screen.findByTestId('tab-bindings')).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('input-target-user')).toHaveValue('Target');
    expect(screen.getByTestId('button-member-organization')).toHaveTextContent('Acme Facilities');
    expect(api.searchMembers).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: 'Target', organizationId: 'org-2', page: 2 }),
      expect.anything(),
    );
    expect(screen.queryByTestId('member-review-url-repaired')).not.toBeInTheDocument();
    expect(window.location.search).toBe(
      '?query=Target&organizationId=org-2&organizationName=Acme+Facilities&organizationSlug=acme-facilities&page=2',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'a malformed page',
      search: 'query=Target&page=not-a-page&other=keep&other=also',
      expected: 'query=Target&other=keep&other=also',
      sensitiveValues: ['not-a-page'],
    },
    {
      name: 'an out-of-range page',
      search: 'query=Target&page=9007199254740992&other=keep&other=also',
      expected: 'query=Target&other=keep&other=also',
      sensitiveValues: ['9007199254740992'],
    },
    {
      name: 'incomplete organization metadata with an ID',
      search: 'query=Target&organizationId=private-org&organizationName=+&other=keep&other=also',
      expected: 'query=Target&organizationId=private-org&organizationName=private-org&other=keep&other=also&organizationSlug=private-org',
      sensitiveValues: ['private-org'],
    },
    {
      name: 'orphaned organization metadata',
      search: 'query=Target&organizationName=Orphan&organizationSlug=orphan&other=keep&other=also',
      expected: 'query=Target&other=keep&other=also',
      sensitiveValues: ['Orphan'],
    },
    {
      name: 'an incomplete member selection',
      search: 'query=Target&memberId=private-member&other=keep&other=also',
      expected: 'query=Target&other=keep&other=also',
      sensitiveValues: ['private-member'],
    },
    {
      name: 'an orphaned member organization',
      search: 'query=Target&memberOrganizationId=private-org&other=keep&other=also',
      expected: 'query=Target&other=keep&other=also',
      sensitiveValues: ['private-org'],
    },
  ])('repairs and explains an old access-review link with $name', async ({ search, expected, sensitiveValues }) => {
    window.history.replaceState(null, '', `/authorization?${search}`);
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');

    renderPage();

    await waitFor(() => expect(window.location.search).toBe(`?${expected}`));
    const notice = screen.getByTestId('member-review-url-repaired');
    expect(notice).toHaveTextContent(
      'Beberapa detail tautan tersimpan tidak valid atau tidak lengkap',
    );
    expect(replace).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    for (const sensitiveValue of sensitiveValues) {
      expect(notice).not.toHaveTextContent(sensitiveValue);
    }
  });

  it('keeps the previous history entry when repairing a saved link', async () => {
    window.history.replaceState(null, '', '/authorization?query=Earlier');
    window.history.pushState(null, '', '/authorization?query=Target&page=0&memberId=orphan');
    renderPage();

    await waitFor(() => expect(window.location.search).toBe('?query=Target'));
    window.history.back();
    await waitFor(() => expect(window.location.search).toBe('?query=Earlier'));
    expect(screen.getByTestId('input-target-user')).toHaveValue('Earlier');
  });

  it('bookmarks and restores an authorized selected member from the URL', async () => {
    const user = userEvent.setup();
    renderPage();

    await openBindingsForMember(user);

    expect(window.location.search).toContain('memberId=target-user');
    expect(window.location.search).toContain('memberOrganizationId=org-1');
    expect(screen.getByText('Penetapan Peran untuk Target Admin')).toBeVisible();

    cleanup();
    window.history.replaceState(
      null,
      '',
      '/authorization?query=Target&memberId=target-user&memberOrganizationId=org-1',
    );
    renderPage();

    expect(await screen.findByText('Penetapan Peran untuk Target Admin')).toBeVisible();
    expect(api.bindings).toHaveBeenLastCalledWith(
      'target-user',
      { page: 1, limit: 20 },
      expect.anything(),
    );
  });

  it('shows a generic notice for an unavailable bookmarked member and lets it be cleared', async () => {
    const user = userEvent.setup();
    let memberSearchState = {
      data: { items: [member], page: 1, limit: 20, total: 1 },
      isFetching: false,
      isError: false,
    };
    api.searchMembers.mockImplementation(() => memberSearchState);
    window.history.replaceState(
      null,
      '',
      '/authorization?query=Target&memberId=unauthorized-user&memberOrganizationId=org-secret',
    );
    renderPage();

    expect(await screen.findByTestId('member-search-results')).toBeVisible();
    expect(screen.getByTestId('saved-member-unavailable')).toHaveTextContent(
      'Pilihan anggota tersimpan ini tidak lagi tersedia.',
    );
    expect(screen.getByTestId('saved-member-unavailable')).not.toHaveTextContent('unauthorized-user');
    expect(screen.getByTestId('saved-member-unavailable')).not.toHaveTextContent('org-secret');
    expect(screen.queryByText(/Penetapan Peran untuk/)).not.toBeInTheDocument();
    expect(api.bindings).not.toHaveBeenCalled();
    await waitFor(() => expect(analytics.track).toHaveBeenCalledWith(
      'saved_member_unavailable_shown',
      undefined,
    ));

    memberSearchState = { ...memberSearchState, isFetching: true };
    await user.type(screen.getByTestId('input-target-user'), ' loading');

    expect(screen.queryByTestId('saved-member-unavailable')).not.toBeInTheDocument();
    expect(analytics.track).toHaveBeenCalledTimes(1);

    memberSearchState = { ...memberSearchState, isFetching: false };
    await user.type(screen.getByTestId('input-target-user'), ' restored');

    expect(screen.getByTestId('saved-member-unavailable')).toBeVisible();
    expect(analytics.track).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('button-clear-unavailable-member'));

    expect(screen.queryByTestId('saved-member-unavailable')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?query=Target');
    expect(screen.getByTestId('member-search-results')).toBeVisible();
    expect(analytics.track).toHaveBeenNthCalledWith(
      2,
      'saved_member_unavailable_cleared',
      undefined,
    );
    expect(analytics.track).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('unauthorized-user');
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('org-secret');
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('Target');
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
    expect(screen.getByText('Penetapan Peran untuk Second Admin')).toBeVisible();

    window.history.back();
    await waitFor(() => expect(screen.getByText('Penetapan Peran untuk Target Admin')).toBeVisible());

    window.history.forward();
    await waitFor(() => expect(screen.getByText('Penetapan Peran untuk Second Admin')).toBeVisible());
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
    expect(screen.getByText('Penetapan Peran untuk Target Admin')).toBeVisible();

    await user.click(screen.getByTestId('button-clear-member-search'));

    expect(screen.getByTestId('input-target-user')).toHaveValue('');
    expect(screen.getByTestId('button-member-organization')).toHaveTextContent('Semua organisasi');
    expect(screen.queryByTestId('member-search-results')).not.toBeInTheDocument();
    expect(screen.queryByText('Penetapan Peran untuk Target Admin')).not.toBeInTheDocument();
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
    expect(analytics.track).toHaveBeenCalledOnce();
  });

  it('tracks a successful member search submitted after a reset without private search data', async () => {
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      '',
      '/authorization?query=Target&organizationId=org-2&organizationName=Acme+Facilities&organizationSlug=acme-facilities&page=2',
    );
    api.searchMembers.mockReturnValue({
      data: { items: [member], page: 1, limit: 20, total: 1 },
      isFetching: false,
      isError: false,
    });
    renderPage();

    await user.click(screen.getByTestId('button-clear-member-search'));
    await user.type(screen.getByTestId('input-target-user'), 'Recovered Admin');
    await user.click(screen.getByTestId('button-search-user'));

    await waitFor(() => expect(analytics.track).toHaveBeenCalledTimes(2));
    expect(analytics.track).toHaveBeenLastCalledWith('member_search_after_reset', {
      reset_had_pagination: true,
      reset_had_organization_filter: true,
      has_organization_filter: false,
      result: 'matches',
    });

    const analyticsPayload = JSON.stringify(analytics.track.mock.calls);
    expect(analyticsPayload).not.toContain('Recovered Admin');
    expect(analyticsPayload).not.toContain('Target');
    expect(analyticsPayload).not.toContain('org-2');
    expect(analyticsPayload).not.toContain('Acme Facilities');
  });

  it('waits for the submitted recovery search to succeed and categorizes an empty result', async () => {
    const user = userEvent.setup();
    let recoveryState: 'loading' | 'success' = 'loading';
    api.searchMembers.mockImplementation((params) => {
      if (params.query === 'Recovered Admin') {
        return recoveryState === 'loading'
          ? { data: undefined, isFetching: true, isError: false }
          : {
              data: { items: [], page: 1, limit: 20, total: 0 },
              isFetching: false,
              isError: false,
            };
      }
      return {
        data: { items: [member], page: 1, limit: 20, total: 1 },
        isFetching: false,
        isError: false,
      };
    });
    window.history.replaceState(null, '', '/authorization?query=Target');
    const rendered = renderPage();

    await user.click(screen.getByTestId('button-clear-member-search'));
    await user.type(screen.getByTestId('input-target-user'), 'Recovered Admin');
    await user.click(screen.getByTestId('button-search-user'));
    expect(analytics.track).toHaveBeenCalledOnce();

    recoveryState = 'success';
    rendered.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AuthorizationPage />
        <Toaster />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(analytics.track).toHaveBeenCalledTimes(2));
    expect(analytics.track).toHaveBeenLastCalledWith('member_search_after_reset', {
      reset_had_pagination: false,
      reset_had_organization_filter: false,
      has_organization_filter: false,
      result: 'no_matches',
    });
  });

  it('does not let navigation or refetch consume a failed recovery submission', async () => {
    const user = userEvent.setup();
    api.searchMembers.mockImplementation((params) => ({
      data: params.query === 'Recovered Admin'
        ? undefined
        : { items: [member], page: 1, limit: 20, total: 1 },
      isFetching: false,
      isError: params.query === 'Recovered Admin',
    }));
    window.history.replaceState(null, '', '/authorization?query=Target');
    renderPage();

    await user.click(screen.getByTestId('button-clear-member-search'));
    await user.type(screen.getByTestId('input-target-user'), 'Recovered Admin');
    await user.click(screen.getByTestId('button-search-user'));
    expect(analytics.track).toHaveBeenCalledOnce();

    window.history.back();
    await waitFor(() => expect(window.location.search).toBe(''));
    window.history.back();
    await waitFor(() => expect(window.location.search).toContain('query=Target'));
    await waitFor(() => expect(screen.getByTestId('member-search-results')).toBeVisible());
    expect(analytics.track).toHaveBeenCalledOnce();
  });

  it.each([
    {
      analyticsState: 'no injected tracker',
      configureAnalytics: () => {
        delete window.umami;
      },
    },
    {
      analyticsState: 'a tracker that throws',
      configureAnalytics: () => {
        analytics.track.mockImplementation(() => {
          throw new Error('analytics unavailable');
        });
      },
    },
  ])('clears every member-search state with $analyticsState', async ({ configureAnalytics }) => {
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
    configureAnalytics();
    renderPage();

    await user.click(await screen.findByTestId('member-result-target-user-org-1'));
    expect(screen.getByRole('heading', { name: /Target Admin/ })).toBeVisible();
    expect(window.location.search).toContain('memberId=target-user');
    expect(window.location.search).toContain('memberOrganizationId=org-1');

    await user.click(screen.getByTestId('button-clear-member-search'));

    expect(screen.getByTestId('input-target-user')).toHaveValue('');
    expect(screen.getByTestId('button-member-organization')).not.toHaveTextContent('Acme Facilities');
    expect(screen.queryByTestId('member-search-results')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Target Admin/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-clear-member-search')).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('renders the in-app 403 state when no administration permission is granted', async () => {
    api.myPermissions.mockReturnValue({
      data: { organizationId: 'org-1', permissions: [] },
      isLoading: false,
    });
    renderPage();

    expect(await screen.findByTestId('auth-gate-denied')).toHaveTextContent('Akses ditolak');
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
          scopeTargetParentPath: [],
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
          scopeTargetParentPath: [],
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
    expect(screen.getByTestId('display-scopename-view-only-binding')).toHaveTextContent('Organisasi: Organization One');
    expect(screen.getByTestId('display-scope-view-only-binding')).toHaveTextContent('ID Cakupan: Tidak ada');
    expect(screen.getByTestId('display-scopename-historical-binding')).toHaveTextContent('Fasilitas: Target hilang atau historis');
    expect(screen.getByTestId('display-scope-historical-binding')).toHaveTextContent('ID Cakupan: facility-deleted');
    expect(screen.getByTestId('binding-page-summary')).toHaveTextContent('Halaman 1 dari 3 · 42 hasil');
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
    await user.click(await screen.findByRole('option', { name: 'Platform Administrator' }));
    expect(api.bindings).toHaveBeenLastCalledWith(
      member.userId,
      { roleCode: 'PLATFORM_ADMIN', page: 1, limit: 20 },
      expect.anything(),
    );
    expect(analytics.track).toHaveBeenLastCalledWith('binding_filters_applied', {
      role_filter: 'PLATFORM_ADMIN',
      status_filter: 'ALL',
      result_count_bucket: '21_100',
    });
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
    await user.click(await screen.findByRole('option', { name: 'Ditangguhkan' }));
    expect(api.bindings).toHaveBeenLastCalledWith(
      member.userId,
      { roleCode: 'PLATFORM_ADMIN', status: 'SUSPENDED', page: 1, limit: 20 },
      expect.anything(),
    );
    expect(analytics.track).toHaveBeenLastCalledWith('binding_filters_applied', {
      role_filter: 'PLATFORM_ADMIN',
      status_filter: 'SUSPENDED',
      result_count_bucket: 'no_matches',
    });
    expect(screen.getByText('Tidak ada penetapan yang cocok dengan filter ini.')).toBeVisible();
    await user.click(screen.getByTestId('button-clear-binding-filters'));
    expect(analytics.track).toHaveBeenLastCalledWith('binding_filters_cleared', {
      role_filter: 'ALL',
      status_filter: 'ALL',
      result_count_bucket: '21_100',
    });
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(member.userId);
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain(member.organizationId);
    expect(screen.queryByText('Tidak ada penetapan peran untuk pengguna ini.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-new-binding')).not.toBeInTheDocument();
  });

  it('returns to the last valid binding page when the final item disappears', async () => {
    const user = userEvent.setup();
    const filteredBinding = {
      id: 'filtered-binding',
      userId: member.userId,
      roleId: role.id,
      roleCode: role.code,
      version: 'filtered-binding-version',
      organizationId: member.organizationId,
      scopeType: 'ORGANIZATION',
      scopeId: null,
      scopeTargetName: member.organizationName,
      scopeTargetStatus: 'RESOLVED',
      scopeTargetParentPath: [],
      status: 'ACTIVE',
      startsAt: null,
      endsAt: null,
    };

    api.bindings.mockImplementation((_userId, params) => {
      const page = params?.page ?? 1;
      const filtersApplied = params?.roleCode === 'PLATFORM_ADMIN' && params?.status === 'ACTIVE';

      if (!filtersApplied) {
        return {
          data: { items: [filteredBinding], page, limit: 20, total: 21 },
          isLoading: false,
        };
      }

      return {
        data: {
          items: page === 1 ? [filteredBinding] : [],
          page,
          limit: 20,
          total: page === 1 ? 21 : 20,
        },
        isLoading: false,
      };
    });

    renderPage();
    await openBindingsForMember(user);

    await user.click(screen.getByTestId('select-binding-role-filter'));
    await user.click(await screen.findByRole('option', { name: 'Platform Administrator' }));
    await user.click(screen.getByTestId('select-binding-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Aktif' }));

    expect(screen.getByTestId('binding-page-summary')).toHaveTextContent('Halaman 1 dari 2 · 21 hasil');

    await user.click(screen.getByTestId('button-binding-next-page'));

    await waitFor(() => {
      expect(api.bindings).toHaveBeenLastCalledWith(
        member.userId,
        {
          roleCode: 'PLATFORM_ADMIN',
          status: 'ACTIVE',
          page: 1,
          limit: 20,
        },
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(analytics.track).toHaveBeenCalledWith('binding_page_recovered', {
        previous_page: 2,
        recovered_page: 1,
        role_filter: 'PLATFORM_ADMIN',
        status_filter: 'ACTIVE',
      });
    });
    expect(
      analytics.track.mock.calls.filter(([event]) => event === 'binding_page_recovered'),
    ).toHaveLength(1);
    const recoveryCall = JSON.stringify(
      analytics.track.mock.calls.find(([event]) => event === 'binding_page_recovered'),
    );
    expect(recoveryCall).not.toContain(member.userId);
    expect(recoveryCall).not.toContain(member.organizationId);
    expect(screen.getByTestId('binding-page-summary')).toHaveTextContent('Halaman 1 dari 2 · 21 hasil');
    expect(screen.getByTestId('button-binding-previous-page')).toBeDisabled();
    expect(screen.getByTestId('button-binding-next-page')).toBeEnabled();
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
    expect(await screen.findByText(/Pembaruan Bersamaan Terdeteksi/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Muat Ulang Kebijakan Terbaru' }));
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
    expect(await screen.findByText('Gagal menangguhkan penetapan')).toBeVisible();
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

    expect(screen.getByTestId('display-status-suspended')).toHaveTextContent('Ditangguhkan');
    expect(screen.getByRole('button', { name: 'Aktifkan kembali PLATFORM_ADMIN binding' })).toBeEnabled();
    expect(screen.getByTestId('display-status-expired')).toHaveTextContent('Kedaluwarsa');
    expect(screen.getByText(/PLATFORM_ADMIN binding kedaluwarsa dan hanya dapat dibaca/)).toHaveClass('sr-only');
    expect(screen.getByTestId('button-toggle-suspend-expired')).toHaveAccessibleName('Tangguhkan PLATFORM_ADMIN binding');
    expect(screen.getByTestId('button-toggle-suspend-expired')).toBeDisabled();
    expect(screen.getByTestId('button-edit-binding-expired')).toHaveAccessibleName('Ubah masa berlaku dan cakupan PLATFORM_ADMIN binding');
    expect(screen.getByTestId('button-edit-binding-expired')).toBeDisabled();
    expect(screen.getByTestId('button-revoke-binding-expired')).toHaveAccessibleName('Cabut permanen PLATFORM_ADMIN binding');
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

    const trigger = screen.getByRole('button', { name: 'Cabut permanen PLATFORM_ADMIN binding' });
    trigger.focus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('alertdialog', { name: 'Cabut Penetapan Secara Permanen?' });
    const cancel = within(dialog).getByRole('button', { name: 'Batalkan pencabutan permanen PLATFORM_ADMIN binding' });
    const confirm = within(dialog).getByRole('button', { name: 'Konfirmasi pencabutan permanen PLATFORM_ADMIN binding' });
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
    const reopenedDialog = screen.getByRole('alertdialog', { name: 'Cabut Penetapan Secara Permanen?' });
    const reopenedCancel = within(reopenedDialog).getByRole('button', { name: 'Batalkan pencabutan permanen PLATFORM_ADMIN binding' });
    const reopenedConfirm = within(reopenedDialog).getByRole('button', { name: 'Konfirmasi pencabutan permanen PLATFORM_ADMIN binding' });
    expect(reopenedCancel).toHaveFocus();
    await user.tab();
    expect(reopenedConfirm).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(revoke).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('tracks a successful access-review export with boolean filter dimensions only', async () => {
    const user = userEvent.setup();
    renderPage();
    await openBindingsForMember(user);
    await user.click(screen.getByTestId('select-binding-role-filter'));
    await user.click(await screen.findByRole('option', { name: 'Platform Administrator' }));
    await user.click(screen.getByTestId('select-binding-status-filter'));
    await user.click(await screen.findByRole('option', { name: 'Ditangguhkan' }));
    analytics.track.mockClear();

    await user.click(screen.getByTestId('button-export-bindings'));

    await waitFor(() => expect(api.exportBindings).toHaveBeenCalledWith(member.userId, {
      roleCode: 'PLATFORM_ADMIN',
      status: 'SUSPENDED',
    }));
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:access-review');
    expect(await screen.findByText('Access review exported')).toBeVisible();
    expect(analytics.track).toHaveBeenCalledOnce();
    expect(analytics.track).toHaveBeenCalledWith('access_review_export', {
      outcome: 'success',
      role_filter_active: true,
      status_filter_active: true,
    });

    const payload = JSON.stringify(analytics.track.mock.calls);
    for (const privateValue of [
      member.userId,
      member.displayName,
      member.email,
      'PLATFORM_ADMIN',
      'SUSPENDED',
    ]) {
      expect(payload).not.toContain(privateValue);
    }
  });

  it('tracks a failed access-review export without private values or server error text', async () => {
    const user = userEvent.setup();
    const serverError = 'Export denied for target@example.test and target-user';
    api.exportBindings.mockRejectedValue({ data: { error: serverError } });
    renderPage();
    await openBindingsForMember(user);
    analytics.track.mockClear();

    await user.click(screen.getByTestId('button-export-bindings'));

    expect(await screen.findByText('Failed to export access review')).toBeVisible();
    expect(screen.getByText(serverError)).toBeVisible();
    expect(analytics.track).toHaveBeenCalledOnce();
    expect(analytics.track).toHaveBeenCalledWith('access_review_export', {
      outcome: 'failure',
      role_filter_active: false,
      status_filter_active: false,
    });

    const payload = JSON.stringify(analytics.track.mock.calls);
    for (const privateValue of [
      member.userId,
      member.displayName,
      member.email,
      role.code,
      'ACTIVE',
      serverError,
    ]) {
      expect(payload).not.toContain(privateValue);
    }
  });

  it('completes and confirms an access-review download when analytics throws', async () => {
    const user = userEvent.setup();
    analytics.track.mockImplementation(() => {
      throw new Error('analytics unavailable');
    });
    renderPage();
    await openBindingsForMember(user);

    await user.click(screen.getByTestId('button-export-bindings'));

    await waitFor(() => expect(api.exportBindings).toHaveBeenCalledOnce());
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:access-review');
    expect(await screen.findByText('Access review exported')).toBeVisible();
    expect(screen.getByTestId('button-export-bindings')).toBeEnabled();
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
    expect(within(details).getByText('Detail Catatan Audit')).toBeVisible();
    expect(within(details).getByText('ROLE_REVOKED')).toBeVisible();
    expect(within(details).getByText(/"status": "REVOKED"/)).toBeVisible();
    expect(within(details).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: /save|edit|delete/i })).not.toBeInTheDocument();
  });
});