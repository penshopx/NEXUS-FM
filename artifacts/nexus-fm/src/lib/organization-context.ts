import type { QueryClient } from '@tanstack/react-query';
import {
  getGetSessionQueryKey,
  type AppSession,
} from '@workspace/api-client-react';

export function replaceOrganizationContext(
  queryClient: QueryClient,
  session: AppSession,
) {
  queryClient.clear();
  queryClient.setQueryData(getGetSessionQueryKey(), session);
}