import { getSafeMutationMessage } from '@/lib/utils';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useListFacilities, 
  useCreateFacility, 
  useUpdateFacility, 
  useDeleteFacility,
  getListFacilitiesQueryKey,
  Facility,
  RegistryInput,
  RegistryRecord,
} from '@workspace/api-client-react';
import { RegistryList } from '@/components/registry/registry-list';
import { RegistryForm } from '@/components/registry/registry-form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { ApiErrorState } from '@/components/api-error-state';
import { PortfolioImportDialog } from '@/components/registry/portfolio-import-dialog';
import { useRegistryCursorPagination } from '@/hooks/use-registry-cursor-pagination';

export function FacilitiesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const pagination = useRegistryCursorPagination({ resourceType: 'facility' });
  const limit = 10;

  const listParams = { q: pagination.registrySearch, cursor: pagination.cursor, limit };
  const { data, isLoading, error } = useListFacilities(
    listParams,
    { query: { queryKey: getListFacilitiesQueryKey(listParams) } }
  );
  
  const createFacility = useCreateFacility();
  const updateFacility = useUpdateFacility();
  const deleteFacility = useDeleteFacility();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<RegistryRecord | null>(null);
  
  const handleCreate = (values: RegistryInput) => {
    createFacility.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: 'Fasilitas berhasil dibuat' });
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/api/facilities'] });
      },
      onError: (err) => {
        toast({ title: 'Gagal membuat fasilitas', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleUpdate = (values: RegistryInput) => {
    if (!editingItem) return;
    updateFacility.mutate({ id: editingItem.id, data: values }, {
      onSuccess: () => {
        toast({ title: 'Fasilitas berhasil diperbarui' });
        setEditingItem(null);
        queryClient.invalidateQueries({ queryKey: ['/api/facilities'] });
      },
      onError: (err) => {
        toast({ title: 'Gagal memperbarui fasilitas', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleDelete = () => {
    if (!deletingItem) return;
    deleteFacility.mutate({ id: deletingItem.id }, {
      onSuccess: () => {
        toast({ title: 'Fasilitas berhasil dihapus' });
        setDeletingItem(null);
        queryClient.invalidateQueries({ queryKey: ['/api/facilities'] });
      },
      onError: (err) => {
        toast({ title: 'Gagal menghapus fasilitas', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  if (error) {
    return <ApiErrorState error={error} title="Gagal Memuat Fasilitas" />;
  }
  
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <RegistryList
        title="Fasilitas"
        description="Kelola fasilitas tingkat teratas di seluruh portofolio properti Anda."
        items={data?.items as RegistryRecord[]}
        isLoading={isLoading}
        searchQuery={pagination.search}
        onSearchChange={pagination.setSearch}
        page={pagination.page}
        totalItems={data?.total || 0}
        limit={limit}
        hasNextPage={!!data?.nextCursor}
        canGoPrevious={pagination.canGoPrevious}
        onNextPage={() => data?.nextCursor && pagination.goNext(data.nextCursor)}
        onPreviousPage={pagination.goPrevious}
        onCreate={data?.collectionCapabilities?.create ? () => setIsCreateOpen(true) : undefined}
        onImport={data?.collectionCapabilities?.create ? () => setIsImportOpen(true) : undefined}
        onEdit={(item) => setEditingItem(item)}
        onDelete={(item) => setDeletingItem(item)}
        renderItemLink={(item) => `/app/facilities/${item.id}`}
      />

      <PortfolioImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImported={(imported) => {
          toast({
            title: 'Portofolio berhasil diimpor',
            description: `${imported} ${imported === 1 ? 'catatan berhasil' : 'catatan berhasil'} dibuat.`,
          });
          pagination.reset();
          queryClient.invalidateQueries({ queryKey: getListFacilitiesQueryKey() });
        }}
      />
      
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Buat Fasilitas</DialogTitle>
            <DialogDescription>Tambahkan fasilitas baru ke portofolio organisasi.</DialogDescription>
          </DialogHeader>
          <RegistryForm
            onSubmit={handleCreate}
            isPending={createFacility.isPending}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Fasilitas</DialogTitle>
            <DialogDescription>Perbarui detail fasilitas.</DialogDescription>
          </DialogHeader>
          {editingItem && (
            <RegistryForm
              defaultValues={editingItem}
              onSubmit={handleUpdate}
              isPending={updateFacility.isPending}
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
              Tindakan ini akan menghapus permanen fasilitas "{deletingItem?.name}" beserta bangunan, ruang, sistem, dan aset terkait. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFacility.isPending} data-testid="dialog-delete-cancel">Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteFacility.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="dialog-delete-confirm"
            >
              {deleteFacility.isPending ? 'Menghapus...' : 'Hapus Fasilitas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}