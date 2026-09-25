import { useEffect, useRef, useState } from 'react';
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
  useSearchRoleBindingScopeTargets,
  exportUserRoleBindings,
  UserRoleBinding,
  OrganizationMemberSearchResult,
  PlatformOrganizationSearchResult,
  RoleBindingScopeTarget,
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
  getSearchRoleBindingScopeTargetsQueryKey,
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
import { getResultCountBucket, trackAccessReviewEvent } from '@/lib/analytics';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus, Trash2, Calendar, Edit2, Play, Pause, AlertTriangle, Mail, Building2, UserRound, ChevronLeft, ChevronRight, Check, ChevronsUpDown, X, Download } from 'lucide-react';
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
import {
  normalizeMemberReviewUrlState,
  parseMemberReviewUrlState,
  transitionMemberReviewUrlState,
} from './member-review-url-state';
import {
  describeBindingScope,
  doesBindingScopeBroaden,
} from './binding-scope-change';

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

const displayLabel = (value: string) => value
  .split('_')
  .map((part) => ({
    PLATFORM: 'Platform',
    ADMIN: 'Administrator',
    FACILITY: 'Fasilitas',
    MANAGER: 'Manajer',
    SUPERVISOR: 'Supervisor',
    INSPECTOR: 'Inspektur',
    MAINTENANCE: 'Teknisi Pemeliharaan',
    TECHNICIAN: 'Teknisi',
    WAREHOUSE: 'Gudang',
    VENDOR: 'Vendor',
    ACTIVE: 'Aktif',
    SUSPENDED: 'Ditangguhkan',
    EXPIRED: 'Kedaluwarsa',
    ORGANIZATION: 'Organisasi',
    BUILDING: 'Gedung',
    SPACE: 'Ruang',
    ASSET: 'Aset',
    TEAM: 'Tim',
    ASSIGNMENT: 'Penugasan',
  }[part] ?? part.toLowerCase()))
  .join(' ');

export function BindingsTab({ canManage }: { canManage: boolean }) {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const urlState = parseMemberReviewUrlState(urlSearchParams);
  const submittedQuery = urlState.query;
  const submittedOrganizationId = urlState.organization?.id ?? '';
  const selectedMemberId = urlState.selection?.memberId ?? '';
  const selectedMemberOrganizationId = urlState.selection?.organizationId ?? '';
  const page = urlState.page;
  const hasActiveMemberSearch = urlState.hasActiveState;
  const wasMemberReviewUrlRepaired = urlState.wasRepaired;
  const [repairedUrlNotice, setRepairedUrlNotice] = useState<string | null>(null);
  const urlOrganization = urlState.organization;
  const [searchInput, setSearchInput] = useState(submittedQuery);
  const [organizationPickerOpen, setOrganizationPickerOpen] = useState(false);
  const [organizationQuery, setOrganizationQuery] = useState('');
  const [selectedOrganization, setSelectedOrganization] = useState<PlatformOrganizationSearchResult | null>(urlOrganization);
  const [selectedMember, setSelectedMember] = useState<OrganizationMemberSearchResult | null>(null);
  const trackedUnavailableSelection = useRef<string | null>(null);
  const memberSearchResetContext = useRef<{
    hadPagination: boolean;
    hadOrganizationFilter: boolean;
  } | null>(null);
  const recoverySearchSubmission = useRef<{
    resetHadPagination: boolean;
    resetHadOrganizationFilter: boolean;
    hasOrganizationFilter: boolean;
    query: string;
    organizationId: string;
  } | null>(null);
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
    if (wasMemberReviewUrlRepaired) {
      const normalized = normalizeMemberReviewUrlState(urlSearchParams);
      if (normalized) {
        setRepairedUrlNotice(normalized.toString());
        setUrlSearchParams((current) => normalizeMemberReviewUrlState(current) ?? current, { replace: true });
      }
    } else if (repairedUrlNotice !== null && repairedUrlNotice !== urlSearchParams.toString()) {
      setRepairedUrlNotice(null);
    }
  }, [wasMemberReviewUrlRepaired, urlSearchParams, repairedUrlNotice, setUrlSearchParams]);

  useEffect(() => {
    const recovery = recoverySearchSubmission.current;
    if (!recovery) {
      return;
    }

    if (
      submittedQuery !== recovery.query ||
      submittedOrganizationId !== recovery.organizationId ||
      page !== 1
    ) {
      recoverySearchSubmission.current = null;
      return;
    }

    if (
      submittedQuery.length < 2 ||
      search.isFetching ||
      search.isError ||
      !search.data
    ) {
      return;
    }

    recoverySearchSubmission.current = null;
    memberSearchResetContext.current = null;
    trackAccessReviewEvent('member_search_after_reset', {
      reset_had_pagination: recovery.resetHadPagination,
      reset_had_organization_filter: recovery.resetHadOrganizationFilter,
      has_organization_filter: recovery.hasOrganizationFilter,
      result: search.data.items.length > 0 ? 'matches' : 'no_matches',
    });
  }, [
    page,
    search.data,
    search.isError,
    search.isFetching,
    submittedOrganizationId,
    submittedQuery,
  ]);
  const hasSavedMemberSelection = Boolean(selectedMemberId && selectedMemberOrganizationId);
  const isSavedMemberUnavailable = hasSavedMemberSelection &&
    Boolean(search.data) &&
    !search.isFetching &&
    !search.isError &&
    !search.data?.items.some(
      (member) => member.userId === selectedMemberId &&
        member.organizationId === selectedMemberOrganizationId,
    );

  useEffect(() => {
    if (search.isFetching || search.isError || !search.data) {
      return;
    }

    const selectionKey = hasSavedMemberSelection
      ? `${selectedMemberId}:${selectedMemberOrganizationId}`
      : null;

    if (isSavedMemberUnavailable && trackedUnavailableSelection.current !== selectionKey) {
      trackAccessReviewEvent('saved_member_unavailable_shown');
      trackedUnavailableSelection.current = selectionKey;
    } else if (!isSavedMemberUnavailable) {
      trackedUnavailableSelection.current = null;
    }
  }, [
    hasSavedMemberSelection,
    isSavedMemberUnavailable,
    search.data,
    search.isError,
    search.isFetching,
    selectedMemberId,
    selectedMemberOrganizationId,
  ]);

  useEffect(() => {
    setSearchInput(submittedQuery);
    setSelectedOrganization(urlOrganization);
  }, [
    submittedQuery,
    submittedOrganizationId,
    urlOrganization?.name,
    urlOrganization?.slug,
    page,
  ]);

  useEffect(() => {
    if (!selectedMemberId || !selectedMemberOrganizationId || !search.data) {
      setSelectedMember(null);
      return;
    }

    const authorizedMember = search.data.items.find(
      (member) => member.userId === selectedMemberId &&
        member.organizationId === selectedMemberOrganizationId,
    );
    setSelectedMember(authorizedMember ?? null);
  }, [search.data, selectedMemberId, selectedMemberOrganizationId]);

  const handleClearUnavailableMember = () => {
    trackAccessReviewEvent('saved_member_unavailable_cleared');
    trackedUnavailableSelection.current = null;
    setSelectedMember(null);
    setUrlSearchParams((current) => transitionMemberReviewUrlState(current, {
      type: 'clear-selection',
    }));
  };

  const updatePage = (nextPage: number) => {
    setUrlSearchParams((current) => transitionMemberReviewUrlState(current, {
      type: 'page',
      page: nextPage,
    }));
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (query.length >= 2) {
      const resetContext = memberSearchResetContext.current;
      if (resetContext) {
        recoverySearchSubmission.current = {
          resetHadPagination: resetContext.hadPagination,
          resetHadOrganizationFilter: resetContext.hadOrganizationFilter,
          hasOrganizationFilter: isPlatformAdmin && Boolean(selectedOrganization),
          query,
          organizationId: isPlatformAdmin ? selectedOrganization?.id ?? '' : '',
        };
      }
      setUrlSearchParams((current) => transitionMemberReviewUrlState(current, {
        type: 'search',
        query,
        organization: isPlatformAdmin ? selectedOrganization : null,
      }));
    }
  };

  const handleClearSearch = () => {
    const hadPagination = page > 1;
    const hadOrganizationFilter = submittedOrganizationId.length > 0;

    setSearchInput('');
    setSelectedOrganization(null);
    setOrganizationQuery('');
    setOrganizationPickerOpen(false);
    setSelectedMember(null);
    memberSearchResetContext.current = {
      hadPagination,
      hadOrganizationFilter,
    };
    recoverySearchSubmission.current = null;
    setUrlSearchParams((current) => transitionMemberReviewUrlState(current, { type: 'clear' }));
    trackAccessReviewEvent('member_search_reset', {
      had_pagination: hadPagination,
      had_organization_filter: hadOrganizationFilter,
    });
  };

  const totalPages = search.data ? Math.max(1, Math.ceil(search.data.total / search.data.limit)) : 1;

  return (
    <div className="space-y-6">
      <div className="p-6 border border-border rounded-lg bg-card shadow-sm">
        {(wasMemberReviewUrlRepaired || repairedUrlNotice === urlSearchParams.toString()) && (
          <div
            className="mb-4 rounded border border-border bg-muted/40 p-3 text-sm"
            data-testid="member-review-url-repaired"
            role="status"
          >
            Beberapa detail tautan tersimpan tidak valid atau tidak lengkap, sehingga tinjauan akses dibuka dengan pengaturan aman.
          </div>
        )}
        <div className="space-y-2">
           <label className="text-sm font-medium" htmlFor="member-search">Cari anggota</label>
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                id="member-search"
                 placeholder="Cari berdasarkan nama atau email"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="min-w-48 flex-1"
                data-testid="input-target-user"
              />
              <Button type="submit" disabled={searchInput.trim().length < 2 || search.isFetching} data-testid="button-search-user">
                 <Search className="size-4 mr-2" /> {search.isFetching ? 'Mencari...' : 'Cari'}
              </Button>
              {hasActiveMemberSearch && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearSearch}
                  data-testid="button-clear-member-search"
                >
                   <X className="size-4 mr-2" /> Hapus pencarian
                </Button>
              )}
            </div>
            {isPlatformAdmin && (
              <div>
                <label className="text-sm font-medium" htmlFor="member-organization-filter">
                   Organisasi <span className="font-normal text-muted-foreground">(opsional)</span>
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
                         ) : 'Semua organisasi'}
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                           placeholder="Cari berdasarkan nama atau slug"
                          value={organizationQuery}
                          onValueChange={setOrganizationQuery}
                          data-testid="input-member-organization"
                        />
                        <CommandList>
                          {organizationQuery.trim().length < 2 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                               Masukkan setidaknya 2 karakter.
                            </div>
                          ) : organizationSearch.isFetching ? (
                             <div className="py-6 text-center text-sm text-muted-foreground">Mencari...</div>
                          ) : (
                            <>
                               <CommandEmpty>Organisasi tidak ditemukan.</CommandEmpty>
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
                      aria-label="Hapus filter organisasi"
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
             Hasil mencakup anggota aktif di organisasi yang boleh Anda kelola.
          </p>
        </div>

        {search.isError && (
          <div className="mt-4 p-3 rounded border border-destructive/30 bg-destructive/10 text-sm text-destructive">
             Pencarian anggota gagal. Periksa akses organisasi Anda dan coba lagi.
          </div>
        )}

        {isSavedMemberUnavailable && (
          <div
            className="mt-4 flex flex-col gap-3 rounded border border-border bg-muted/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
            data-testid="saved-member-unavailable"
            role="status"
          >
            <p>
               Pilihan anggota tersimpan ini tidak lagi tersedia. Hapus pilihan untuk melanjutkan pencarian.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearUnavailableMember}
              data-testid="button-clear-unavailable-member"
            >
               Hapus pilihan
            </Button>
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
                      onClick={() => {
                        setUrlSearchParams((current) => transitionMemberReviewUrlState(current, {
                          type: 'select-member',
                          memberId: member.userId,
                          organizationId: member.organizationId,
                        }));
                      }}
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
                 Tidak ada anggota aktif yang cocok dengan “{submittedQuery}”.
              </div>
            )}
            {search.data && search.data.total > 0 && (
              <div className="p-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                <div className="text-muted-foreground" data-testid="member-search-page-summary">
                   Halaman {search.data.page} dari {totalPages} · {search.data.total} hasil
                    {urlOrganization && (
                         <> · Organisasi <strong className="font-medium text-foreground">{urlOrganization.name}</strong>{' '}
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
                     <ChevronLeft className="size-4 mr-1" /> Sebelumnya
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updatePage(page + 1)}
                    disabled={search.isFetching || page >= totalPages}
                    data-testid="button-member-next-page"
                  >
                     Berikutnya <ChevronRight className="size-4 ml-1" />
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
  const [bindingPage, setBindingPage] = useState(1);
  const trackedBindingPageRecovery = useRef<string | null>(null);
  const pendingFilterAnalytics = useRef<{
    event: 'binding_filters_applied' | 'binding_filters_cleared';
    roleFilter: CanonicalRole | 'ALL';
    statusFilter: UserRoleBindingStatus | 'ALL';
  } | null>(null);
  const bindingFilters = {
    ...(roleFilter === 'ALL' ? {} : { roleCode: roleFilter }),
    ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
    page: bindingPage,
    limit: 20,
  };
  const { data: bindings, isLoading, isFetching, isError } = useGetUserRoleBindings(userId, bindingFilters, {
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
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const hasActiveFilters = roleFilter !== 'ALL' || statusFilter !== 'ALL';
  const bindingTotalPages = bindings ? Math.max(1, Math.ceil(bindings.total / bindings.limit)) : 1;

  useEffect(() => {
    if (bindings && bindingPage > bindingTotalPages) {
      const recoveryKey = `${bindingPage}:${bindingTotalPages}:${roleFilter}:${statusFilter}`;
      if (trackedBindingPageRecovery.current !== recoveryKey) {
        trackAccessReviewEvent('binding_page_recovered', {
          previous_page: bindingPage,
          recovered_page: bindingTotalPages,
          role_filter: roleFilter,
          status_filter: statusFilter,
        });
        trackedBindingPageRecovery.current = recoveryKey;
      }
      setBindingPage(bindingTotalPages);
    }
  }, [
    bindings,
    bindingPage,
    bindingTotalPages,
    roleFilter,
    statusFilter,
  ]);

  useEffect(() => {
    const pending = pendingFilterAnalytics.current;
    if (
      !pending ||
      isFetching ||
      isError ||
      !bindings ||
      pending.roleFilter !== roleFilter ||
      pending.statusFilter !== statusFilter
    ) {
      return;
    }

    pendingFilterAnalytics.current = null;
    trackAccessReviewEvent(pending.event, {
      role_filter: roleFilter,
      status_filter: statusFilter,
      result_count_bucket: getResultCountBucket(bindings.total),
    });
  }, [bindings, isError, isFetching, roleFilter, statusFilter]);

  const updateBindingFilters = (
    nextRoleFilter: CanonicalRole | 'ALL',
    nextStatusFilter: UserRoleBindingStatus | 'ALL',
    event: 'binding_filters_applied' | 'binding_filters_cleared',
  ) => {
    pendingFilterAnalytics.current = {
      event,
      roleFilter: nextRoleFilter,
      statusFilter: nextStatusFilter,
    };
    setRoleFilter(nextRoleFilter);
    setStatusFilter(nextStatusFilter);
    setBindingPage(1);
  };

  const navigateBindingPage = (direction: 'previous' | 'next') => {
    const nextPage = direction === 'previous'
      ? Math.max(1, bindingPage - 1)
      : bindingPage + 1;

    setBindingPage(nextPage);
    trackAccessReviewEvent('binding_page_navigated', {
      direction,
      page: nextPage,
      role_filter: roleFilter,
      status_filter: statusFilter,
    });
  };

  const handleExport = async () => {
    const analyticsDimensions = {
      role_filter_active: roleFilter !== 'ALL',
      status_filter_active: statusFilter !== 'ALL',
    };

    setIsExporting(true);
    try {
      const contents = await exportUserRoleBindings(userId, {
        ...(roleFilter === 'ALL' ? {} : { roleCode: roleFilter }),
        ...(statusFilter === 'ALL' ? {} : { status: statusFilter }),
      });
      const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
      let link: HTMLAnchorElement | undefined;
      try {
        link = document.createElement('a');
        link.href = url;
        link.download = `member-access-review-${userId}.csv`;
        document.body.appendChild(link);
        link.click();
      } finally {
        try {
          link?.remove();
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      toast({ title: 'Access review exported' });
      trackAccessReviewEvent('access_review_export', {
        outcome: 'success',
        ...analyticsDimensions,
      });
    } catch (error) {
      trackAccessReviewEvent('access_review_export', {
        outcome: 'failure',
        ...analyticsDimensions,
      });
      const description = error && typeof error === 'object' && 'data' in error
        ? (error.data as { error?: string })?.error
        : undefined;
      toast({
        title: 'Failed to export access review',
        description: description ?? 'Check your access and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    pendingFilterAnalytics.current = null;
    setRoleFilter('ALL');
    setStatusFilter('ALL');
    setBindingPage(1);
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
           <h3 className="font-semibold">Penetapan Peran untuk {member.displayName}</h3>
          <div className="mt-1 text-xs text-muted-foreground">
            {member.email} · {member.organizationName} ·{' '}
            <code data-testid={`display-userid-${userId}`}>{userId}</code>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
            data-testid="button-export-bindings"
          >
             <Download className="size-4 mr-2" /> {isExporting ? 'Mengekspor...' : 'Ekspor CSV'}
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setIsCreateOpen(true)} disabled={!activeOrgId} data-testid="button-new-binding">
               <UserPlus className="size-4 mr-2" /> Penetapan Baru
            </Button>
          )}
        </div>
      </div>

      {canManage && !activeOrgId && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="size-4" />
           Anda harus memilih organisasi aktif untuk mengelola penetapan.
        </div>
      )}

      <div className="p-4 border-b border-border bg-muted/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="binding-role-filter">Peran</label>
            <Select value={roleFilter} onValueChange={(value) => {
              const nextRoleFilter = value as CanonicalRole | 'ALL';
              updateBindingFilters(
                nextRoleFilter,
                statusFilter,
                nextRoleFilter === 'ALL' ? 'binding_filters_cleared' : 'binding_filters_applied',
              );
            }}>
              <SelectTrigger id="binding-role-filter" data-testid="select-binding-role-filter">
                 <SelectValue placeholder="Semua peran" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="ALL">Semua peran</SelectItem>
                {canonicalRoleOptions.map((role) => (
                   <SelectItem key={role} value={role}>{displayLabel(role)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-sm font-medium" htmlFor="binding-status-filter">Status</label>
            <Select value={statusFilter} onValueChange={(value) => {
              const nextStatusFilter = value as UserRoleBindingStatus | 'ALL';
              updateBindingFilters(
                roleFilter,
                nextStatusFilter,
                nextStatusFilter === 'ALL' ? 'binding_filters_cleared' : 'binding_filters_applied',
              );
            }}>
              <SelectTrigger id="binding-status-filter" data-testid="select-binding-status-filter">
                 <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                 <SelectItem value="ALL">Semua status</SelectItem>
                {bindingStatusOptions.map((status) => (
                   <SelectItem key={status} value={status}>{displayLabel(status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                updateBindingFilters('ALL', 'ALL', 'binding_filters_cleared');
              }}
              data-testid="button-clear-binding-filters"
            >
               Hapus filter
            </Button>
          )}
        </div>
      </div>

      {bindings?.items.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Search className="size-6 opacity-50" />
          </div>
          {hasActiveFilters ? (
            <>
               <p className="font-medium text-foreground">Tidak ada penetapan yang cocok dengan filter ini.</p>
               <p className="mt-1 text-sm">Coba peran atau status lain, atau hapus filter.</p>
            </>
          ) : (
             <p>Tidak ada penetapan peran untuk pengguna ini.</p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {bindings?.items.map(binding => (
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

      {bindings && bindings.total > 0 && (
        <div className="p-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground" data-testid="binding-page-summary">
             Halaman {bindings.page} dari {bindingTotalPages} · {bindings.total} hasil
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigateBindingPage('previous')}
              disabled={bindingPage <= 1}
              data-testid="button-binding-previous-page"
            >
               <ChevronLeft className="size-4 mr-1" /> Sebelumnya
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigateBindingPage('next')}
              disabled={bindingPage >= bindingTotalPages}
              data-testid="button-binding-next-page"
            >
               Berikutnya <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {canManage && activeOrgId && (
        <CreateBindingDialog 
          userId={userId}
          orgId={member.organizationId}
          organizationName={member.organizationName}
          roles={roles || []}
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      )}

      {canManage && editingBinding && (
        <EditBindingDialog
          binding={editingBinding}
          organizationName={member.organizationName}
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
       ? `${bindingName} kedaluwarsa dan hanya dapat dibaca. Penangguhan, pengeditan masa berlaku, dan pencabutan permanen tidak tersedia.`
    : isSuspended
       ? `${bindingName} ditangguhkan. Dapat diaktifkan kembali, diedit, atau dicabut permanen.`
       : `${bindingName} aktif. Dapat ditangguhkan, diedit, atau dicabut permanen.`;
  const scopeTargetLabel = binding.scopeTargetStatus === 'RESOLVED'
    ? binding.scopeTargetName
    : binding.scopeTargetStatus === 'MISSING'
      ? binding.scopeTargetName
        ? `${binding.scopeTargetName} (historical)`
         : 'Target hilang atau historis'
       : 'Tidak ada target bernama';

  const revokeMutation = useRevokeUserRoleBinding();
  const updateMutation = useUpdateUserRoleBinding();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleRevoke = () => {
    revokeMutation.mutate({ userId, bindingId: binding.id }, {
      onSuccess: () => {
         toast({ title: 'Penetapan dicabut' });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
           title: 'Gagal mencabut penetapan',
           description: errData?.error || 'Kesalahan tidak diketahui',
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
         toast({ title: `Penetapan ${newStatus === 'ACTIVE' ? 'diaktifkan' : 'ditangguhkan'}` });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
           title: `Gagal ${isSuspended ? 'mengaktifkan kembali' : 'menangguhkan'} penetapan`,
           description: errData?.error || 'Kesalahan tidak diketahui',
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
             {displayLabel(binding.status)}
          </Badge>
          <span id={`binding-status-description-${binding.id}`} className="sr-only">
            {statusDescription}
          </span>
        </div>
        <div className="text-sm">
          <span className="font-medium" data-testid={`display-scopename-${binding.id}`}>
             {displayLabel(binding.scopeType)}: {scopeTargetLabel}
          </span>
        </div>
        {binding.scopeTargetStatus !== 'NOT_APPLICABLE' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {binding.scopeTargetCode && (
              <span data-testid={`display-scopecode-${binding.id}`}>
                Kode: <span className="font-mono text-foreground">{binding.scopeTargetCode}</span>
              </span>
            )}
            {binding.scopeTargetParentPath && binding.scopeTargetParentPath.length > 0 && (
              <span data-testid={`display-scopehierarchy-${binding.id}`}>
                Hierarki: {binding.scopeTargetParentPath.join(' › ')}
              </span>
            )}
            {binding.scopeTargetStatus === 'MISSING' && (
              <span className="text-amber-700 dark:text-amber-400" data-testid={`display-scopehistorical-${binding.id}`}>
                Target historis atau tidak lagi tersedia
              </span>
            )}
          </div>
        )}
        <div className="text-xs font-mono text-muted-foreground flex gap-3 flex-wrap">
           <span data-testid={`display-roleid-${binding.id}`}>ID Peran: {binding.roleId}</span>
          <span data-testid={`display-scope-${binding.id}`}>
             ID Cakupan: {binding.scopeId ?? 'Tidak ada'}
          </span>
           <span data-testid={`display-org-${binding.id}`}>Organisasi: {binding.organizationId}</span>
        </div>
        {(binding.startsAt || binding.endsAt) && (
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="size-3" />
             {binding.startsAt ? new Date(binding.startsAt).toLocaleDateString() : 'Selalu'}
            {' → '} 
             {binding.endsAt ? new Date(binding.endsAt).toLocaleDateString() : 'Selamanya'}
          </div>
        )}
      </div>

      {canManage && <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleToggleSuspend}
          disabled={isExpired || updateMutation.isPending}
           aria-label={`${isSuspended ? 'Aktifkan kembali' : 'Tangguhkan'} ${bindingName}`}
          aria-describedby={isExpired ? `binding-status-description-${binding.id}` : undefined}
           title={isSuspended ? "Aktifkan kembali" : "Tangguhkan"}
          data-testid={`button-toggle-suspend-${binding.id}`}
        >
          {isSuspended ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={onEdit}
          disabled={isExpired}
           aria-label={`Ubah masa berlaku dan cakupan ${bindingName}`}
          aria-describedby={isExpired ? `binding-status-description-${binding.id}` : undefined}
           title="Ubah Masa Berlaku/Cakupan"
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
               aria-label={`Cabut permanen ${bindingName}`}
              aria-describedby={isExpired ? `binding-status-description-${binding.id}` : undefined}
               title="Cabut Permanen"
              data-testid={`button-revoke-binding-${binding.id}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent data-testid={`revoke-dialog-${binding.id}`}>
            <AlertDialogHeader>
             <AlertDialogTitle>Cabut Penetapan Secara Permanen?</AlertDialogTitle>
              <AlertDialogDescription>
                 Tindakan ini tidak dapat dibatalkan. Pencabutan penetapan akan menghapusnya secara permanen dari profil akses pengguna.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
             <AlertDialogCancel aria-label={`Batalkan pencabutan permanen ${bindingName}`}>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevoke}
                 aria-label={`Konfirmasi pencabutan permanen ${bindingName}`}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-revoke"
              >
                 Cabut permanen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>}
    </div>
  );
}

const createSchema = z.object({
  roleId: z.string().min(1, 'Peran wajib diisi'),
  scopeType: z.nativeEnum(ScopeType),
  scopeId: z.string().optional(),
  endsAt: z.string().optional()
}).refine(data => {
  if (data.scopeType !== 'ORGANIZATION' && data.scopeType !== 'PLATFORM' && !data.scopeId) {
    return false;
  }
  return true;
}, {
   message: "ID cakupan wajib diisi untuk cakupan non-organisasi",
  path: ["scopeId"]
});

type CreateValues = z.infer<typeof createSchema>;

const namedScopeTypes = new Set<ScopeType>([
  'FACILITY',
  'BUILDING',
  'SPACE',
  'ASSET',
  'TEAM',
  'VENDOR_ASSIGNMENT',
]);

const parentSearchableScopeTypes = new Set<ScopeType>(['BUILDING', 'SPACE', 'ASSET']);

export function ScopeTargetPicker({
  organizationId,
  organizationName,
  scopeType,
  value,
  currentTarget,
  onChange,
  testId,
}: {
  organizationId: string;
  organizationName: string;
  scopeType: ScopeType;
  value: string;
  currentTarget?: { id: string; name: string | null; status: UserRoleBinding['scopeTargetStatus'] };
  onChange: (value: string) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<RoleBindingScopeTarget | null>(
    currentTarget?.status === 'RESOLVED' && currentTarget.name
      ? { id: currentTarget.id, name: currentTarget.name, code: null, parentPath: [], scopeType, organizationId }
      : null,
  );
  const params = { scopeType, organizationId, query: query || undefined, limit: 20 };
  const canSearchParentLocations = parentSearchableScopeTypes.has(scopeType);
  const search = useSearchRoleBindingScopeTargets(params, {
    query: {
      enabled: open && namedScopeTypes.has(scopeType),
      queryKey: getSearchRoleBindingScopeTargetsQueryKey(params),
    },
  });

  useEffect(() => {
    setQuery('');
    setOpen(false);
    setSelectedTarget(
      currentTarget?.id === value && currentTarget.status === 'RESOLVED' && currentTarget.name
        ? { id: currentTarget.id, name: currentTarget.name, code: null, parentPath: [], scopeType, organizationId }
        : null,
    );
  }, [scopeType, organizationId, currentTarget?.id, currentTarget?.name, currentTarget?.status]);

  if (scopeType === 'PLATFORM') {
    return <div className="rounded-md border px-3 py-2 text-sm">Platform</div>;
  }
  if (scopeType === 'ORGANIZATION') {
    return <div className="rounded-md border px-3 py-2 text-sm">{organizationName}</div>;
  }
  if (!namedScopeTypes.has(scopeType)) {
    return (
      <div className="space-y-1.5">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
           placeholder="Masukkan ID target stabil"
          data-testid={testId}
        />
        <p className="text-xs text-muted-foreground">
           Direktori bernama tidak tersedia untuk tipe cakupan ini. Masukkan ID stabilnya.
        </p>
      </div>
    );
  }

  const historicalTarget = value && currentTarget?.id === value && currentTarget.status === 'MISSING';
  return (
    <div className="space-y-2">
      {historicalTarget && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <div className="font-medium">
             {currentTarget?.name ? `${currentTarget.name} (historis)` : 'Target hilang atau historis'}
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">
             Target tersimpan ini tetap terlihat, tetapi pilih target saat ini sebelum mengubah cakupan.
          </div>
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            data-testid={testId}
          >
            <span className="min-w-0 text-left">
              <span className="block truncate">
                 {selectedTarget?.name ?? (historicalTarget ? 'Pilih target saat ini' : `Pilih ${scopeType.toLowerCase()}`)}
              </span>
              {selectedTarget && (selectedTarget.code || selectedTarget.parentPath.length > 0) && (
                <span className="block truncate text-xs text-muted-foreground">
                  {[selectedTarget.code, selectedTarget.parentPath.join(' / ')].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
               placeholder={canSearchParentLocations
                 ? `Cari ${scopeType.toLowerCase()}, kode, atau lokasi induk`
                 : `Cari ${scopeType.toLowerCase()} berdasarkan nama atau kode`}
              value={query}
              onValueChange={setQuery}
            />
            {canSearchParentLocations && (
              <p className="border-b px-3 pb-2 text-xs text-muted-foreground" data-testid={`${testId}-search-help`}>
                Nama fasilitas, gedung, dan ruang induk juga dapat dicari.
              </p>
            )}
            <CommandList>
              {search.isFetching ? (
                 <div className="py-6 text-center text-sm text-muted-foreground">Mencari...</div>
              ) : (
                <>
                   <CommandEmpty>Target saat ini tidak ditemukan.</CommandEmpty>
                  <CommandGroup>
                    {search.data?.map((target) => (
                      <CommandItem
                        key={target.id}
                        value={target.id}
                        onSelect={() => {
                          setSelectedTarget(target);
                          onChange(target.id);
                          setOpen(false);
                        }}
                        data-testid={`${testId}-option-${target.id}`}
                      >
                        <Check className={value === target.id ? 'opacity-100' : 'opacity-0'} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{target.name}</span>
                          {(target.code || target.parentPath.length > 0) && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {[target.code, target.parentPath.join(' / ')].filter(Boolean).join(' · ')}
                            </span>
                          )}
                          <span className="block truncate font-mono text-[11px] text-muted-foreground/80">{target.id}</span>
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
    </div>
  );
}

function CreateBindingDialog({ userId, orgId, organizationName, roles, open, onOpenChange }: {
  userId: string;
  orgId: string;
  organizationName: string;
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
  const scopeType = form.watch('scopeType');

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
         toast({ title: 'Penetapan berhasil dibuat' });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
        onOpenChange(false);
        form.reset();
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
           title: 'Gagal membuat penetapan',
           description: errData?.error || 'Kesalahan tidak diketahui',
          variant: 'destructive'
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
           <DialogTitle>Buat Penetapan Peran</DialogTitle>
          <DialogDescription>
             Berikan peran kepada pengguna <code className="text-xs bg-muted px-1 py-0.5">{userId}</code>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                   <FormLabel>Peran</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-role">
                       <SelectValue placeholder="Pilih peran" />
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
            
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="scopeType"
                render={({ field }) => (
                  <FormItem>
                     <FormLabel>Tipe Cakupan</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue('scopeId', '');
                      }}
                      value={field.value}
                    >
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
                     <FormLabel>Target Cakupan</FormLabel>
                    <FormControl>
                      <ScopeTargetPicker
                        organizationId={orgId}
                        organizationName={organizationName}
                        scopeType={scopeType}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        testId="input-scopeid"
                      />
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
                 <FormLabel>Tanggal Kedaluwarsa (Opsional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-endsat" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-binding">
                 {createMutation.isPending ? 'Membuat...' : 'Buat Penetapan'}
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
  if (data.scopeType !== 'ORGANIZATION' && data.scopeType !== 'PLATFORM' && !data.scopeId) {
    return false;
  }
  return true;
}, {
   message: "ID cakupan wajib diisi untuk cakupan non-organisasi",
  path: ["scopeId"]
});

type EditValues = z.infer<typeof editSchema>;

function EditBindingDialog({ userId, binding, organizationName, open, onOpenChange }: {
  userId: string;
  binding: UserRoleBinding;
  organizationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdateUserRoleBinding();
  const [pendingBroaderScope, setPendingBroaderScope] = useState<EditValues | null>(null);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      scopeType: binding.scopeType,
      scopeId: binding.scopeId || '',
      endsAt: binding.endsAt ? new Date(binding.endsAt).toISOString().split('T')[0] : ''
    }
  });
  const scopeType = form.watch('scopeType');

  const saveBinding = (values: EditValues) => {
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
         toast({ title: 'Penetapan berhasil diperbarui' });
        queryClient.invalidateQueries({ queryKey: getGetUserRoleBindingsQueryKey(userId) });
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
        onOpenChange(false);
      },
      onError: (error: any) => {
        const errData = error.data as { error?: string };
        toast({ 
           title: 'Gagal memperbarui penetapan',
           description: errData?.error || 'Kesalahan tidak diketahui',
          variant: 'destructive'
        });
      }
    });
  };

  const onSubmit = (values: EditValues) => {
    if (doesBindingScopeBroaden(binding.scopeType, values.scopeType)) {
      setPendingBroaderScope(values);
      return;
    }

    saveBinding(values);
  };

  const currentScopeDescription = describeBindingScope(binding.scopeType, binding.scopeId, {
    organizationName,
    targetName: binding.scopeTargetName,
  });
  const broaderScopeDescription = pendingBroaderScope
    ? describeBindingScope(pendingBroaderScope.scopeType, pendingBroaderScope.scopeId, {
        organizationName,
      })
    : '';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
        <DialogHeader>
           <DialogTitle>Ubah Penetapan Peran</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="scopeType"
                render={({ field }) => (
                  <FormItem>
                     <FormLabel>Tipe Cakupan</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== binding.scopeType) form.setValue('scopeId', '');
                        else form.setValue('scopeId', binding.scopeId ?? '');
                      }}
                      value={field.value}
                    >
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
                     <FormLabel>Target Cakupan</FormLabel>
                    <FormControl>
                      <ScopeTargetPicker
                        organizationId={binding.organizationId}
                        organizationName={organizationName}
                        scopeType={scopeType}
                        value={field.value ?? ''}
                        currentTarget={scopeType === binding.scopeType && binding.scopeId ? {
                          id: binding.scopeId,
                          name: binding.scopeTargetName,
                          status: binding.scopeTargetStatus,
                        } : undefined}
                        onChange={field.onChange}
                        testId="input-edit-scopeid"
                      />
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
                 <FormLabel>Tanggal Kedaluwarsa (Opsional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} data-testid="input-edit-endsat" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-binding">
                 {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingBroaderScope !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen && !updateMutation.isPending) setPendingBroaderScope(null);
        }}
      >
        <AlertDialogContent data-testid="broader-scope-confirmation">
          <AlertDialogHeader>
           <AlertDialogTitle>Perluas akses penetapan ini?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                 <p>Perubahan cakupan ini dapat memberikan akses ke lebih banyak sumber daya.</p>
                <dl className="grid gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                  <div>
                     <dt className="font-medium text-foreground">Cakupan saat ini</dt>
                    <dd data-testid="broader-scope-current">{currentScopeDescription}</dd>
                  </div>
                  <div>
                     <dt className="font-medium text-foreground">Cakupan baru</dt>
                    <dd data-testid="broader-scope-new">{broaderScopeDescription}</dd>
                  </div>
                </dl>
                 <p>Konfirmasikan bahwa akses yang lebih luas ini memang dimaksudkan sebelum menyimpan.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel disabled={updateMutation.isPending}>Lanjutkan mengedit</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingBroaderScope) saveBinding(pendingBroaderScope);
              }}
              disabled={updateMutation.isPending}
              data-testid="button-confirm-broader-scope"
            >
               {updateMutation.isPending ? 'Menyimpan...' : 'Konfirmasi akses lebih luas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
