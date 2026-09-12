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

export function ApiErrorState({ error, title = 'Error', resetErrorBoundary, goBackHref }: ApiErrorStateProps) {
  const status = getErrorStatus(error);
  
  let Icon = AlertCircle;
  let message = 'An unexpected error occurred while communicating with the server.';
  
  if (status === 400) {
    Icon = AlertCircle;
    message = 'The request was invalid. Please check your inputs and try again.';
  } else if (status === 401 || status === 403) {
    Icon = ShieldAlert;
    message = 'You do not have permission to perform this action or view this resource.';
    title = 'Access Denied';
  } else if (status === 404) {
    Icon = FileQuestion;
    message = 'The requested resource could not be found or you do not have access to it.';
    title = 'Not Found';
  } else if (status !== undefined && status >= 500) {
    Icon = ServerCrash;
    message = 'The server encountered an error while processing your request.';
    title = 'Service Unavailable';
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
            Try Again
          </Button>
        )}
        {goBackHref && (
          <Button asChild data-testid="button-go-back">
            <Link href={goBackHref}>Go Back</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
