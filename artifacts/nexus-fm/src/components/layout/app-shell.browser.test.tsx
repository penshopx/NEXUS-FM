import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      data: [
        {
          organization: { id: 'org-1', name: 'Nexus Operations' },
          role: 'PLATFORM_ADMIN',
        },
        {
          organization: { id: 'org-2', name: 'Nexus Facilities' },
          role: 'FACILITY_ADMIN',
        },
      ],
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

  function RoutedShell() {
    const [location, setLocation] = useState('/app');

    return (
      <Router hook={() => [location, setLocation]}>
        <AppShell>
          <h1>Authenticated workspace</h1>
        </AppShell>
      </Router>
    );
  }

  return render(
    <QueryClientProvider client={client}>
      <RoutedShell />
    </QueryClientProvider>,
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

    expect(screen.getByRole('link', { name: 'Dasbor TATABANGUN' })).toBeVisible();
    const organizationSelector = screen.getByRole('button', {
      name: 'Pilih organisasi, organisasi saat ini: Nexus Operations',
    });
    expect(organizationSelector).toHaveAttribute(
      'aria-label',
      'Pilih organisasi, organisasi saat ini: Nexus Operations',
    );
    expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Identitas' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeVisible();

    await expectNoHighImpactAccessibilityViolations();
  });

  it('keeps icon-only controls named with responsive text hidden in the compact state', async () => {
    renderShell();

    // jsdom does not load Tailwind's media queries. Apply the accessibility-tree
    // result of the compact `hidden md:inline-block` / `hidden sm:inline` rules.
    screen.getByText(/tatabangun/i).hidden = true;
    screen.getByText('Keluar').hidden = true;

    const dashboardLink = screen.getByRole('link', { name: 'Dasbor TATABANGUN' });
    expect(dashboardLink).toHaveAttribute('aria-label', 'Dasbor TATABANGUN');

    const organizationSelector = screen.getByRole('button', {
      name: 'Pilih organisasi, organisasi saat ini: Nexus Operations',
    });
    expect(organizationSelector).toHaveAttribute(
      'aria-label',
      'Pilih organisasi, organisasi saat ini: Nexus Operations',
    );

    const signOutButton = screen.getByRole('button', { name: 'Keluar' });
    expect(signOutButton).toHaveAttribute('aria-label', 'Keluar');
    expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();

    await expectNoHighImpactAccessibilityViolations();
  });

  it('keeps organization options named and exposes their selection state in the expanded menu', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', {
      name: 'Pilih organisasi, organisasi saat ini: Nexus Operations',
    }));

    expect(screen.getByRole('menu')).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: 'Nexus Operations' })).toBeChecked();
    expect(screen.getByRole('menuitemradio', { name: 'Nexus Facilities' })).not.toBeChecked();

    await expectNoHighImpactAccessibilityViolations();
  });

  it('moves the current-page state when navigation changes route', async () => {
    const user = userEvent.setup();
    renderShell();

    const dashboardLink = screen.getByRole('link', { name: 'Terminal' });
    const facilitiesLink = screen.getByRole('link', { name: 'Fasilitas' });

    expect(dashboardLink).toHaveAttribute('aria-current', 'page');
    expect(facilitiesLink).not.toHaveAttribute('aria-current');

    await user.click(facilitiesLink);

    expect(dashboardLink).not.toHaveAttribute('aria-current');
    expect(facilitiesLink).toHaveAttribute('aria-current', 'page');
  });
});