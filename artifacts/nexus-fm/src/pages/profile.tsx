import { useGetSession } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Fingerprint, Building, Mail, ShieldAlert, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function Profile() {
  const { data: session, isLoading, error } = useGetSession();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 flex items-start gap-4">
        <AlertCircle className="size-6 text-destructive shrink-0 mt-1" />
        <div>
          <h3 className="text-lg font-mono font-semibold text-destructive">Identity Sync Failed</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Unable to retrieve session data from the server.
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const activeOrgId = session.activeOrganization?.organization.id;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-mono font-bold tracking-tight">Identity & Access</h1>
        <p className="text-muted-foreground text-sm">
          Cryptographic proof of identity and your access vectors across the NEXUS-FM system.
        </p>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-mono">
                <Fingerprint className="size-5 text-primary" />
                Principal Subject
              </CardTitle>
              <CardDescription>
                Your canonical user record in the operational system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 font-mono text-sm">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block uppercase tracking-wider">Internal ID</span>
                <span className="break-all">{session.user.id}</span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block uppercase tracking-wider">Display Name</span>
                <span>{session.user.displayName}</span>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground block uppercase tracking-wider">Contact Vector</span>
                <span className="flex items-center gap-2">
                  <Mail className="size-3" />
                  {session.user.email}
                </span>
              </div>
              <div className="space-y-1 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground block uppercase tracking-wider">External Auth Ref</span>
                <span className="text-xs break-all text-muted-foreground">{session.user.externalAuthId}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-mono">
                <ShieldAlert className="size-5 text-primary" />
                Access Vectors
              </CardTitle>
              <CardDescription>
                Organizations and canonical roles assigned to this principal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {session.memberships.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">No access vectors found.</div>
              ) : (
                <div className="space-y-4">
                  {session.memberships.map((membership) => {
                    const isActive = membership.organization.id === activeOrgId;
                    return (
                      <div 
                        key={membership.organization.id} 
                        className={`p-3 rounded-lg border flex flex-col gap-2 transition-colors ${
                          isActive ? 'bg-primary/5 border-primary/30' : 'bg-background/50 border-border/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Building className={`size-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="font-mono font-medium truncate">{membership.organization.name}</span>
                          </div>
                          {isActive && (
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 rounded-sm font-mono uppercase">
                              Active
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground flex justify-between">
                          <span>Role</span>
                          <span className={isActive ? 'text-foreground' : ''}>{membership.role}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Card className="bg-card/50">
            <CardHeader>
              <CardTitle className="font-mono">Authentication Boundary</CardTitle>
              <CardDescription>
                Identity credentials and session security are managed by Clerk. NEXUS-FM stores only the application identity, organization memberships, and canonical roles required for access control.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
