import { useRoute } from 'wouter';
import { 
  useGetAsset,
  getGetAssetQueryKey,
  useGetSystem,
  getGetSystemQueryKey,
  useGetSpace,
  getGetSpaceQueryKey,
  useGetBuilding,
  getGetBuildingQueryKey,
  useGetFacility,
  getGetFacilityQueryKey,
} from '@workspace/api-client-react';
import { Breadcrumbs } from '@/components/registry/breadcrumbs';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Activity, Calendar } from 'lucide-react';
import { ApiErrorState } from '@/components/api-error-state';

export function AssetDetailPage() {
  const [, params] = useRoute('/app/assets/:id');
  const assetId = params?.id || '';
  
  const { data: asset, isLoading: assetLoading, error: assetError } = useGetAsset(assetId, {
    query: { enabled: !!assetId, queryKey: getGetAssetQueryKey(assetId || "") }
  });
  
  const systemId = asset?.systemId;
  const spaceId = asset?.spaceId;
  const buildingId = asset?.buildingId;
  const facilityId = asset?.facilityId;
  
  const { data: system } = useGetSystem(systemId || '', { query: { enabled: !!systemId, queryKey: getGetSystemQueryKey(systemId || "") } });
  const { data: space } = useGetSpace(spaceId || '', { query: { enabled: !!spaceId, queryKey: getGetSpaceQueryKey(spaceId || "") } });
  const { data: building } = useGetBuilding(buildingId || '', { query: { enabled: !!buildingId, queryKey: getGetBuildingQueryKey(buildingId || "") } });
  const { data: facility } = useGetFacility(facilityId || '', { query: { enabled: !!facilityId, queryKey: getGetFacilityQueryKey(facilityId || "") } });
  
  if (assetLoading) {
    return <div className="p-8 space-y-4 max-w-6xl mx-auto"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  
  if (assetError || !asset) {
    return <ApiErrorState error={assetError || { status: 404 }} title="Aset Tidak Ditemukan" goBackHref="/app/facilities" />;
  }
  
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500">
      <Breadcrumbs 
        items={[
           { label: 'Fasilitas', href: '/app/facilities' },
          ...(facility ? [{ label: facility.name, href: `/app/facilities/${facility.id}` }] : []),
          ...(building ? [{ label: building.name, href: `/app/buildings/${building.id}` }] : []),
          ...(space ? [{ label: space.name, href: `/app/spaces/${space.id}` }] : []),
          ...(system ? [{ label: system.name, href: `/app/systems/${system.id}` }] : []),
          { label: asset.name }
        ]} 
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="size-12 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/30">
                  <Server className="size-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight" data-testid="text-asset-name">{asset.name}</h1>
                   {asset.code && <span className="font-mono text-sm text-muted-foreground" data-testid="text-asset-code">Kode: {asset.code}</span>}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border font-mono ${
                asset.status === 'ACTIVE' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted border-border'
              }`} data-testid="status-asset">
                {asset.status === 'ACTIVE' ? 'Aktif' : 'Tidak aktif'}
              </span>
            </div>
            
            <div className="mt-8 border-t border-border pt-6">
               <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Deskripsi</h2>
              {asset.description ? (
                <p className="text-foreground leading-relaxed" data-testid="text-asset-description">{asset.description}</p>
              ) : (
                 <p className="text-muted-foreground italic">Tidak ada deskripsi.</p>
              )}
            </div>
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-6">
             <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Metadata</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Activity className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground w-24">Status</span>
                <span className="font-medium text-foreground">{asset.status === 'ACTIVE' ? 'Aktif' : 'Tidak aktif'}</span>
              </div>
              {asset.createdAt && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                   <span className="text-muted-foreground w-24">Dibuat</span>
                  <span className="font-mono text-foreground" data-testid="text-asset-created">{new Date(asset.createdAt).toLocaleDateString()}</span>
                </div>
              )}
              {asset.updatedAt && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                   <span className="text-muted-foreground w-24">Diperbarui</span>
                  <span className="font-mono text-foreground" data-testid="text-asset-updated">{new Date(asset.updatedAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
             <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Lokasi & Topologi</h2>
            <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[11px] before:w-[2px] before:bg-border">
              {facility && (
                <div className="flex items-center gap-3 text-sm relative">
                  <div className="size-6 rounded-full bg-card border-2 border-border flex items-center justify-center shrink-0 z-10" />
                   <span className="text-muted-foreground w-20">Fasilitas</span>
                  <span className="font-medium truncate" data-testid="text-topology-facility">{facility.name}</span>
                </div>
              )}
              {building && (
                <div className="flex items-center gap-3 text-sm relative">
                  <div className="size-6 rounded-full bg-card border-2 border-border flex items-center justify-center shrink-0 z-10" />
                   <span className="text-muted-foreground w-20">Bangunan</span>
                  <span className="font-medium truncate" data-testid="text-topology-building">{building.name}</span>
                </div>
              )}
              {space && (
                <div className="flex items-center gap-3 text-sm relative">
                  <div className="size-6 rounded-full bg-card border-2 border-border flex items-center justify-center shrink-0 z-10" />
                   <span className="text-muted-foreground w-20">Ruang</span>
                  <span className="font-medium truncate" data-testid="text-topology-space">{space.name}</span>
                </div>
              )}
              {system && (
                <div className="flex items-center gap-3 text-sm relative">
                  <div className="size-6 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center shrink-0 z-10">
                    <div className="size-2 bg-primary rounded-full" />
                  </div>
                   <span className="text-muted-foreground w-20">Sistem</span>
                  <span className="font-medium text-primary truncate" data-testid="text-topology-system">{system.name}</span>
                </div>
              )}
              {!system && space && (
                <div className="flex items-center gap-3 text-sm relative">
                  <div className="size-6 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center shrink-0 z-10">
                    <div className="size-2 bg-primary rounded-full" />
                  </div>
                   <span className="text-muted-foreground italic">Mandiri</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}