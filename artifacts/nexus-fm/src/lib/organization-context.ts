import type { QueryClient } from '@tanstack/react-query';
import {
  getGetSessionQueryKey,
  type AppSession,
} from '@workspace/api-client-react';

export const ORGANIZATION_CONTEXT_STORAGE_KEY = 'nexus-fm:organization-context';

type OrganizationContextSignal = {
  organizationId: string | null;
  changedAt: number;
  nonce: string;
};

function getActiveOrganizationId(session: AppSession): string | null {
  return session.activeOrganization?.organization.id ?? null;
}

export function clearOrganizationContext(queryClient: QueryClient) {
  queryClient.clear();
}

export function installOrganizationContext(
  queryClient: QueryClient,
  session: AppSession,
) {
  clearOrganizationContext(queryClient);
  queryClient.setQueryData(getGetSessionQueryKey(), session);
}

export function announceOrganizationContext(session: AppSession) {
  if (typeof window === 'undefined') return;

  const signal: OrganizationContextSignal = {
    organizationId: getActiveOrganizationId(session),
    changedAt: Date.now(),
    nonce: crypto.randomUUID(),
  };

  try {
    window.localStorage.setItem(
      ORGANIZATION_CONTEXT_STORAGE_KEY,
      JSON.stringify(signal),
    );
  } catch {
    // The current tab remains safe even when browser storage is unavailable.
  }
}

export function replaceOrganizationContext(
  queryClient: QueryClient,
  session: AppSession,
) {
  installOrganizationContext(queryClient, session);
  announceOrganizationContext(session);
}