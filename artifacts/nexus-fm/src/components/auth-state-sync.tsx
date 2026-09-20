import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSessionQueryOptions,
  type AppSession,
} from '@workspace/api-client-react';
import {
  clearOrganizationContext,
  installOrganizationContext,
  ORGANIZATION_CONTEXT_STORAGE_KEY,
} from '@/lib/organization-context';

export function AuthStateSync({ children }: { children?: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const previousUserId = useRef(userId);
  const syncSequence = useRef(0);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'failed'>('idle');

  useEffect(() => {
    if (isLoaded && previousUserId.current !== userId) {
      if (previousUserId.current) {
        clearOrganizationContext(queryClient);
      }
      previousUserId.current = userId;
    }
  }, [userId, isLoaded, queryClient]);

  useEffect(() => {
    if (!isLoaded || !userId) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ORGANIZATION_CONTEXT_STORAGE_KEY || !event.newValue) return;

      const sequence = ++syncSequence.current;

      // Remove every organization-scoped query before yielding back to the UI.
      // This also cancels observers for requests started in the old context.
      clearOrganizationContext(queryClient);
      setSyncState('syncing');

      void queryClient
        .fetchQuery({
          ...getGetSessionQueryOptions(),
          staleTime: 0,
        })
        .then((session) => {
          if (sequence !== syncSequence.current) return;
          installOrganizationContext(queryClient, session as AppSession);
          setSyncState('idle');
        })
        .catch(() => {
          if (sequence === syncSequence.current) setSyncState('failed');
        });
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isLoaded, userId, queryClient]);

  if (syncState === 'idle') return children ?? null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      role="status"
      aria-live="assertive"
      data-testid="organization-context-sync"
    >
      <div className="max-w-sm px-6 text-center">
        <p className="font-mono text-sm font-semibold text-foreground">
          {syncState === 'syncing'
            ? 'Updating organization access…'
            : 'Organization access could not be refreshed.'}
        </p>
        {syncState === 'failed' && (
          <button
            type="button"
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Reload securely
          </button>
        )}
      </div>
    </div>
  );
}
