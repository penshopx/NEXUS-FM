import { useGetFoundationSummary, useGetSession, getGetFoundationSummaryQueryKey, useListFacilities, getListFacilitiesQueryKey } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, AlertTriangle, Terminal, Server, MapPin, ArrowRight, Building, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import type { Facility } from '@workspace/api-client-react';

export function Dashboard() {
  const { data: session, isLoading: sessionLoading } = useGetSession();

  const { data: facilitiesPage, isLoading: facilitiesLoading, error: facilitiesError } = useListFacilities(
    { limit: 6 },
    {
      query: {
        enabled: !!session?.activeOrganization,
        queryKey: getListFacilitiesQueryKey({ limit: 6 })
      }
    }
  );

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useGetFoundationSummary({
    query: {
      enabled: !!session?.activeOrganization,
      queryKey: getGetFoundationSummaryQueryKey()
    }
  });

  if (sessionLoading) {
    return <DashboardSkeleton />;
  }

  if (!session?.activeOrganization) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="size-20 border-2 border-dashed border-muted-foreground/50 bg-muted/20 flex items-center justify-center mb-2">
          <ShieldAlert className="size-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-mono font-bold tracking-tight uppercase">Menunggu Inisialisasi</h2>
          <p className="text-muted-foreground max-w-md font-mono text-sm leading-relaxed">
            Anda harus memilih konteks organisasi aktif dari navigasi atas untuk memuat antarmuka terminal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="dashboard-operational">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-border pb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-primary">
            <Terminal className="size-5" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest">Koneksi Berhasil</span>
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Terminal Operasional</h1>
          <p className="text-muted-foreground text-sm font-mono">
            Konteks saat ini: <strong className="text-foreground border-b border-primary/50 pb-0.5">{session.activeOrganization.organization.name}</strong>.
          </p>
        </div>
      </div>

      {/* Facilities Section (Operations First) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" />
            <h2 className="text-xl font-black uppercase tracking-tight">Akses Fasilitas</h2>
          </div>
          {facilitiesPage && (facilitiesPage.items.length > 0 || facilitiesPage.collectionCapabilities.create) && (
            <Link href="/app/facilities" data-testid="link-all-facilities">
              <Button variant="outline" size="sm" className="font-mono text-xs uppercase h-8 rounded-none border-2">
                Buka seluruh fasilitas <ArrowRight className="ml-2 size-3" />
              </Button>
            </Link>
          )}
        </div>

        {facilitiesLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-none border-2 border-border" />
            ))}
          </div>
        ) : facilitiesError ? (
          <div className="rounded-none border-2 border-destructive bg-destructive/10 p-6 flex items-start gap-4">
            <AlertTriangle className="size-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-mono font-bold text-destructive uppercase">Kueri Registri Gagal</h3>
              <p className="text-xs text-muted-foreground mt-1 font-mono">
                Data fasilitas tidak dapat diambil. Silakan periksa koneksi atau izin Anda.
              </p>
            </div>
          </div>
        ) : facilitiesPage?.items.length === 0 ? (
          <div className="border-2 border-dashed border-border p-8 flex flex-col items-center justify-center text-center">
            <Building className="size-8 text-muted-foreground mb-3" />
            <h3 className="text-sm font-bold font-mono uppercase tracking-wide">Belum Ada Fasilitas</h3>
            <p className="text-xs text-muted-foreground font-mono mt-1 mb-4">
              Tidak ada data fasilitas yang ditemukan dalam konteks organisasi ini.
            </p>
            <Link href="/app/facilities">
              <Button variant="outline" className="rounded-none border-2 font-mono uppercase text-xs">
                Kelola Registri
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {facilitiesPage?.items.map((facility) => (
              <FacilityCard key={facility.id} facility={facility} />
            ))}
          </div>
        )}
      </div>

      {/* System Readiness Section (Secondary) */}
      <div className="mt-12 pt-8 border-t-2 border-border border-dashed">
        <div className="space-y-6 opacity-80 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-black uppercase tracking-tight text-muted-foreground">Kesiapan Sistem</h2>
          </div>

          {summaryLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full rounded-none border-border" />
            </div>
          ) : summaryError ? (
            <div className="rounded-none border border-destructive/50 bg-destructive/5 p-4 flex items-start gap-4">
              <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-mono font-bold text-destructive uppercase">Telemetri Gagal</h3>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  Gagal memuat status sistem latar belakang.
                </p>
              </div>
            </div>
          ) : summary ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <TelemetryCard title="Anggota" value={summary.memberCount.toString()} />
                <TelemetryCard title="Peran Kanonis" value={summary.canonicalRoleCount.toString()} />
                <TelemetryCard title="Peran Anda" value={summary.currentRole.replace('_', ' ')} valueClass="text-xs sm:text-sm" />
                <TelemetryCard title="Audit" value={summary.auditStatus} valueClass={summary.auditStatus === 'ACTIVE' ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <div className="grid md:grid-cols-3 gap-2">
                <SubsystemCard title="Autentikasi" status={summary.authenticationStatus} />
                <SubsystemCard title="Konteks Organisasi" status={summary.organizationContextStatus} />
                <SubsystemCard title="Otorisasi" status={summary.authorizationStatus} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FacilityCard({ facility }: { facility: Facility }) {
  const updatedStr = facility.updatedAt
    ? new Date(facility.updatedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-';

  return (
    <Link href={`/app/facilities/${facility.id}`} data-testid={`link-facility-${facility.id}`}>
      <Card className="bg-card rounded-none border-2 border-border hover:border-primary/50 transition-colors cursor-pointer h-full flex flex-col group">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="text-lg font-bold font-mono tracking-tight uppercase line-clamp-1 group-hover:text-primary transition-colors">
              {facility.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-[10px] text-primary font-mono font-bold uppercase whitespace-nowrap">
              {facility.status}
            </span>
            {facility.code && (
              <span className="text-[10px] font-mono uppercase text-muted-foreground border border-border px-1.5 py-0.5">
                {facility.code}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="mt-auto pt-2">
          {facility.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3 font-mono leading-relaxed">
              {facility.description}
            </p>
          )}
          <div className="flex items-center text-[10px] text-muted-foreground font-mono uppercase font-bold tracking-wider pt-3 border-t border-border/50">
            <Activity className="size-3 mr-1.5" />
            Diperbarui {updatedStr}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function TelemetryCard({ title, value, valueClass = "" }: { title: string, value: string | number, valueClass?: string }) {
  return (
    <div className="border border-border p-3 flex flex-col gap-1 bg-background/50">
      <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider font-bold">{title}</span>
      <span className={`font-mono font-bold uppercase truncate ${valueClass}`}>{value}</span>
    </div>
  );
}

function SubsystemCard({ title, status }: { title: string, status: string }) {
  const isReady = status === 'READY' || status === 'MINIMUM_RBAC';

  return (
    <div className={`border p-3 flex flex-col gap-2 bg-background/50 ${isReady ? 'border-border' : 'border-muted-foreground/30'}`}>
      <span className="text-[10px] font-bold font-mono uppercase tracking-wide text-muted-foreground">{title}</span>
      <div className="flex items-center gap-2">
        <span className={`flex size-1.5 ${isReady ? 'bg-primary' : 'bg-muted-foreground'}`} />
        <span
          className={`text-xs font-bold font-mono tracking-widest uppercase ${isReady ? 'text-foreground' : 'text-muted-foreground'}`}
          data-testid={`status-${title.toLowerCase().replaceAll(' ', '-')}`}
        >
          {status}
        </span>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-20 w-full md:w-1/2 rounded-none border-2 border-border" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-48 rounded-none" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-none border-2 border-border" />
          ))}
        </div>
      </div>
    </div>
  );
}
