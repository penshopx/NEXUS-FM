import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard';
import Landing from './landing';
import NotFound from './not-found';
import { Profile } from './profile';
import { expectNoHighImpactAccessibilityViolations } from '@/test/accessibility';

const api = vi.hoisted(() => ({
  session: vi.fn(),
  foundationSummary: vi.fn(),
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ isSignedIn: false }),
}));

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>(
    '@workspace/api-client-react',
  );
  return {
    ...actual,
    useGetSession: api.session,
    useGetFoundationSummary: api.foundationSummary,
    getGetFoundationSummaryQueryKey: () => ['foundation-summary'],
  };
});

const session = {
  user: {
    id: 'user-1',
    displayName: 'Morgan Operator',
    email: 'morgan@example.test',
    externalAuthId: 'external-user-1',
  },
  activeOrganization: {
    organization: { id: 'org-1', name: 'Nexus Operations' },
    role: 'PLATFORM_ADMIN',
  },
  memberships: [{
    organization: { id: 'org-1', name: 'Nexus Operations' },
    role: 'PLATFORM_ADMIN',
  }],
};

function renderWithQueryClient(component: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {component}
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe('core page accessibility regressions', () => {
  it.each([
    ['landing page', <Landing />, 'NEXUS-FM'],
    ['not-found page', <NotFound />, '404'],
  ])('has no serious or critical violations on the %s', async (_name, page, visibleText) => {
    render(page);
    expect(screen.getAllByText(new RegExp(visibleText))[0]).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
  });

  it('has no serious or critical violations on the populated dashboard', async () => {
    api.session.mockReturnValue({ data: session, isLoading: false, error: null });
    api.foundationSummary.mockReturnValue({
      data: {
        memberCount: 42,
        canonicalRoleCount: 6,
        currentRole: 'PLATFORM_ADMIN',
        auditStatus: 'ACTIVE',
        authenticationStatus: 'READY',
        organizationContextStatus: 'READY',
        authorizationStatus: 'MINIMUM_RBAC',
      },
      isLoading: false,
      error: null,
    });
    renderWithQueryClient(<Dashboard />);

    expect(screen.getByRole('heading', { name: 'Foundation Status' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
  });

  it('has no serious or critical violations on the populated profile', async () => {
    api.session.mockReturnValue({ data: session, isLoading: false, error: null });
    renderWithQueryClient(<Profile />);

    expect(screen.getByRole('heading', { name: 'Identity & Access' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
  });
});