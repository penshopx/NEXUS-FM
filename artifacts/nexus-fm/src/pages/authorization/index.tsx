import { useState, useEffect } from 'react';
import { AuthGate } from '@/components/auth-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RolesTab } from './roles-tab';
import { BindingsTab } from './bindings-tab';
import { AuditTab } from './audit-tab';
import { ShieldCheck } from 'lucide-react';
import { useGetMyPermissions } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';

export function AuthorizationPage() {
  const { data: myPermissions, isLoading } = useGetMyPermissions();
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);

  const hasAll = (perms: string[]) => {
    if (!myPermissions) return false;
    for (const code of perms) {
      const grants = myPermissions.permissions.filter(p => p.code === code);
      if (grants.some(g => g.effect === 'DENY')) return false;
      if (!grants.some(g => g.effect === 'ALLOW')) return false;
    }
    return true;
  };

  const showRoles = hasAll(['ROLE.MANAGE']);
  const showBindings = hasAll(['USER.MANAGE', 'ROLE.MANAGE']);
  const showAudit = hasAll(['AUDIT_LOG.VIEW_AUDIT']);

  const hasNoAccess = !isLoading && !showRoles && !showBindings && !showAudit;

  useEffect(() => {
    if (!isLoading) {
      if (activeTab === 'roles' && !showRoles) {
        setActiveTab(showBindings ? 'bindings' : showAudit ? 'audit' : undefined);
      } else if (activeTab === 'bindings' && !showBindings) {
        setActiveTab(showRoles ? 'roles' : showAudit ? 'audit' : undefined);
      } else if (activeTab === 'audit' && !showAudit) {
        setActiveTab(showRoles ? 'roles' : showBindings ? 'bindings' : undefined);
      } else if (activeTab === undefined && !hasNoAccess) {
        if (showRoles) setActiveTab('roles');
        else if (showBindings) setActiveTab('bindings');
        else if (showAudit) setActiveTab('audit');
      }
    }
  }, [isLoading, showRoles, showBindings, showAudit, activeTab, hasNoAccess]);

  if (isLoading || (activeTab === undefined && !hasNoAccess)) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 p-8">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (hasNoAccess) {
    return (
      <AuthGate anyOf={['ROLE.MANAGE', 'USER.MANAGE', 'AUDIT_LOG.VIEW_AUDIT']}>
        {/* Will never reach here because AuthGate will deny it, which is the desired behavior */}
        <div />
      </AuthGate>
    );
  }

  return (
    <AuthGate anyOf={['ROLE.MANAGE', 'USER.MANAGE', 'AUDIT_LOG.VIEW_AUDIT']}>
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 bg-primary/20 rounded-md flex items-center justify-center">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Authorization</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Manage canonical role policies, user bindings, and inspect access history.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start h-12 bg-transparent border-b border-border rounded-none p-0">
            {showRoles && (
              <TabsTrigger 
                value="roles"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 h-full"
                data-testid="tab-roles"
              >
                Role Policies
              </TabsTrigger>
            )}
            {showBindings && (
              <TabsTrigger 
                value="bindings"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 h-full"
                data-testid="tab-bindings"
              >
                User Bindings
              </TabsTrigger>
            )}
            {showAudit && (
              <TabsTrigger 
                value="audit"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 h-full"
                data-testid="tab-audit"
              >
                Audit History
              </TabsTrigger>
            )}
          </TabsList>
          
          <div className="pt-6">
            {showRoles && (
              <TabsContent value="roles" className="m-0 focus-visible:outline-none">
                <RolesTab />
              </TabsContent>
            )}
            
            {showBindings && (
              <TabsContent value="bindings" className="m-0 focus-visible:outline-none">
                <BindingsTab />
              </TabsContent>
            )}
            
            {showAudit && (
              <TabsContent value="audit" className="m-0 focus-visible:outline-none">
                <AuditTab />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </AuthGate>
  );
}
