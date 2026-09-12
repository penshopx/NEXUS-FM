import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';

export function AuthStateSync() {
  const { userId, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const previousUserId = useRef(userId);

  useEffect(() => {
    if (isLoaded && previousUserId.current !== userId) {
      if (previousUserId.current) {
        queryClient.clear();
      }
      previousUserId.current = userId;
    }
  }, [userId, isLoaded, queryClient]);

  return null;
}
