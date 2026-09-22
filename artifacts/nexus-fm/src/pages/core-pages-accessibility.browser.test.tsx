import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index.css';
import { Dashboard } from './dashboard';
import Landing from './landing';
import NotFound from './not-found';
import { Profile } from './profile';
import { expectNoHighImpactColorContrastViolations } from '@/test/accessibility';

const api = vi.hoisted(() => ({
  session: vi.fn(),
  foundationSummary: vi.fn(),
  listFacilities: vi.fn(),
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
    useListFacilities: api.listFacilities,
    getListFacilitiesQueryKey: () => ['facilities'],
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
      <ProductionPage>{component}</ProductionPage>
    </QueryClientProvider>,
  );
}

function ProductionPage({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-screen"
      data-testid="production-page-root"
      style={{
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
      }}
    >
      {children}
    </main>
  );
}

beforeEach(() => {
  document.documentElement.className = '';
  document.body.className = '';
});

afterEach(() => cleanup());

describe('core page color contrast regressions', () => {
  it('fails a known unreadable color combination', async () => {
    render(
      <p style={{ backgroundColor: '#ffffff', color: '#aaaaaa' }}>
        Deliberately unreadable control
      </p>,
    );

    let failure: unknown;
    try {
      await expectNoHighImpactColorContrastViolations();
    } catch (error) {
      failure = error;
    }

    expect(String(failure)).toContain('color-contrast');
  });

  it.each([
    ['landing page', <Landing />, 'TATABANGUN'],
    ['not-found page', <NotFound />, '404'],
  ])('has no serious or critical contrast violations on the %s', async (_name, page, visibleText) => {
    render(<ProductionPage>{page}</ProductionPage>);
    expect(screen.getAllByText(new RegExp(visibleText))[0]).toBeVisible();
    await expectNoHighImpactColorContrastViolations();
  });

  it('has no serious or critical contrast violations on the populated dashboard', async () => {
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
    api.listFacilities.mockReturnValue({
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 6,
        nextCursor: null,
        collectionCapabilities: { create: false },
      },
      isLoading: false,
      error: null,
    });
    renderWithQueryClient(<Dashboard />);

    expect(screen.getByRole('heading', { name: 'Terminal Operasional' })).toBeVisible();
    const pageRoot = screen.getByTestId('production-page-root');
    const readyStatus = screen.getByTestId('status-autentikasi');
    const tokenProbe = document.createElement('span');
    tokenProbe.style.backgroundColor = 'hsl(var(--background))';
    tokenProbe.style.color = 'hsl(var(--foreground))';
    pageRoot.append(tokenProbe);

    expect(document.documentElement.className).toBe('');
    expect(document.body.className).toBe('');
    expect(getComputedStyle(pageRoot).backgroundColor).toBe(
      getComputedStyle(tokenProbe).backgroundColor,
    );
    expect(getComputedStyle(readyStatus).color).toBe(getComputedStyle(tokenProbe).color);
    await expectNoHighImpactColorContrastViolations();
  });

  it('has no serious or critical contrast violations on the populated profile', async () => {
    api.session.mockReturnValue({ data: session, isLoading: false, error: null });
    renderWithQueryClient(<Profile />);

    expect(screen.getByRole('heading', { name: 'Identitas & Akses' })).toBeVisible();
    await expectNoHighImpactColorContrastViolations();
  });
});
