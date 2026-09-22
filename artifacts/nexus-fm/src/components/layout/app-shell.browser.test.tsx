import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoHighImpactAccessibilityViolations } from '@/test/accessibility';
import { AppShell } from './app-shell';

const clerk = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

const api = vi.hoisted(() => ({
  selectOrganization: vi.fn(),
}));

vi.mock('@clerk/react', () => ({
  useClerk: () => ({ signOut: clerk.signOut }),
}));

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>(
    '@workspace/api-client-react',
  );
  return {
    ...actual,
    useGetSession: () => ({
      data: {
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
        memberships: [],
      },
      isLoading: false,
    }),
    useListOrganizations: () => ({
      data: [{
        organization: { id: 'org-1', name: 'Nexus Operations' },
        role: 'PLATFORM_ADMIN',
      }],
      isLoading: false,
    }),
    useSelectOrganization: () => ({
      mutate: api.selectOrganization,
      isPending: false,
    }),
    useGetMyPermissions: () => ({
      data: {
        organizationId: 'org-1',
        permissions: [{
          code: 'ROLE.MANAGE',
          effect: 'ALLOW',
          scopeType: 'ORGANIZATION',
        }],
      },
    }),
  };
});

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <Router hook={() => ['/app', vi.fn()]}>
      <QueryClientProvider client={client}>
        <AppShell>
          <h1>Authenticated workspace</h1>
        </AppShell>
      </QueryClientProvider>
    </Router>,
  );
}

describe('authenticated AppShell accessibility regressions', () => {
  beforeEach(() => {
    clerk.signOut.mockReset();
    api.selectOrganization.mockReset();
  });

  afterEach(cleanup);

  it('has named controls and no high-impact violations in the desktop state', async () => {
    renderShell();

    expect(screen.getByRole('link', { name: 'NEXUS-FM dashboard' })).toBeVisible();
    const organizationSelector = screen.getByRole('button', {
      name: 'Select organization, current organization: Nexus Operations',
    });
    expect(organizationSelector).toHaveAttribute(
      'aria-label',
      'Select organization, current organization: Nexus Operations',
    );
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Identity & Access' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();

    await expectNoHighImpactAccessibilityViolations();
  });

  it('keeps icon-only controls named with responsive text hidden in the compact state', async () => {
    renderShell();

    // jsdom does not load Tailwind's media queries. Apply the accessibility-tree
    // result of the compact `hidden md:inline-block` / `hidden sm:inline` rules.
    screen.getByText('NEXUS-FM').hidden = true;
    screen.getByText('Sign out').hidden = true;

    const dashboardLink = screen.getByRole('link', { name: 'NEXUS-FM dashboard' });
    expect(dashboardLink).toHaveAttribute('aria-label', 'NEXUS-FM dashboard');

    const organizationSelector = screen.getByRole('button', {
      name: 'Select organization, current organization: Nexus Operations',
    });
    expect(organizationSelector).toHaveAttribute(
      'aria-label',
      'Select organization, current organization: Nexus Operations',
    );

    const signOutButton = screen.getByRole('button', { name: 'Sign out' });
    expect(signOutButton).toHaveAttribute('aria-label', 'Sign out');
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();

    await expectNoHighImpactAccessibilityViolations();
  });
});