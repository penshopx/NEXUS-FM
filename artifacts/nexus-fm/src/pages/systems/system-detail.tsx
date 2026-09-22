import { getSafeMutationMessage } from '@/lib/utils';
import {
 useState } from 'react';
import {
 useRoute } from 'wouter';
import {
 useQueryClient } from '@tanstack/react-query';
import {
 
  useGetSystem,
  getGetSystemQueryKey,
  useGetSpace,
  getGetSpaceQueryKey,
  useGetBuilding,
  getGetBuildingQueryKey,
  useGetFacility,
  getGetFacilityQueryKey,
  useListSystemAssets,
  useCreateSystemAsset,
  useUpdateAsset,
  useDeleteAsset,
  getListSystemAssetsQueryKey,
  Asset,
  RegistryInput,
  RegistryRecord,
} from '@workspace/api-client-react';
import {
 RegistryList } from '@/components/registry/registry-list';
import {
 RegistryForm } from '@/components/registry/registry-form';
import {
 Breadcrumbs } from '@/components/registry/breadcrumbs';
import {
 Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
 AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
 useToast } from '@/hooks/use-toast';
import {
 Skeleton } from '@/components/ui/skeleton';
import { useRegistryCursorPagination } from '@/hooks/use-registry-cursor-pagination';
import {
 ApiErrorState } from '@/components/api-error-state';

export function SystemDetailPage() {
  const [, params] = useRoute('/app/systems/:id');
  const systemId = params?.id || '';
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: system, isLoading: systemLoading, error: systemError } = useGetSystem(systemId, {
    query: { enabled: !!systemId, queryKey: getGetSystemQueryKey(systemId || "") }
  });
  
  const spaceId = system?.spaceId;
  const buildingId = system?.buildingId;
  const facilityId = system?.facilityId;
  
  const { data: space } = useGetSpace(spaceId || '', { query: { enabled: !!spaceId, queryKey: getGetSpaceQueryKey(spaceId || "") } });
  const { data: building } = useGetBuilding(buildingId || '', { query: { enabled: !!buildingId, queryKey: getGetBuildingQueryKey(buildingId || "") } });
  const { data: facility } = useGetFacility(facilityId || '', { query: { enabled: !!facilityId, queryKey: getGetFacilityQueryKey(facilityId || "") } });
  
  const pagination = useRegistryCursorPagination();
  const limit = 10;

  const listParams = { q: pagination.registrySearch, cursor: pagination.cursor, limit };
  const { data: assetsData, isLoading: assetsLoading, error: assetsError } = useListSystemAssets(
    systemId,
    listParams,
    { query: { enabled: !!systemId, queryKey: getListSystemAssetsQueryKey(systemId, listParams) } }
  );
  
  const allAssets = (assetsData?.items || []) ;
  
  const createAsset = useCreateSystemAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<RegistryRecord | null>(null);
  
  const handleCreate = (values: RegistryInput,) => {
    createAsset.mutate({ id: systemId, data: { ...values, spaceId: spaceId!, systemId } }, {
      onSuccess: () => {
         toast({ title: 'Aset berhasil dibuat' });
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: [`/api/systems/${systemId}/assets`] });
      },
      onError: (err) => {
         toast({ title: 'Gagal membuat aset', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleUpdate = (values: RegistryInput,) => {
    if (!editingItem) return;
    updateAsset.mutate({ id: editingItem.id, data: values }, {
      onSuccess: () => {
         toast({ title: 'Aset berhasil diperbarui' });
        setEditingItem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/systems/${systemId}/assets`] });
      },
      onError: (err) => {
         toast({ title: 'Gagal memperbarui aset', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleDelete = () => {
    if (!deletingItem) return;
    deleteAsset.mutate({ id: deletingItem.id }, {
      onSuccess: () => {
         toast({ title: 'Aset berhasil dihapus' });
        setDeletingItem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/systems/${systemId}/assets`] });
      },
      onError: (err) => {
         toast({ title: 'Gagal menghapus aset', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  if (systemLoading) {
    return <div className="p-8 space-y-4 max-w-6xl mx-auto"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  
  if (systemError || !system) {
    return <ApiErrorState error={systemError || { status: 404 }} title="Sistem Tidak Ditemukan" goBackHref="/app/facilities" />;
  }
  
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <Breadcrumbs 
        items={[
           { label: 'Fasilitas', href: '/app/facilities' },
          ...(facility ? [{ label: facility.name, href: `/app/facilities/${facility.id}` }] : []),
          ...(building ? [{ label: building.name, href: `/app/buildings/${building.id}` }] : []),
          ...(space ? [{ label: space.name, href: `/app/spaces/${space.id}` }] : []),
          { label: system.name }
        ]} 
      />
      
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{system.name}</h1>
        <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
           {system.code && <span>Kode: {system.code}</span>}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            system.status === 'ACTIVE' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted border-border'
          }`}>
            {system.status === 'ACTIVE' ? 'Aktif' : 'Tidak aktif'}
          </span>
        </div>
        {system.description && <p className="mt-4 text-muted-foreground max-w-3xl">{system.description}</p>}
      </div>
      
      {assetsError ? (
         <ApiErrorState error={assetsError} title="Gagal Memuat Aset" />
      ) : (
        <RegistryList
           title="Aset"
           description={`Kelola aset fisik yang terhubung ke ${system.name}.`}
          items={allAssets}
          isLoading={assetsLoading}
          searchQuery={pagination.search}
          onSearchChange={pagination.setSearch}
          page={pagination.page}
          totalItems={assetsData?.total || 0}
          limit={limit}
          hasNextPage={!!assetsData?.nextCursor}
          canGoPrevious={pagination.canGoPrevious}
          onNextPage={() => assetsData?.nextCursor && pagination.goNext(assetsData.nextCursor)}
          onPreviousPage={pagination.goPrevious}
          onCreate={system.capabilities.createChildren.ASSET ? () => setIsCreateOpen(true) : undefined}
          onEdit={(item) => setEditingItem(item)}
          onDelete={(item) => setDeletingItem(item)}
          renderItemLink={(item) => `/app/assets/${item.id}`} testIdPrefix="assets"
        />
      )}
      
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
             <DialogTitle>Buat Aset</DialogTitle>
             <DialogDescription>Tambahkan aset baru ke {system.name}.</DialogDescription>
          </DialogHeader>
          <RegistryForm
            onSubmit={handleCreate}
            isPending={createAsset.isPending}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
             <DialogTitle>Edit Aset</DialogTitle>
             <DialogDescription>Perbarui detail aset.</DialogDescription>
          </DialogHeader>
          {editingItem && (
            <RegistryForm
              defaultValues={editingItem}
              onSubmit={handleUpdate}
              isPending={updateAsset.isPending}
              onCancel={() => setEditingItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
             <AlertDialogTitle>Apakah Anda benar-benar yakin?</AlertDialogTitle>
            <AlertDialogDescription>
               Tindakan ini akan menghapus permanen aset "{deletingItem?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel disabled={deleteAsset.isPending} data-testid="dialog-delete-cancel">Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteAsset.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="dialog-delete-confirm"
            >
               {deleteAsset.isPending ? 'Menghapus...' : 'Hapus Aset'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}