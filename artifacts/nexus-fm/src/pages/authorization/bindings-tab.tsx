import { useState } from 'react';
import { 
  useGetUserRoleBindings,
  useCreateUserRoleBinding,
  useUpdateUserRoleBinding,
  useRevokeUserRoleBinding,
  useListRoles,
  useGetSession,
  UserRoleBinding,
  ScopeType,
  UserRoleBindingUpdateStatus,
  Role,
  BadRequestResponse,
  ForbiddenResponse,
  NotFoundResponse,
  ErrorResponse
} from '@workspace/api-client-react';
import { 
  getGetUserRoleBindingsQueryKey,
  getGetAuthorizationAuditLogsQueryKey
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus, Trash2, Calendar, Edit2, Play, Pause, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function BindingsTab() {
  const [targetUserId, setTargetUserId] = useState('');
  const [activeUserId, setActiveUserId] = useState('');
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetUserId.trim()) {
      setActiveUserId(targetUserId.trim());
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 border border-border rounded-lg bg-card shadow-sm flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1 space-y-1 w-full">
          <label className="text-sm font-medium">Target User ID</label>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input 
              placeholder="usr_..." 
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="font-mono"
              data-testid="input-target-user"
            />
            <Button type="submit" data-testid="button-search-user">
              <Search className="size-4 mr-2" /> Lookup
            </Button>
          </form>
        </div>
        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded border border-border w-full sm:w-1/2">
          <strong>Note:</strong> Cross-org and self-escalation restrictions are enforced by the server. Any invalid assignment will be rejected.
        </div>
      </div>

      {activeUserId && (
        <BindingsManager userId={activeUserId} />
      )}
    </div>
  );
}

function BindingsManager({ userId }: { userId: string }) {
  const { data: bindings, isLoading } = useGetUserRoleBindings(userId, {
    query: {
      enabled: !!userId,
      queryKey: getGetUserRoleBindingsQueryKey(userId)
    }
  });
  const { data: roles } = useListRoles();
  const { data: session } = useGetSession();
  
  const activeOrgId = session?.activeOrganization?.organization.id;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState<UserRoleBinding | null>(null);

  if (isLoading) {
    return <div className="space-y-3">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>;
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          Role Bindings for <code className="text-xs bg-muted px-1.5 py-0.5 rounded" data-testid={`display-userid-${userId}`}>{userId}</code>
        </h3>
        <Button size="sm" onClick={() => setIsCreateOpen(true)} disabled={!activeOrgId} data-testid="button-new-binding">
          <UserPlus className="size-4 mr-2" /> New Binding
        </Button>
      </div>

      {!activeOrgId && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="size-4" />
          You must have an active organization selected to manage bindings.
        </div>
      )}

      {bindings?.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Search className="size-6 opacity-50" />
          </div>
          <p>No role bindings found for this user.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {bindings?.map(binding => (
            <BindingRow 
              key={binding.id} 
              binding={binding} 
              roles={roles || []} 
              userId={userId}
              onEdit={() => setEditingBinding(binding)}
            />
          ))}
        </div>
      )}

      {activeOrgId && (
        <CreateBindingDialog 
          userId={userId}
          orgId={activeOrgId}
          roles={roles || []}
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      )}

      {editingBinding && (
        <EditBindingDialog
          binding={editingBinding}
          userId={userId}
          open={!!editingBinding}
          onOpenChange={(open: boolean) => !open && setEditingBinding(null)}
        />
      )}
    </div>
  );
}

function BindingRow({ binding, roles, userId, onEdit }: { binding: UserRoleBinding, roles: Role[], userId: string, onEdit: () => void }) {
  const roleName = roles.find(r => r.id === binding.roleId)?.code || binding.roleId;
  const isExpired = binding.status === 'EXPIRED';
  const isSuspended = binding.status === 'SUSPENDED';

  const revokeMutation = useRevokeUserRoleBinding();
  const updateMutation = useUpdateUserRoleBinding();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRevoke = () => {
    revokeMutation.mutate({ userId, bindingId: binding.id }, {
      onSuccess: () => {
        toast({ title: 'Binding revoked' });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
          title: 'Failed to revoke binding', 
          description: errData?.error || 'Unknown error',
          variant: 'destructive'
        });
      }
    });
  };

  const handleToggleSuspend = () => {
    const newStatus: UserRoleBindingUpdateStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';
    updateMutation.mutate({
      userId,
      bindingId: binding.id,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({ title: `Binding ${newStatus.toLowerCase()}` });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
          title: `Failed to ${isSuspended ? 'reactivate' : 'suspend'} binding`, 
          description: errData?.error || 'Unknown error',
          variant: 'destructive'
        });
      }
    });
  };

  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card hover:bg-muted/10 transition-colors" data-testid={`row-binding-${binding.id}`}>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs" data-testid={`display-rolename-${binding.id}`}>{roleName}</Badge>
          <Badge 
            variant={binding.status === 'ACTIVE' ? 'default' : binding.status === 'SUSPENDED' ? 'secondary' : 'destructive'} 
            className="text-[10px] h-5"
            data-testid={`display-status-${binding.id}`}
          >
            {binding.status}
          </Badge>
        </div>
        <div className="text-sm font-mono text-muted-foreground flex gap-3 flex-wrap">
          <span data-testid={`display-scope-${binding.id}`}>Scope: {binding.scopeType} {binding.scopeId && `(${binding.scopeId})`}</span>
          <span data-testid={`display-org-${binding.id}`}>Org: {binding.organizationId}</span>
        </div>
        {(binding.startsAt || binding.endsAt) && (
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="size-3" />
            {binding.startsAt ? new Date(binding.startsAt).toLocaleDateString() : 'Always'} 
            {' → '} 
            {binding.endsAt ? new Date(binding.endsAt).toLocaleDateString() : 'Forever'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleToggleSuspend}
          disabled={isExpired || updateMutation.isPending}
          title={isSuspended ? "Reactivate" : "Suspend"}
          data-testid={`button-toggle-suspend-${binding.id}`}
        >
          {isSuspended ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onEdit}
          disabled={isExpired}
          title="Edit Expiry/Scope"
          data-testid={`button-edit-binding-${binding.id}`}
        >
          <Edit2 className="size-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              variant="destructive" 
              size="sm" 
              disabled={isExpired || revokeMutation.isPending}
              title="Revoke Permanently"
              data-testid={`button-revoke-binding-${binding.id}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke Binding Permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Revoking this binding will permanently remove it from the user's access profile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-revoke">
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

const createSchema = z.object({
  roleId: z.string().min(1, 'Role is required'),
  scopeType: z.nativeEnum(ScopeType),
  scopeId: z.string().optional(),
  endsAt: z.string().optional()
}).refine(data => {
  if (data.scopeType !== 'ORGANIZATION' && !data.scopeId) {
    return false;
  }
  return true;
}, {
  message: "Scope ID is required for non-organization scopes",
  path: ["scopeId"]
});

type CreateValues = z.infer<typeof createSchema>;

function CreateBindingDialog({ userId, orgId, roles, open, onOpenChange }: {
  userId: string;
  orgId: string;
  roles: Role[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateUserRoleBinding();

  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      roleId: '',
      scopeType: 'ORGANIZATION' as ScopeType,
      scopeId: '',
      endsAt: ''
    }
  });

  const onSubmit = (values: CreateValues) => {
    createMutation.mutate({
      userId,
      data: {
        organizationId: orgId,
        roleId: values.roleId,
        scopeType: values.scopeType,
        scopeId: values.scopeId || null,
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Binding created successfully' });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
        onOpenChange(false);
        form.reset();
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
          title: 'Failed to create binding', 
          description: errData?.error || 'Unknown error',
          variant: 'destructive'
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Role Binding</DialogTitle>
          <DialogDescription>
            Grant a role to user <code className="text-xs bg-muted px-1 py-0.5">{userId}</code>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roles.map((r: Role) => (
                        <SelectItem key={r.id} value={r.id}>{r.code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scopeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-scopetype">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ScopeType).map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scopeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope ID (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Target resource ID" data-testid="input-scopeid" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiry Date (Optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-endsat" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-binding">
                {createMutation.isPending ? 'Creating...' : 'Create Binding'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const editSchema = z.object({
  scopeType: z.nativeEnum(ScopeType),
  scopeId: z.string().optional(),
  endsAt: z.string().optional()
}).refine(data => {
  if (data.scopeType !== 'ORGANIZATION' && !data.scopeId) {
    return false;
  }
  return true;
}, {
  message: "Scope ID is required for non-organization scopes",
  path: ["scopeId"]
});

type EditValues = z.infer<typeof editSchema>;

function EditBindingDialog({ userId, binding, open, onOpenChange }: {
  userId: string;
  binding: UserRoleBinding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateUserRoleBinding();

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      scopeType: binding.scopeType,
      scopeId: binding.scopeId || '',
      endsAt: binding.endsAt ? new Date(binding.endsAt).toISOString().split('T')[0] : ''
    }
  });

  const onSubmit = (values: EditValues) => {
    updateMutation.mutate({
      userId,
      bindingId: binding.id,
      data: {
        scopeType: values.scopeType,
        scopeId: values.scopeId || null,
        endsAt: values.endsAt ? new Date(values.endsAt).toISOString() : null
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Binding updated successfully' });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
        onOpenChange(false);
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
          title: 'Failed to update binding', 
          description: errData?.error || 'Unknown error',
          variant: 'destructive'
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Role Binding</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scopeType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-edit-scopetype">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(ScopeType).map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scopeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope ID (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-scopeid" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expiry Date (Optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-edit-endsat" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-binding">
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
