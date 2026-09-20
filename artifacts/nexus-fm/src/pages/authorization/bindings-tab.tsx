import { useEffect, useState } from 'react';
import { useSearchParams } from 'wouter';
import { 
  useGetUserRoleBindings,
  useCreateUserRoleBinding,
  useUpdateUserRoleBinding,
  useRevokeUserRoleBinding,
  useListRoles,
  useGetSession,
  useGetMyPermissions,
  useSearchOrganizationMembers,
  useSearchPlatformOrganizations,
  UserRoleBinding,
  OrganizationMemberSearchResult,
  PlatformOrganizationSearchResult,
  ScopeType,
  UserRoleBindingUpdateStatus,
  Role,
  BadRequestResponse,
  ForbiddenResponse,
  NotFoundResponse,
  ErrorResponse
} from '@workspace/api-client-react';
import type { CanonicalRole, UserRoleBindingStatus } from '@workspace/api-client-react';
import { 
  getGetUserRoleBindingsQueryKey,
  getGetAuthorizationAuditLogsQueryKey,
  getSearchOrganizationMembersQueryKey,
  getSearchPlatformOrganizationsQueryKey,
  getListRolesQueryKey
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
import { Search, UserPlus, Trash2, Calendar, Edit2, Play, Pause, AlertTriangle, Mail, Building2, UserRound, ChevronLeft, ChevronRight, Check, ChevronsUpDown, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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

const canonicalRoleOptions = [
  'PLATFORM_ADMIN',
  'FACILITY_MANAGER',
  'FACILITY_SUPERVISOR',
  'INSPECTOR',
  'MAINTENANCE_TECHNICIAN',
  'WAREHOUSE_SUPERVISOR',
  'VENDOR',
] as const satisfies readonly CanonicalRole[];

const bindingStatusOptions = [
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
] as const satisfies readonly UserRoleBindingStatus[];

export function BindingsTab({ canManage }: { canManage: boolean }) {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const submittedQuery = (urlSearchParams.get('query') ?? '').trim();
  const submittedOrganizationId = urlSearchParams.get('organizationId') ?? '';
  const parsedPage = Number.parseInt(urlSearchParams.get('page') ?? '1', 10);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const memberSearchParamNames = [
    'query',
    'organizationId',
    'organizationName',
    'organizationSlug',
    'page',
  ] as const;
  const hasActiveMemberSearch = memberSearchParamNames.some((name) => urlSearchParams.has(name));
  const urlOrganization = submittedOrganizationId
    ? {
        id: submittedOrganizationId,
        name: urlSearchParams.get('organizationName') ?? submittedOrganizationId,
        slug: urlSearchParams.get('organizationSlug') ?? submittedOrganizationId,
      }
    : null;
  const [searchInput, setSearchInput] = useState(submittedQuery);
  const [organizationPickerOpen, setOrganizationPickerOpen] = useState(false);
  const [organizationQuery, setOrganizationQuery] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState<PlatformOrganizationSearchResult | null>(urlOrganization);
  const [selectedMember, setSelectedMember] = useState<OrganizationMemberSearchResult | null>(null);
  const { data: myPermissions } = useGetMyPermissions();
  const isPlatformAdmin = myPermissions?.permissions.some(
    (permission) => permission.code === 'USER.VIEW' &&
      permission.effect === 'ALLOW' &&
      permission.scopeType === 'PLATFORM',
  ) ?? false;
  const organizationSearch = useSearchPlatformOrganizations(
    { query: organizationQuery, limit: 20 },
    {
      query: {
        enabled: isPlatformAdmin && organizationQuery.trim().length >= 2,
        queryKey: getSearchPlatformOrganizationsQueryKey({ query: organizationQuery, limit: 20 }),
      },
    },
  );
  const searchParams = {
    query: submittedQuery,
    organizationId: submittedOrganizationId || undefined,
    page,
    limit: 20,
  };
  const search = useSearchOrganizationMembers(
    searchParams,
    {
      query: {
        enabled: submittedQuery.length >= 2,
        queryKey: getSearchOrganizationMembersQueryKey(searchParams),
      },
    },
  );

  useEffect(() => {
    setSearchInput(submittedQuery);
    setSelectedOrganization(urlOrganization);
    setSelectedMember(null);
  }, [
    submittedQuery,
    submittedOrganizationId,
    urlOrganization?.name,
    urlOrganization?.slug,
    page,
  ]);

  const updatePage = (nextPage: number) => {
    setUrlSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (nextPage > 1) next.set('page', String(nextPage));
      else next.delete('page');
      return next;
    });
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (query.length >= 2) {
      setUrlSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('query', query);
        next.delete('page');
        if (isPlatformAdmin && selectedOrganization) {
          next.set('organizationId', selectedOrganization.id);
          next.set('organizationName', selectedOrganization.name);
          next.set('organizationSlug', selectedOrganization.slug);
        } else {
          next.delete('organizationId');
          next.delete('organizationName');
          next.delete('organizationSlug');
        }
        return next;
      });
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSelectedOrganization(null);
    setOrganizationQuery('');
    setOrganizationPickerOpen(false);
    setSelectedMember(null);
    setUrlSearchParams((current) => {
      const next = new URLSearchParams(current);
      memberSearchParamNames.forEach((name) => next.delete(name));
      return next;
    });
  };

  const totalPages = search.data ? Math.max(1, Math.ceil(search.data.total / search.data.limit)) : 1;

  return (
    <div className="space-y-6">
      <div className="p-6 border border-border rounded-lg bg-card shadow-sm">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="member-search">Find a member</label>
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                id="member-search"
                placeholder="Search by name or email"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="min-w-48 flex-1"
                data-testid="input-target-user"
              />
              <Button type="submit" disabled={searchInput.trim().length < 2 || search.isFetching} data-testid="button-search-user">
                <Search className="size-4 mr-2" /> {search.isFetching ? 'Searching...' : 'Search'}
              </Button>
              {hasActiveMemberSearch && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearSearch}
                  data-testid="button-clear-member-search"
                >
                  <X className="size-4 mr-2" /> Clear search
                </Button>
              )}
            </div>
            {isPlatformAdmin && (
              <div>
                <label className="text-sm font-medium" htmlFor="member-organization-filter">
                  Organization <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <div className="mt-1 flex gap-2">
                  <Popover open={organizationPickerOpen} onOpenChange={setOrganizationPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="member-organization-filter"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={organizationPickerOpen}
                        className="flex-1 justify-between font-normal"
                        data-testid="button-member-organization"
                      >
                        {selectedOrganization ? (
                          <span className="truncate">
                            {selectedOrganization.name} <span className="text-muted-foreground">({selectedOrganization.slug})</span>
                          </span>
                        ) : 'All organizations'}
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search by name or slug"
                          value={organizationQuery}
                          onValueChange={setOrganizationQuery}
                          data-testid="input-member-organization"
                        />
                        <CommandList>
                          {organizationQuery.trim().length < 2 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              Enter at least 2 characters.
                            </div>
                          ) : organizationSearch.isFetching ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>
                          ) : (
                            <>
                              <CommandEmpty>No organizations found.</CommandEmpty>
                              <CommandGroup>
                                {organizationSearch.data?.map((organization) => (
                                  <CommandItem
                                    key={organization.id}
                                    value={organization.id}
                                    onSelect={() => {
                                      setSelectedOrganization(organization);
                                      setOrganizationPickerOpen(false);
                                    }}
                                    data-testid={`organization-option-${organization.id}`}
                                  >
                                    <Check className={selectedOrganization?.id === organization.id ? 'opacity-100' : 'opacity-0'} />
                                    <span className="min-w-0">
                                      <span className="block truncate">{organization.name}</span>
                                      <span className="block truncate text-xs text-muted-foreground">{organization.slug}</span>
                                    </span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedOrganization && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Clear organization filter"
                      onClick={() => {
                        setSelectedOrganization(null);
                        setOrganizationQuery('');
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </form>
          <p className="text-xs text-muted-foreground">
            Results include active members in the organizations you are allowed to administer.
          </p>
        </div>

        {search.isError && (
          <div className="mt-4 p-3 rounded border border-destructive/30 bg-destructive/10 text-sm text-destructive">
            Member search failed. Check your organization access and try again.
          </div>
        )}

        {submittedQuery && !search.isFetching && !search.isError && (
          <div className="mt-4 border border-border rounded-md overflow-hidden" data-testid="member-search-results">
            {search.data?.items.length ? (
              <div className="divide-y divide-border">
                {search.data.items.map((member) => {
                  const isSelected = selectedMember?.userId === member.userId &&
                    selectedMember.organizationId === member.organizationId;
                  return (
                    <button
                      key={`${member.userId}-${member.organizationId}`}
                      type="button"
                      onClick={() => setSelectedMember(member)}
                      className={`w-full p-4 text-left flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                      }`}
                      data-testid={`member-result-${member.userId}-${member.organizationId}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          <UserRound className="size-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{member.displayName}</span>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
                          <Mail className="size-3.5 shrink-0" />
                          <span className="truncate">{member.email}</span>
                        </div>
                        <code className="mt-1 block text-[11px] text-muted-foreground">{member.userId}</code>
                      </div>
                      <div className="md:text-right">
                        <div className="text-sm flex md:justify-end items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground" />
                          {member.organizationName}
                        </div>
                        <div className="mt-1 flex md:justify-end gap-2">
                          <Badge variant="outline">{member.membershipRole}</Badge>
                          <code className="text-[10px] text-muted-foreground self-center">{member.organizationId}</code>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No active members matched “{submittedQuery}”.
              </div>
            )}
            {search.data && search.data.total > 0 && (
              <div className="p-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                <div className="text-muted-foreground" data-testid="member-search-page-summary">
                  Page {search.data.page} of {totalPages} · {search.data.total} results
                    {urlOrganization && (
                      <> · Organization <strong className="font-medium text-foreground">{urlOrganization.name}</strong>{' '}
                        <span>({urlOrganization.slug})</span>
                     </>
                   )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updatePage(Math.max(1, page - 1))}
                    disabled={search.isFetching || page <= 1}
                    data-testid="button-member-previous-page"
                  >
                    <ChevronLeft className="size-4 mr-1" /> Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updatePage(page + 1)}
                    disabled={search.isFetching || page >= totalPages}
                    data-testid="button-member-next-page"
                  >
                    Next <ChevronRight className="size-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedMember && (
        <BindingsManager userId={selectedMember.userId} member={selectedMember} canManage={canManage} />
      )}
    </div>
  );
}

function BindingsManager({ userId, member, canManage }: {
  userId: string;
  member: OrganizationMemberSearchResult;
  canManage: boolean;
}) {
  const [roleFilter, setRoleFilter] = useState<CanonicalRole | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<UserRoleBindingStatus | 'ALL'>('ALL');
  const bindingFilters = {
    ...(roleFilter === 'ALL' ? {} : { roleCode: roleFilter }),
    ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
  };
  const { data: bindings, isLoading } = useGetUserRoleBindings(userId, bindingFilters, {
    query: {
      enabled: !!userId,
      queryKey: getGetUserRoleBindingsQueryKey(userId, bindingFilters)
    }
  });
  const { data: roles } = useListRoles({
    query: {
      enabled: canManage,
      queryKey: getListRolesQueryKey(),
    },
  });
  const { data: session } = useGetSession();
  
  const activeOrgId = session?.activeOrganization?.organization.id;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBinding, setEditingBinding] = useState<UserRoleBinding | null>(null);
  const hasActiveFilters = roleFilter !== 'ALL' || statusFilter !== 'ALL';

  useEffect(() => {
    setRoleFilter('ALL');
    setStatusFilter('ALL');
  }, [userId]);

  if (isLoading) {
    return <div className="space-y-3">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>;
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/20 flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Role Bindings for {member.displayName}</h3>
          <div className="mt-1 text-xs text-muted-foreground">
            {member.email} · {member.organizationName} ·{' '}
            <code data-testid={`display-userid-${userId}`}>{userId}</code>
          </div>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setIsCreateOpen(true)} disabled={!activeOrgId} data-testid="button-new-binding">
            <UserPlus className="size-4 mr-2" /> New Binding
          </Button>
        )}
      </div>

      {canManage && !activeOrgId && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="size-4" />
          You must have an active organization selected to manage bindings.
        </div>
      )}

      <div className="p-4 border-b border-border bg-muted/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="binding-role-filter">Role</label>
            <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as CanonicalRole | 'ALL')}>
              <SelectTrigger id="binding-role-filter" data-testid="select-binding-role-filter">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All roles</SelectItem>
                {canonicalRoleOptions.map((role) => (
                  <SelectItem key={role} value={role}>{role.replaceAll('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="binding-status-filter">Status</label>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as UserRoleBindingStatus | 'ALL')}>
              <SelectTrigger id="binding-status-filter" data-testid="select-binding-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {bindingStatusOptions.map((status) => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRoleFilter('ALL');
                setStatusFilter('ALL');
              }}
              data-testid="button-clear-binding-filters"
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {bindings?.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Search className="size-6 opacity-50" />
          </div>
          {hasActiveFilters ? (
            <>
              <p className="font-medium text-foreground">No bindings match these filters.</p>
              <p className="mt-1 text-sm">Try another role or status, or clear the filters.</p>
            </>
          ) : (
            <p>No role bindings found for this user.</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {bindings?.map(binding => (
            <BindingRow 
              key={binding.id} 
              binding={binding} 
              userId={userId}
              canManage={canManage}
              onEdit={() => setEditingBinding(binding)}
            />
          ))}
        </div>
      )}

      {canManage && activeOrgId && (
        <CreateBindingDialog 
          userId={userId}
          orgId={activeOrgId}
          roles={roles || []}
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      )}

      {canManage && editingBinding && (
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

function BindingRow({ binding, userId, canManage, onEdit }: {
  binding: UserRoleBinding;
  userId: string;
  canManage: boolean;
  onEdit: () => void;
}) {
  const isExpired = binding.status === 'EXPIRED';
  const isSuspended = binding.status === 'SUSPENDED';
  const bindingName = `${binding.roleCode} binding`;
  const statusDescription = isExpired
    ? `${bindingName} is expired and read-only. Suspension, expiry editing, and permanent revocation are unavailable.`
    : isSuspended
      ? `${bindingName} is suspended. It can be reactivated, edited, or permanently revoked.`
      : `${bindingName} is active. It can be suspended, edited, or permanently revoked.`;
  const scopeTargetLabel = binding.scopeTargetStatus === 'RESOLVED'
    ? binding.scopeTargetName
    : binding.scopeTargetStatus === 'MISSING'
      ? 'Missing or historical target'
      : 'No named target';

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
    <div
      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card hover:bg-muted/10 transition-colors"
      data-testid={`row-binding-${binding.id}`}
      aria-describedby={`binding-status-description-${binding.id}`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs" data-testid={`display-rolename-${binding.id}`}>{binding.roleCode}</Badge>
          <Badge 
            variant={binding.status === 'ACTIVE' ? 'default' : binding.status === 'SUSPENDED' ? 'secondary' : 'destructive'} 
            className="text-[10px] h-5"
            data-testid={`display-status-${binding.id}`}
          >
            {binding.status}
          </Badge>
          <span id={`binding-status-description-${binding.id}`} className="sr-only">
            {statusDescription}
          </span>
        </div>
        <div className="text-sm">
          <span className="font-medium" data-testid={`display-scopename-${binding.id}`}>
            {binding.scopeType}: {scopeTargetLabel}
          </span>
        </div>
        <div className="text-xs font-mono text-muted-foreground flex gap-3 flex-wrap">
          <span data-testid={`display-roleid-${binding.id}`}>Role ID: {binding.roleId}</span>
          <span data-testid={`display-scope-${binding.id}`}>
            Scope ID: {binding.scopeId ?? 'None'}
          </span>
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

      {canManage && <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleToggleSuspend}
          disabled={isExpired || updateMutation.isPending}
          aria-label={`${isSuspended ? 'Reactivate' : 'Suspend'} ${bindingName}`}
          aria-describedby={isExpired ? `binding-status-description-${binding.id}` : undefined}
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
          aria-label={`Edit expiry and scope for ${bindingName}`}
          aria-describedby={isExpired ? `binding-status-description-${binding.id}` : undefined}
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
              aria-label={`Permanently revoke ${bindingName}`}
              aria-describedby={isExpired ? `binding-status-description-${binding.id}` : undefined}
              title="Revoke Permanently"
              data-testid={`button-revoke-binding-${binding.id}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent data-testid={`revoke-dialog-${binding.id}`}>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke Binding Permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Revoking this binding will permanently remove it from the user's access profile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel aria-label={`Cancel permanent revocation of ${bindingName}`}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevoke}
                aria-label={`Confirm permanent revocation of ${bindingName}`}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-revoke"
              >
                Revoke permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>}
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
