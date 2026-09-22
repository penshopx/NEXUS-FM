import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetSessionQueryOptions,
  getGetMyAccessRevisionQueryOptions,
  getGetMyPermissionsQueryOptions,
  getGetMyScopeQueryOptions,
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
  const accessRevision = useRef<string | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'failed'>('idle');

  const refreshAuthorization = useCallback(async (force = false) => {
    const sequence = ++syncSequence.current;
    setSyncState('syncing');

    try {
      const revision = await queryClient.fetchQuery({
        ...getGetMyAccessRevisionQueryOptions(),
        staleTime: 0,
      });
      if (!force && accessRevision.current === null) {
        accessRevision.current = revision.revision;
        if (sequence === syncSequence.current) setSyncState('idle');
        return;
      }
      if (!force && accessRevision.current === revision.revision) {
        if (sequence === syncSequence.current) setSyncState('idle');
        return;
      }

      clearOrganizationContext(queryClient);
      const session = await queryClient.fetchQuery({
        ...getGetSessionQueryOptions(),
        staleTime: 0,
      });
      if (sequence !== syncSequence.current) return;

      installOrganizationContext(queryClient, session as AppSession);
      await Promise.all([
        queryClient.fetchQuery({ ...getGetMyAccessRevisionQueryOptions(), staleTime: 0 }),
        queryClient.fetchQuery({ ...getGetMyPermissionsQueryOptions(), staleTime: 0 }),
        queryClient.fetchQuery({ ...getGetMyScopeQueryOptions(), staleTime: 0 }),
      ]);
      if (sequence !== syncSequence.current) return;
      accessRevision.current = revision.revision;
      setSyncState('idle');
    } catch {
      if (sequence === syncSequence.current) setSyncState('failed');
    }
  }, [queryClient]);

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
      clearOrganizationContext(queryClient);
      accessRevision.current = null;
      void refreshAuthorization(true);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isLoaded, userId, queryClient, refreshAuthorization]);

  useEffect(() => {
    if (!isLoaded || !userId) return;

    void refreshAuthorization();
    const eventSource = typeof EventSource === 'undefined'
      ? null
      : new EventSource('/api/me/access-revision/events', { withCredentials: true });
    eventSource?.addEventListener('access-revision', () => {
      clearOrganizationContext(queryClient);
      void refreshAuthorization(true);
    });
    eventSource?.addEventListener('open', () => void refreshAuthorization());

    const recheck = () => void refreshAuthorization();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('online', recheck);
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      eventSource?.close();
      window.removeEventListener('online', recheck);
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isLoaded, userId, queryClient, refreshAuthorization]);

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
            ? 'Memperbarui akses organisasi…'
            : 'Akses organisasi tidak dapat diperbarui.'}
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
