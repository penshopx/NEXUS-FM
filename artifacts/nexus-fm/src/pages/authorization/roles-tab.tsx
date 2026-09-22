import { useState, useRef, useMemo, useEffect } from 'react';
import { 
  useListRoles, 
  useGetRolePermissions, 
  useUpdateRolePermissions,
  Role,
  RolePermission,
  ScopeType,
  RolePermissionEffect
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  getGetRolePermissionsQueryKey, 
  getGetAuthorizationAuditLogsQueryKey,
  getGetMyPermissionsQueryKey
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, AlertTriangle, Shield, Save, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const displayLabel = (value: string) => value
  .split('_')
  .map((part) => ({
    ALLOW: 'Izinkan',
    DENY: 'Tolak',
    PLATFORM: 'Platform',
    ORGANIZATION: 'Organisasi',
    PORTFOLIO: 'Portofolio',
    FACILITY: 'Fasilitas',
    BUILDING: 'Gedung',
    SPACE: 'Ruang',
    ASSET: 'Aset',
    ASSIGNED: 'Ditugaskan',
    TEAM: 'Tim',
    VENDOR: 'Vendor',
    ASSIGNMENT: 'Penugasan',
    OWNED: 'Dimiliki',
    REQUEST: 'Permintaan',
  }[part] ?? part.toLowerCase()))
  .join(' ');

export function RolesTab() {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const { data: roles, isLoading: rolesLoading } = useListRoles();

  const selectedRole = useMemo(() => roles?.find(r => r.id === selectedRoleId), [roles, selectedRoleId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[700px]">
      {/* Roles List */}
      <div className="md:col-span-4 border border-border rounded-lg bg-card overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border bg-muted/30">
          <h2 className="font-semibold flex items-center gap-2">
            <Shield className="size-4" />
            Peran Kanonis
          </h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {rolesLoading ? (
              Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : (
              roles?.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  data-testid={`role-select-${role.code}`}
                  className={`w-full text-left p-3 rounded-md transition-colors ${
                    selectedRoleId === role.id 
                      ? 'bg-primary text-primary-foreground font-medium' 
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="text-sm truncate">{role.code}</div>
                  <div className="text-xs opacity-70 truncate mt-1">
                    v{role.policyVersion.substring(0, 8)} • {role.status}
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Role Editor */}
      <div className="md:col-span-8 border border-border rounded-lg bg-card overflow-hidden flex flex-col">
        {selectedRole ? (
          <RoleEditor 
            key={selectedRole.id}
            role={selectedRole} 
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
            <KeyRound className="size-12 mb-4 opacity-20" />
            <p>Pilih peran kanonis untuk meninjau atau mengubah kapabilitasnya.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleEditor({ role }: { role: Role }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { 
    data: rolePerms, 
    isLoading: isRolePermsLoading, 
    refetch,
    error: rolePermsError
  } = useGetRolePermissions(role.id, {
    query: {
      enabled: !!role.id,
      queryKey: getGetRolePermissionsQueryKey(role.id)
    }
  });

  const updatePerms = useUpdateRolePermissions();

  const [localPerms, setLocalPerms] = useState<RolePermission[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [conflictError, setConflictError] = useState(false);
  
  const initializedForId = useRef<string | null>(null);

  // Sync when data loads and not editing, inside useEffect to prevent render-time state updates
  useEffect(() => {
    if (rolePerms && initializedForId.current !== role.id && !isEditing) {
      initializedForId.current = role.id;
      setLocalPerms(rolePerms.permissions || []);
      setIsEditing(false);
      setConflictError(false);
    }
  }, [rolePerms, role.id, isEditing]);

  // Handle manual start editing
  const handleEditChange = () => {
    if (!isEditing && rolePerms) {
      setLocalPerms(rolePerms.permissions || []);
      setConflictError(false);
    }
    setIsEditing(!isEditing);
  };

  const handleChangeEffect = (permissionId: string, effect: RolePermissionEffect) => {
    setLocalPerms(prev => prev.map(p => p.permissionId === permissionId ? { ...p, effect } : p));
  };

  const handleChangeScope = (permissionId: string, scopeType: ScopeType) => {
    setLocalPerms(prev => prev.map(p => p.permissionId === permissionId ? { ...p, defaultScopeType: scopeType } : p));
  };

  const handleSave = () => {
    if (!rolePerms) return;

    updatePerms.mutate({
      roleId: role.id,
      data: {
        permissions: localPerms,
        policyVersion: rolePerms.policyVersion
      }
    }, {
      onSuccess: (data) => {
         toast({ title: 'Kebijakan diperbarui', description: 'Izin peran berhasil disimpan.' });
        setIsEditing(false);
        setConflictError(false);
        queryClient.setQueryData(getGetRolePermissionsQueryKey(role.id), data);
        initializedForId.current = null; // force re-sync on next query change (if we needed it)
        
        // Invalidate audit and my-permissions caches
        queryClient.invalidateQueries({ queryKey: getGetAuthorizationAuditLogsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyPermissionsQueryKey() });
      },
      onError: (error: any) => {
        if (error.status === 409) {
          setConflictError(true);
        } else {
          // parse out ApiError data if present
          const errData = error.data as { error?: string };
          toast({ 
             title: 'Gagal memperbarui kebijakan',
             description: errData?.error || 'Kesalahan tidak diketahui',
            variant: 'destructive'
          });
        }
      }
    });
  };

  const handleReloadStale = () => {
    initializedForId.current = null;
    refetch();
    setConflictError(false);
    setIsEditing(false);
  };

  if (isRolePermsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <div className="space-y-2 mt-8">
          {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  if (rolePermsError && !rolePerms) {
    return (
      <div className="p-6 flex flex-col items-center justify-center text-destructive h-full">
        <AlertCircle className="size-8 mb-2" />
         <p>Gagal memuat izin peran.</p>
         <Button variant="outline" className="mt-4" onClick={() => refetch()}>Coba lagi</Button>
      </div>
    );
  }

  // Combine localPerms and derive Resource/Action from 'code' directly
  // Example code: 'ORGANIZATION.VIEW', resource: 'ORGANIZATION', action: 'VIEW'
  const permsToDisplay = isEditing ? localPerms : (rolePerms?.permissions || []);
  
  const groupedPerms = permsToDisplay.reduce((acc, perm) => {
    // If the API provides the code directly on the RolePermission
    const code = perm.code || perm.permissionId;
    const parts = code.split('.');
    const resource = parts.length > 1 ? parts[0] : 'SYSTEM';
    const action = parts.length > 1 ? parts.slice(1).join('.') : code;
    
    if (!acc[resource]) acc[resource] = [];
    acc[resource].push({ ...perm, _actionLabel: action });
    return acc;
  }, {} as Record<string, (RolePermission & { _actionLabel: string })[]>);

  // Sort resources alphabetically
  const sortedResources = Object.keys(groupedPerms).sort();

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-muted/10 flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{role.code}</h2>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
             Versi Kebijakan: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{rolePerms?.policyVersion}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={handleEditChange} data-testid="button-edit-policy">
              Ubah Kebijakan
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleEditChange} disabled={updatePerms.isPending}>
                 Batal
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updatePerms.isPending} data-testid="button-save-policy">
                 {updatePerms.isPending ? 'Menyimpan...' : <><Save className="size-4 mr-2" /> Simpan Perubahan</>}
              </Button>
            </>
          )}
        </div>
      </div>

      {conflictError && (
        <Alert variant="destructive" className="m-4">
          <AlertTriangle className="size-4" />
           <AlertTitle>Pembaruan Bersamaan Terdeteksi (Konflik 409)</AlertTitle>
          <AlertDescription className="text-sm">
             Administrator lain telah memperbarui kebijakan ini sejak Anda memuatnya. Untuk mencegah perubahan mereka tertimpa, penyimpanan Anda ditolak.
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={handleReloadStale}>
                 Muat Ulang Kebijakan Terbaru
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {isEditing && !conflictError && (
        <div className="px-4 pt-4 pb-2 text-sm text-muted-foreground bg-muted/20 border-b border-border">
          <p className="flex items-center gap-2 mb-2">
            <AlertCircle className="size-4 text-primary" />
             <strong>Konkurensi Optimistis:</strong> Perubahan disimpan dengan aman menggunakan <code className="text-xs bg-muted px-1 py-0.5 rounded">policyVersion</code> untuk mencegah penimpaan yang tidak disengaja.
          </p>
          <p className="flex items-center gap-2">
            <AlertCircle className="size-4 text-primary" />
             <strong>Tolak Secara Default:</strong> Kapabilitas yang tidak dicantumkan dalam penetapan kanonis secara otomatis ditolak. Kapabilitas tersebut disimpan sebagai entri DENY eksplisit.
          </p>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-8">
          {sortedResources.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
               Tidak ada izin yang ditetapkan untuk peran ini.
            </div>
          )}
          {sortedResources.map(resource => (
            <div key={resource} className="space-y-3">
              <h3 className="font-semibold text-muted-foreground uppercase tracking-wider text-xs border-b border-border pb-1">
                {resource}
              </h3>
              <div className="grid gap-3">
                {groupedPerms[resource].map(perm => (
                  <div 
                    key={perm.permissionId} 
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-md border border-border bg-card transition-colors"
                    data-testid={`row-permission-${perm.permissionId}`}
                  >
                    <div className="flex items-start gap-3 mb-3 sm:mb-0">
                      <div>
                        <div className="font-medium font-mono text-sm flex items-center gap-2">
                          {perm._actionLabel}
                          {!isEditing && (
                            <Badge variant={perm.effect === 'ALLOW' ? 'default' : 'destructive'} className="h-5 text-[10px] px-1.5 py-0">
                               {displayLabel(perm.effect)}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {perm.code || perm.permissionId}
                        </div>
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2 bg-background p-1.5 rounded-md border border-border">
                        <Select 
                          value={perm.effect} 
                          onValueChange={(val) => handleChangeEffect(perm.permissionId, val as RolePermissionEffect)}
                        >
                          <SelectTrigger className="h-7 w-[90px] text-xs border-none shadow-none focus:ring-0 bg-transparent" data-testid={`select-effect-${perm.permissionId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectItem value="ALLOW" data-testid={`select-effect-ALLOW-${perm.permissionId}`}>Izinkan</SelectItem>
                             <SelectItem value="DENY" data-testid={`select-effect-DENY-${perm.permissionId}`}>Tolak</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <div className="w-px h-4 bg-border"></div>
                        
                        <Select 
                          value={perm.defaultScopeType} 
                          onValueChange={(val) => handleChangeScope(perm.permissionId, val as ScopeType)}
                        >
                          <SelectTrigger className="h-7 w-[120px] text-xs border-none shadow-none focus:ring-0 bg-transparent" data-testid={`select-scope-${perm.permissionId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                             <SelectItem value="PLATFORM">Platform</SelectItem>
                             <SelectItem value="ORGANIZATION">Organisasi</SelectItem>
                             <SelectItem value="PORTFOLIO">Portofolio</SelectItem>
                             <SelectItem value="FACILITY">Fasilitas</SelectItem>
                             <SelectItem value="BUILDING">Gedung</SelectItem>
                             <SelectItem value="SPACE">Ruang</SelectItem>
                             <SelectItem value="ASSET">Aset</SelectItem>
                             <SelectItem value="ASSIGNED">Ditugaskan</SelectItem>
                             <SelectItem value="TEAM">Tim</SelectItem>
                             <SelectItem value="VENDOR_ASSIGNMENT">Penugasan Vendor</SelectItem>
                             <SelectItem value="OWNED_REQUEST">Permintaan Milik</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs font-mono ml-auto opacity-70">
                         {displayLabel(perm.defaultScopeType)}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
