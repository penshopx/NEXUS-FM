import { getSafeMutationMessage } from '@/lib/utils';
import {
 useState, useEffect } from 'react';
import {
 useRoute } from 'wouter';
import {
 useQueryClient } from '@tanstack/react-query';
import {
 
  useGetFacility,
  getGetFacilityQueryKey,
  useListFacilityBuildings,
  useCreateFacilityBuilding,
  useUpdateBuilding,
  useDeleteBuilding,
  getListFacilityBuildingsQueryKey,
  Building,
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
import {
 useDebounce } from '@/hooks/use-debounce';
import {
 ApiErrorState } from '@/components/api-error-state';
import { registrySearchQuery } from '@/lib/registry-search';

export function FacilityDetailPage() {
  const [, params] = useRoute('/app/facilities/:id');
  const facilityId = params?.id || '';
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: facility, isLoading: facilityLoading, error: facilityError } = useGetFacility(facilityId, {
    query: { enabled: !!facilityId, queryKey: getGetFacilityQueryKey(facilityId || "") }
  });
  
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const registrySearch = registrySearchQuery(debouncedSearch);
  const limit = 10;
  
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);
  
  const { data: buildingsData, isLoading: buildingsLoading, error: buildingsError } = useListFacilityBuildings(
    facilityId, 
    { q: registrySearch, page, limit },
    { query: { enabled: !!facilityId, queryKey: getListFacilityBuildingsQueryKey(facilityId, { q: registrySearch, page, limit }) } }
  );
  
  const allBuildings = (buildingsData?.items || []) ;
  
  const createBuilding = useCreateFacilityBuilding();
  const updateBuilding = useUpdateBuilding();
  const deleteBuilding = useDeleteBuilding();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegistryRecord | null>(null);
  const [deletingItem, setDeletingItem] = useState<RegistryRecord | null>(null);
  
  const handleCreate = (values: RegistryInput,) => {
    createBuilding.mutate({ id: facilityId, data: values }, {
      onSuccess: () => {
        toast({ title: 'Building created successfully' });
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: [`/api/facilities/${facilityId}/buildings`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to create building', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleUpdate = (values: RegistryInput,) => {
    if (!editingItem) return;
    updateBuilding.mutate({ id: editingItem.id, data: values }, {
      onSuccess: () => {
        toast({ title: 'Building updated successfully' });
        setEditingItem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/facilities/${facilityId}/buildings`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to update building', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleDelete = () => {
    if (!deletingItem) return;
    deleteBuilding.mutate({ id: deletingItem.id }, {
      onSuccess: () => {
        toast({ title: 'Building deleted successfully' });
        setDeletingItem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/facilities/${facilityId}/buildings`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to delete building', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  if (facilityLoading) {
    return <div className="p-8 space-y-4 max-w-6xl mx-auto"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  
  if (facilityError || !facility) {
    return <ApiErrorState error={facilityError || { status: 404 }} title="Facility Not Found" goBackHref="/app/facilities" />;
  }
  
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <Breadcrumbs 
        items={[
          { label: 'Facilities', href: '/app/facilities' },
          { label: facility.name }
        ]} 
      />
      
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">{facility.name}</h1>
            <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
              {facility.code && <span>Code: {facility.code}</span>}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                facility.status === 'ACTIVE' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted border-border'
              }`}>
                {facility.status}
              </span>
            </div>
            {facility.description && <p className="mt-4 text-muted-foreground max-w-3xl">{facility.description}</p>}
          </div>
        </div>
      </div>
      
      {buildingsError ? (
        <ApiErrorState error={buildingsError} title="Failed to Load Buildings" />
      ) : (
        <RegistryList
          title="Buildings"
          description={`Manage physical buildings within ${facility.name}.`}
          items={allBuildings}
          isLoading={buildingsLoading}
          searchQuery={search}
          onSearchChange={setSearch}
          page={page}
          totalItems={buildingsData?.total || 0}
          limit={limit}
          onPageChange={setPage}
          onCreate={facility.capabilities.createChildren.BUILDING ? () => setIsCreateOpen(true) : undefined}
          onEdit={(item) => setEditingItem(item)}
          onDelete={(item) => setDeletingItem(item)}
          renderItemLink={(item) => `/app/buildings/${item.id}`}
        />
      )}
      
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Building</DialogTitle>
            <DialogDescription>Add a new building to {facility.name}.</DialogDescription>
          </DialogHeader>
          <RegistryForm
            onSubmit={handleCreate}
            isPending={createBuilding.isPending}
            onCancel={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Building</DialogTitle>
            <DialogDescription>Update building details.</DialogDescription>
          </DialogHeader>
          {editingItem && (
            <RegistryForm
              defaultValues={editingItem}
              onSubmit={handleUpdate}
              isPending={updateBuilding.isPending}
              onCancel={() => setEditingItem(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the building "{deletingItem?.name}" and all of its associated spaces, systems, and assets.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBuilding.isPending} data-testid="dialog-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleteBuilding.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="dialog-delete-confirm"
            >
              {deleteBuilding.isPending ? 'Deleting...' : 'Delete Building'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}