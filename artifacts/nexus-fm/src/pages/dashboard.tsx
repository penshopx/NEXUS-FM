import { useGetFoundationSummary, useGetSession, getGetFoundationSummaryQueryKey } from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Users, Fingerprint, Activity, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function Dashboard() {
  const { data: session, isLoading: sessionLoading } = useGetSession();
  const { data: summary, isLoading: summaryLoading, error } = useGetFoundationSummary({
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
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <ShieldAlert className="size-8 text-muted-foreground" />
        </div>
         <h2 className="text-2xl font-mono font-bold tracking-tight">BELUM ADA ORGANISASI DIPILIH</h2>
        <p className="text-muted-foreground max-w-md">
           Anda harus memilih konteks organisasi aktif dari navigasi atas untuk melihat dasbor fondasi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
         <h1 className="text-3xl font-mono font-bold tracking-tight">Status Fondasi</h1>
        <p className="text-muted-foreground text-sm">
           Ikhtisar operasional untuk <strong className="text-foreground">{session.activeOrganization.organization.name}</strong>.
        </p>
      </div>

      {summaryLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 flex items-start gap-4">
          <AlertCircle className="size-6 text-destructive shrink-0 mt-1" />
          <div>
             <h3 className="text-lg font-mono font-semibold text-destructive">Kueri Sistem Gagal</h3>
            <p className="text-sm text-muted-foreground mt-1">
               Ringkasan fondasi tidak dapat diambil. Server mungkin tidak dapat dijangkau atau sesi Anda telah berakhir.
            </p>
          </div>
        </div>
      ) : summary ? (
        <div className="grid gap-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard 
               title="Anggota Aktif"
              value={summary.memberCount.toString()} 
              icon={<Users className="size-4 text-primary" />} 
            />
            <SummaryCard 
               title="Peran Kanonis"
              value={summary.canonicalRoleCount.toString()} 
              icon={<Fingerprint className="size-4 text-primary" />} 
            />
            <SummaryCard 
               title="Peran Anda"
              value={summary.currentRole.replace('_', ' ')} 
              icon={<ShieldAlert className="size-4 text-primary" />} 
              valueClass="text-base sm:text-lg whitespace-nowrap overflow-hidden text-ellipsis"
            />
            <SummaryCard 
               title="Status Audit"
              value={summary.auditStatus} 
              icon={<Activity className="size-4 text-primary" />} 
              valueClass={summary.auditStatus === 'ACTIVE' ? 'text-primary' : 'text-muted-foreground'}
            />
          </div>

          <h2 className="text-xl font-mono font-semibold tracking-tight mt-4 border-b border-border pb-2">
             Kesiapan Subsistem
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <StatusCard 
               title="Autentikasi"
              status={summary.authenticationStatus} 
               description="Verifikasi identitas dan penerbitan sesi."
            />
            <StatusCard 
               title="Konteks Organisasi"
              status={summary.organizationContextStatus} 
               description="Cakupan tenant dan batas isolasi."
            />
            <StatusCard 
               title="Otorisasi"
              status={summary.authorizationStatus} 
               description="Kontrol akses berbasis peran dan penerapannya."
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, value, icon, valueClass = "" }: { title: string, value: string | number, icon: React.ReactNode, valueClass?: string }) {
  return (
    <Card className="bg-card/50">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold font-mono tracking-tight ${valueClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusCard({ title, status, description }: { title: string, status: string, description: string }) {
  const isReady = status === 'READY' || status === 'MINIMUM_RBAC';
  
  return (
    <Card className="bg-card/50 border-l-4" style={{ borderLeftColor: isReady ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium font-mono">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-2">
          <span className="flex size-2 rounded-full" style={{ backgroundColor: isReady ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
          <span className="text-xs font-mono tracking-wider" style={{ color: isReady ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
            {status}
          </span>
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-8 w-64 mt-4" />
      <div className="grid md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
