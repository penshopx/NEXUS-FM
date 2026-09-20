import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.hoisted(() => vi.fn());

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ userId: 'user-1', isLoaded: true }),
}));

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>(
    '@workspace/api-client-react',
  );
  return {
    ...actual,
    getGetSessionQueryOptions: () => ({
      queryKey: actual.getGetSessionQueryKey(),
      queryFn: getSession,
    }),
  };
});

import { getGetSessionQueryKey } from '@workspace/api-client-react';
import { AuthStateSync } from './auth-state-sync';
import { ORGANIZATION_CONTEXT_STORAGE_KEY } from '@/lib/organization-context';

let visibleOrganizationId = 'org-old';

function MountedAccessConsumer() {
  const session = useQuery({
    queryKey: getGetSessionQueryKey(),
    queryFn: getSession,
  });
  const permissions = useQuery({
    queryKey: ['organization-permissions'],
    queryFn: async () => ({ organizationId: visibleOrganizationId }),
  });

  return (
    <>
      <div data-testid="visible-session-organization">
        {session.data?.activeOrganization?.organization.id}
      </div>
      <div data-testid="visible-permission-organization">
        {permissions.data?.organizationId}
      </div>
    </>
  );
}

describe('AuthStateSync organization context', () => {
  beforeEach(() => {
    getSession.mockReset();
    visibleOrganizationId = 'org-old';
  });

  afterEach(cleanup);

  it('blocks stale access and reloads the server session after another tab switches', async () => {
    let resolveSession!: (session: unknown) => void;
    getSession.mockReturnValue(new Promise((resolve) => {
      resolveSession = resolve;
    }));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(getGetSessionQueryKey(), {
      activeOrganization: {
        organization: { id: 'org-old', name: 'Old Organization' },
      },
    });
    client.setQueryData(['organization-permissions'], { organizationId: 'org-old' });

    render(
      <QueryClientProvider client={client}>
        <AuthStateSync>
          <MountedAccessConsumer />
        </AuthStateSync>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('visible-session-organization')).toHaveTextContent('org-old');
    expect(screen.getByTestId('visible-permission-organization')).toHaveTextContent('org-old');
    visibleOrganizationId = 'org-new';

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: ORGANIZATION_CONTEXT_STORAGE_KEY,
        newValue: JSON.stringify({
          organizationId: 'org-new',
          changedAt: Date.now(),
          nonce: 'other-tab',
        }),
      }));
    });

    expect(screen.getByTestId('organization-context-sync')).toBeVisible();
    expect(screen.queryByTestId('visible-session-organization')).not.toBeInTheDocument();
    expect(screen.queryByTestId('visible-permission-organization')).not.toBeInTheDocument();
    expect(client.getQueryData(['organization-permissions'])).toBeUndefined();

    await act(async () => {
      resolveSession({
        activeOrganization: {
          organization: { id: 'org-new', name: 'New Organization' },
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('organization-context-sync')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('visible-session-organization')).toHaveTextContent('org-new');
    expect(await screen.findByTestId('visible-permission-organization')).toHaveTextContent('org-new');
    expect(document.body).not.toHaveTextContent('org-old');
  });

  it('stays fail-closed when the fresh session cannot be loaded', async () => {
    getSession.mockRejectedValue(new Error('network unavailable'));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <AuthStateSync />
      </QueryClientProvider>,
    );

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: ORGANIZATION_CONTEXT_STORAGE_KEY,
        newValue: '{"organizationId":"org-new"}',
      }));
    });

    expect(await screen.findByText('Organization access could not be refreshed.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload securely' })).toBeVisible();
  });
});