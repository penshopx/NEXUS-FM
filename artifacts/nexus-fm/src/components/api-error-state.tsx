import { ShieldAlert, AlertCircle, FileQuestion, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export interface ApiErrorStateProps {
  error: unknown;
  title?: string;
  resetErrorBoundary?: () => void;
  goBackHref?: string;
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status: number }).status;
  }
  return undefined;
}

export function ApiErrorState({ error, title = 'Kesalahan', resetErrorBoundary, goBackHref }: ApiErrorStateProps) {
  const status = getErrorStatus(error);
  
  let Icon = AlertCircle;
  let message = 'Terjadi kesalahan tak terduga saat berkomunikasi dengan server.';
  
  if (status === 400) {
    Icon = AlertCircle;
    message = 'Permintaan tidak valid. Periksa input Anda lalu coba lagi.';
  } else if (status === 401 || status === 403) {
    Icon = ShieldAlert;
    message = 'Anda tidak memiliki izin untuk melakukan tindakan ini atau melihat sumber daya tersebut.';
    title = 'Akses Ditolak';
  } else if (status === 404) {
    Icon = FileQuestion;
    message = 'Sumber daya yang diminta tidak ditemukan atau Anda tidak memiliki akses.';
    title = 'Tidak Ditemukan';
  } else if (status !== undefined && status >= 500) {
    Icon = ServerCrash;
    message = 'Server mengalami kesalahan saat memproses permintaan Anda.';
    title = 'Layanan Tidak Tersedia';
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4" data-testid="api-error-state">
      <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
        <Icon className="size-8 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-2 text-foreground">{title}</h2>
      <p className="text-muted-foreground max-w-md mb-6">{message}</p>
      
      <div className="flex items-center gap-4">
        {resetErrorBoundary && (
          <Button variant="outline" onClick={resetErrorBoundary} data-testid="button-retry">
             Coba Lagi
          </Button>
        )}
        {goBackHref && (
          <Button asChild data-testid="button-go-back">
             <Link href={goBackHref}>Kembali</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
