import { getSafeMutationMessage } from '@/lib/utils';
import {
 useState } from 'react';
import {
 useRoute } from 'wouter';
import {
 useQueryClient } from '@tanstack/react-query';
import {
 
  useGetSpace,
  useGetBuilding,
  getGetBuildingQueryKey,
  useGetFacility,
  getGetFacilityQueryKey,
  useListBuildingSpaces,
  useCreateBuildingSpace,
  useUpdateSpace,
  useDeleteSpace,
  getListBuildingSpacesQueryKey,
  Space,
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

export function BuildingDetailPage() {
  const [, params] = useRoute('/app/buildings/:id');
  const buildingId = params?.id || '';
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: building, isLoading: buildingLoading, error: buildingError } = useGetBuilding(buildingId, {
    query: { enabled: !!buildingId, queryKey: getGetBuildingQueryKey(buildingId || "") }
  });
  
  const facilityId = building?.facilityId;
  const { data: facility } = useGetFacility(facilityId || '', {
    query: { enabled: !!facilityId, queryKey: getGetFacilityQueryKey(facilityId || "") }
  });
  
  const pagination = useRegistryCursorPagination({ resourceType: 'space' });
  const limit = 10;

  const listParams = { q: pagination.registrySearch, cursor: pagination.cursor, limit };
  const { data: spacesData, isLoading: spacesLoading, error: spacesError } = useListBuildingSpaces(
    buildingId,
    listParams,
    { query: { enabled: !!buildingId, queryKey: getListBuildingSpacesQueryKey(buildingId, listParams) } }
  );
  
  const allSpaces = (spacesData?.items || []) ;
  
  const createSpace = useCreateBuildingSpace();
  const updateSpace = useUpdateSpace();
  const deleteSpace = useDeleteSpace();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<RegistryRecord | null>(null);
  
  const handleCreate = (values: RegistryInput,) => {
    createSpace.mutate({ id: buildingId, data: values }, {
      onSuccess: () => {
         toast({ title: 'Ruang berhasil dibuat' });
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: [`/api/buildings/${buildingId}/spaces`] });
      },
      onError: (err) => {
         toast({ title: 'Gagal membuat ruang', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleUpdate = (values: RegistryInput,) => {
    if (!editingItem) return;
    updateSpace.mutate({ id: editingItem.id, data: values }, {
      onSuccess: () => {
         toast({ title: 'Ruang berhasil diperbarui' });
        setEditingItem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/buildings/${buildingId}/spaces`] });
      },
      onError: (err) => {
         toast({ title: 'Gagal memperbarui ruang', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleDelete = () => {
    if (!deletingItem) return;
    deleteSpace.mutate({ id: deletingItem.id }, {
      onSuccess: () => {
         toast({ title: 'Ruang berhasil dihapus' });
        setDeletingItem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/buildings/${buildingId}/spaces`] });
      },
      onError: (err) => {
         toast({ title: 'Gagal menghapus ruang', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  if (buildingLoading) {
    return <div className="p-8 space-y-4 max-w-6xl mx-auto"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  
  if (buildingError || !building) {
    return <ApiErrorState error={buildingError || { status: 404 }} title="Bangunan Tidak Ditemukan" goBackHref="/app/facilities" />;
  }
  
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <Breadcrumbs 
        items={[
           { label: 'Fasilitas', href: '/app/facilities' },
          ...(facility ? [{ label: facility.name, href: `/app/facilities/${facility.id}` }] : []),
          { label: building.name }
        ]} 
      />
      
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{building.name}</h1>
        <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
           {building.code && <span>Kode: {building.code}</span>}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            building.status === 'ACTIVE' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted border-border'
          }`}>
            {building.status === 'ACTIVE' ? 'Aktif' : 'Tidak aktif'}
          </span>
        </div>
        {building.description && <p className="mt-4 text-muted-foreground max-w-3xl">{building.description}</p>}
      </div>
      
      {spacesError ? (
         <ApiErrorState error={spacesError} title="Gagal Memuat Ruang" />
      ) : (
        <RegistryList
           title="Ruang"
           description={`Kelola ruang fisik di dalam ${building.name}.`}
          items={allSpaces}
          isLoading={spacesLoading}
          searchQuery={pagination.search}
          onSearchChange={pagination.setSearch}
          page={pagination.page}
          totalItems={spacesData?.total || 0}
          limit={limit}
          hasNextPage={!!spacesData?.nextCursor}
          canGoPrevious={pagination.canGoPrevious}
          onNextPage={() => spacesData?.nextCursor && pagination.goNext(spacesData.nextCursor)}
          onPreviousPage={pagination.goPrevious}
          onCreate={building.capabilities.createChildren.SPACE ? () => setIsCreateOpen(true) : undefined}
          onEdit={(item) => setEditingItem(item)}
          onDelete={(item) => setDeletingItem(item)}
          renderItemLink={(item) => `/app/spaces/${item.id}`}
        />
      )}
      
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
           <DialogTitle>Buat Ruang</DialogTitle>
           <DialogDescription>Tambahkan ruang baru ke {building.name}.</DialogDescription>
          </DialogHeader>
          <RegistryForm
            onSubmit={handleCreate}
            isPending={createSpace.isPending}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
           <DialogTitle>Edit Ruang</DialogTitle>
           <DialogDescription>Perbarui detail ruang.</DialogDescription>
          </DialogHeader>
          {editingItem && (
            <RegistryForm
              defaultValues={editingItem}
              onSubmit={handleUpdate}
              isPending={updateSpace.isPending}
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
               Tindakan ini akan menghapus permanen ruang "{deletingItem?.name}" beserta sistem dan aset terkait.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
           <AlertDialogCancel disabled={deleteSpace.isPending} data-testid="dialog-delete-cancel">Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteSpace.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="dialog-delete-confirm"
            >
               {deleteSpace.isPending ? 'Menghapus...' : 'Hapus Ruang'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}