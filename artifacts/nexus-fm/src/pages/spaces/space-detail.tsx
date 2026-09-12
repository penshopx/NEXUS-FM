import { getSafeMutationMessage } from '@/lib/utils';
import {
 useState, useEffect } from 'react';
import {
 useRoute } from 'wouter';
import {
 useQueryClient } from '@tanstack/react-query';
import {
 
  useGetSpace,
  getGetSpaceQueryKey,
  useGetBuilding,
  getGetBuildingQueryKey,
  useGetFacility,
  getGetFacilityQueryKey,
  useListSpaceSystems,
  useListSpaceAssets,
  useCreateSpaceSystem,
  useCreateSpaceAsset,
  useUpdateSystem,
  useUpdateAsset,
  useDeleteSystem,
  useDeleteAsset,
  getListSpaceSystemsQueryKey,
  getListSpaceAssetsQueryKey,
  System,
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
 Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
 useToast } from '@/hooks/use-toast';
import {
 Skeleton } from '@/components/ui/skeleton';
import {
 useDebounce } from '@/hooks/use-debounce';
import {
 ApiErrorState } from '@/components/api-error-state';

export function SpaceDetailPage() {
  const [, params] = useRoute('/app/spaces/:id');
  const spaceId = params?.id || '';
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: space, isLoading: spaceLoading, error: spaceError } = useGetSpace(spaceId, {
    query: { enabled: !!spaceId, queryKey: getGetSpaceQueryKey(spaceId || "") }
  });
  
  const buildingId = space?.buildingId;
  const facilityId = space?.facilityId;
  
  const { data: building } = useGetBuilding(buildingId || '', {
    query: { enabled: !!buildingId, queryKey: getGetBuildingQueryKey(buildingId || "") }
  });
  
  const { data: facility } = useGetFacility(facilityId || '', {
    query: { enabled: !!facilityId, queryKey: getGetFacilityQueryKey(facilityId || "") }
  });
  
  const [activeTab, setActiveTab] = useState('systems');
  
  // Systems Data
  const [systemPage, setSystemPage] = useState(1);
  const [systemSearch, setSystemSearch] = useState('');
  const debouncedSystemSearch = useDebounce(systemSearch, 300);
  const systemLimit = 10;
  
  useEffect(() => { setSystemPage(1); }, [debouncedSystemSearch]);
  
  const { data: systemsData, isLoading: systemsLoading, error: systemsError } = useListSpaceSystems(
    spaceId,
    { q: debouncedSystemSearch || undefined, page: systemPage, limit: systemLimit },
    { query: { enabled: !!spaceId && activeTab === 'systems', queryKey: getListSpaceSystemsQueryKey(spaceId, { q: debouncedSystemSearch || undefined, page: systemPage, limit: systemLimit }) } }
  );
  const allSystems = (systemsData?.items || []) ;
    
  // Assets Data
  const [assetPage, setAssetPage] = useState(1);
  const [assetSearch, setAssetSearch] = useState('');
  const debouncedAssetSearch = useDebounce(assetSearch, 300);
  const assetLimit = 10;
  
  useEffect(() => { setAssetPage(1); }, [debouncedAssetSearch]);
  
  const { data: assetsData, isLoading: assetsLoading, error: assetsError } = useListSpaceAssets(
    spaceId,
    { q: debouncedAssetSearch || undefined, page: assetPage, limit: assetLimit },
    { query: { enabled: !!spaceId && activeTab === 'assets', queryKey: getListSpaceAssetsQueryKey(spaceId, { q: debouncedAssetSearch || undefined, page: assetPage, limit: assetLimit }) } }
  );
  const allAssets = (assetsData?.items || []) ;
  
  // Mutations
  const createSystem = useCreateSpaceSystem();
  const updateSystem = useUpdateSystem();
  const deleteSystem = useDeleteSystem();
  
  const createAsset = useCreateSpaceAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();
  
  // State for Dialogs
  const [isCreateSystemOpen, setIsCreateSystemOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<RegistryRecord | null>(null);
  const [deletingSystem, setDeletingSystem] = useState<RegistryRecord | null>(null);
  
  const [isCreateAssetOpen, setIsCreateAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<RegistryRecord | null>(null);
  const [deletingAsset, setDeletingAsset] = useState<RegistryRecord | null>(null);
  
  // System Handlers
  const handleCreateSystem = (values: RegistryInput,) => {
    createSystem.mutate({ id: spaceId, data: values }, {
      onSuccess: () => {
        toast({ title: 'System created successfully' });
        setIsCreateSystemOpen(false);
        queryClient.invalidateQueries({ queryKey: [`/api/spaces/${spaceId}/systems`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to create system', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleUpdateSystem = (values: RegistryInput,) => {
    if (!editingSystem) return;
    updateSystem.mutate({ id: editingSystem.id, data: values }, {
      onSuccess: () => {
        toast({ title: 'System updated successfully' });
        setEditingSystem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/spaces/${spaceId}/systems`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to update system', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleDeleteSystem = () => {
    if (!deletingSystem) return;
    deleteSystem.mutate({ id: deletingSystem.id }, {
      onSuccess: () => {
        toast({ title: 'System deleted successfully' });
        setDeletingSystem(null);
        queryClient.invalidateQueries({ queryKey: [`/api/spaces/${spaceId}/systems`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to delete system', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  // Asset Handlers
  const handleCreateAsset = (values: RegistryInput,) => {
    createAsset.mutate({ id: spaceId, data: { ...values, spaceId } }, {
      onSuccess: () => {
        toast({ title: 'Asset created successfully' });
        setIsCreateAssetOpen(false);
        queryClient.invalidateQueries({ queryKey: [`/api/spaces/${spaceId}/assets`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to create asset', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleUpdateAsset = (values: RegistryInput,) => {
    if (!editingAsset) return;
    updateAsset.mutate({ id: editingAsset.id, data: values }, {
      onSuccess: () => {
        toast({ title: 'Asset updated successfully' });
        setEditingAsset(null);
        queryClient.invalidateQueries({ queryKey: [`/api/spaces/${spaceId}/assets`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to update asset', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  const handleDeleteAsset = () => {
    if (!deletingAsset) return;
    deleteAsset.mutate({ id: deletingAsset.id }, {
      onSuccess: () => {
        toast({ title: 'Asset deleted successfully' });
        setDeletingAsset(null);
        queryClient.invalidateQueries({ queryKey: [`/api/spaces/${spaceId}/assets`] });
      },
      onError: (err) => {
        toast({ title: 'Failed to delete asset', description: getSafeMutationMessage(err), variant: 'destructive' });
      }
    });
  };
  
  if (spaceLoading) {
    return <div className="p-8 space-y-4 max-w-6xl mx-auto"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  
  if (spaceError || !space) {
    return <ApiErrorState error={spaceError || { status: 404 }} title="Space Not Found" goBackHref="/app/facilities" />;
  }
  
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <Breadcrumbs 
        items={[
          { label: 'Facilities', href: '/app/facilities' },
          ...(facility ? [{ label: facility.name, href: `/app/facilities/${facility.id}` }] : []),
          ...(building ? [{ label: building.name, href: `/app/buildings/${building.id}` }] : []),
          { label: space.name }
        ]} 
      />
      
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">{space.name}</h1>
        <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
          {space.code && <span>Code: {space.code}</span>}
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            space.status === 'ACTIVE' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted border-border'
          }`}>
            {space.status}
          </span>
        </div>
        {space.description && <p className="mt-4 text-muted-foreground max-w-3xl">{space.description}</p>}
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 bg-transparent border-b border-border rounded-none p-0 h-auto justify-start w-full gap-6">
          <TabsTrigger 
            value="systems" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 font-mono"
            data-testid="tab-systems"
          >
            Systems
          </TabsTrigger>
          <TabsTrigger 
            value="assets" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 pb-3 font-mono"
            data-testid="tab-assets"
          >
            Standalone Assets
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="systems" className="m-0 focus-visible:outline-none">
          {systemsError ? (
            <ApiErrorState error={systemsError} title="Failed to Load Systems" />
          ) : (
            <RegistryList
              title="Systems"
              description="Manage operational systems within this space."
              items={allSystems}
              isLoading={systemsLoading}
              searchQuery={systemSearch}
              onSearchChange={setSystemSearch}
              page={systemPage}
              totalItems={systemsData?.total || 0}
              limit={systemLimit}
              onPageChange={setSystemPage}
              onCreate={space.capabilities.createChildren.SYSTEM ? () => setIsCreateSystemOpen(true) : undefined}
              onEdit={(item) => setEditingSystem(item)}
              onDelete={(item) => setDeletingSystem(item)}
              renderItemLink={(item) => `/app/systems/${item.id}`} testIdPrefix="systems"
            />
          )}
        </TabsContent>
        
        <TabsContent value="assets" className="m-0 focus-visible:outline-none">
          {assetsError ? (
            <ApiErrorState error={assetsError} title="Failed to Load Assets" />
          ) : (
            <RegistryList
              title="Assets"
              description="Manage independent assets directly assigned to this space."
              items={allAssets}
              isLoading={assetsLoading}
              searchQuery={assetSearch}
              onSearchChange={setAssetSearch}
              page={assetPage}
              totalItems={assetsData?.total || 0}
              limit={assetLimit}
              onPageChange={setAssetPage}
              onCreate={space.capabilities.createChildren.ASSET ? () => setIsCreateAssetOpen(true) : undefined}
              onEdit={(item) => setEditingAsset(item)}
              onDelete={(item) => setDeletingAsset(item)}
              renderItemLink={(item) => `/app/assets/${item.id}`} testIdPrefix="assets"
            />
          )}
        </TabsContent>
      </Tabs>
      
      {/* System Dialogs */}
      <Dialog open={isCreateSystemOpen} onOpenChange={setIsCreateSystemOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Create System</DialogTitle></DialogHeader>
          <RegistryForm onSubmit={handleCreateSystem} isPending={createSystem.isPending} onCancel={() => setIsCreateSystemOpen(false)} />
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingSystem} onOpenChange={(open) => !open && setEditingSystem(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Edit System</DialogTitle></DialogHeader>
          {editingSystem && <RegistryForm defaultValues={editingSystem} onSubmit={handleUpdateSystem} isPending={updateSystem.isPending} onCancel={() => setEditingSystem(null)} />}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deletingSystem} onOpenChange={(open) => !open && setDeletingSystem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete System?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSystem.isPending} data-testid="dialog-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteSystem(); }} disabled={deleteSystem.isPending} className="bg-destructive text-destructive-foreground" data-testid="dialog-delete-confirm">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Asset Dialogs */}
      <Dialog open={isCreateAssetOpen} onOpenChange={setIsCreateAssetOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Create Asset</DialogTitle></DialogHeader>
          <RegistryForm onSubmit={handleCreateAsset} isPending={createAsset.isPending} onCancel={() => setIsCreateAssetOpen(false)} />
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingAsset} onOpenChange={(open) => !open && setEditingAsset(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Edit Asset</DialogTitle></DialogHeader>
          {editingAsset && <RegistryForm defaultValues={editingAsset} onSubmit={handleUpdateAsset} isPending={updateAsset.isPending} onCancel={() => setEditingAsset(null)} />}
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!deletingAsset} onOpenChange={(open) => !open && setDeletingAsset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Asset?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAsset.isPending} data-testid="dialog-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleDeleteAsset(); }} disabled={deleteAsset.isPending} className="bg-destructive text-destructive-foreground" data-testid="dialog-delete-confirm">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}