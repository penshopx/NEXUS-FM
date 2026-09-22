import { ReactNode } from 'react';
import { useGetMyPermissions } from '@workspace/api-client-react';
import { ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface AuthGateProps {
  children: ReactNode;
  anyOf: string[];
}

export function AuthGate({ children, anyOf }: AuthGateProps) {
  const { data: myPermissions, isLoading } = useGetMyPermissions();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const checkAccess = () => {
    if (!myPermissions) return false;
    
    for (const permCode of anyOf) {
      const grants = myPermissions.permissions.filter(p => p.code === permCode);
      const isDenied = grants.some(g => g.effect === 'DENY');
      const isAllowed = grants.some(g => g.effect === 'ALLOW');
      
      // DENY takes precedence for this specific permission
      if (isDenied) continue;
      
      // If allowed and not denied, we have at least one valid permission
      if (isAllowed) return true;
    }
    
    return false;
  };

  const isAllowed = checkAccess();

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4" data-testid="auth-gate-denied">
        <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <ShieldAlert className="size-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Akses ditolak</h2>
        <p className="text-muted-foreground max-w-md">
          Anda tidak memiliki izin yang diperlukan untuk membuka halaman ini.
          Hubungi administrator platform jika Anda memerlukan akses.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
