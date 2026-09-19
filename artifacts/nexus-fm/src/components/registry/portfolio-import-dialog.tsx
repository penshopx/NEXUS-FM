import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileWarning, Upload } from 'lucide-react';
import {
  downloadFacilityPortfolioImportTemplate,
  useImportFacilityPortfolio,
  useValidateFacilityPortfolioImport,
} from '@workspace/api-client-react';
import type { PortfolioImportPreview } from '@workspace/api-client-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

type ImportFailure = {
  message: string;
  report?: string;
};

function downloadTextFile(contents: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getErrorStatus(error: unknown) {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status: number }).status
    : undefined;
}

function getErrorReport(error: unknown) {
  if (typeof error !== 'object' || error === null || !('data' in error)) return undefined;
  const data = (error as { data?: unknown }).data;
  return typeof data === 'string' && data.trim() ? data : undefined;
}

function describeImportFailure(error: unknown): ImportFailure {
  const status = getErrorStatus(error);
  const report = getErrorReport(error);

  if (status === 400) {
    return {
      message: 'The CSV contains validation errors. Download the report, correct the listed rows, and upload the file again.',
      report,
    };
  }
  if (status === 403) {
    return { message: 'You do not have permission to import this portfolio. Ask an administrator to grant the required registry access.' };
  }
  if (status === 413) {
    return { message: 'This CSV is larger than the 2 MB upload limit. Split it into smaller files and try again.' };
  }
  return { message: 'The portfolio could not be imported. Please try again.' };
}

interface PortfolioImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (imported: number) => void;
}

export function PortfolioImportDialog({
  open,
  onOpenChange,
  onImported,
}: PortfolioImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [preview, setPreview] = useState<PortfolioImportPreview | null>(null);
  const importPortfolio = useImportFacilityPortfolio();
  const validatePortfolio = useValidateFacilityPortfolioImport();

  const reset = () => {
    setFile(null);
    setFailure(null);
    setPreview(null);
    importPortfolio.reset();
    validatePortfolio.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !importPortfolio.isPending && !validatePortfolio.isPending) reset();
    onOpenChange(nextOpen);
  };

  const handleTemplateDownload = async () => {
    setIsDownloadingTemplate(true);
    setFailure(null);
    try {
      const template = await downloadFacilityPortfolioImportTemplate();
      downloadTextFile(template, 'portfolio-import-template.csv');
    } catch (error) {
      setFailure(describeImportFailure(error));
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleValidate = () => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setFailure({ message: 'This CSV is larger than the 2 MB upload limit. Split it into smaller files and try again.' });
      return;
    }

    setFailure(null);
    validatePortfolio.mutate(
      { data: file },
      {
        onSuccess: setPreview,
        onError: (error) => setFailure(describeImportFailure(error)),
      },
    );
  };

  const handleImport = () => {
    if (!file || !preview) return;
    setFailure(null);
    importPortfolio.mutate({ data: file }, {
      onSuccess: (result) => {
        onImported(result.imported);
        handleOpenChange(false);
      },
      onError: (error) => {
        setPreview(null);
        setFailure(describeImportFailure(error));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px]" data-testid="dialog-portfolio-import">
        <DialogHeader>
          <DialogTitle>Import portfolio from CSV</DialogTitle>
          <DialogDescription>
            Use the template to add facilities and their buildings, spaces, systems, and assets in one validated import.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">1. Download the CSV template</p>
                <p className="mt-1 text-xs text-muted-foreground">Keep the header names unchanged.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleTemplateDownload}
                disabled={isDownloadingTemplate}
                data-testid="button-download-import-template"
              >
                <Download className="mr-2 size-4" />
                {isDownloadingTemplate ? 'Downloading...' : 'Download template'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="portfolio-import-file">2. Select completed CSV</Label>
            <Input
              ref={inputRef}
              id="portfolio-import-file"
              type="file"
              accept=".csv,text/csv"
               disabled={importPortfolio.isPending || validatePortfolio.isPending}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setFailure(null);
                 setPreview(null);
              }}
              data-testid="input-portfolio-import-file"
            />
            <p className="text-xs text-muted-foreground">CSV files only, up to 2 MB. Nothing is saved unless every row is valid.</p>
          </div>

          {file && (
            <p className="text-sm text-foreground" data-testid="text-selected-import-file">
              Selected: <span className="font-medium">{file.name}</span>
            </p>
          )}

          {preview && (
            <Alert data-testid="alert-import-preview">
              <CheckCircle2 className="size-4" />
              <AlertTitle>Review changes before import</AlertTitle>
              <AlertDescription>
                <p className="mb-3">Validation passed. Committing will create {preview.total} records.</p>
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    ['Facilities', preview.facilities],
                    ['Buildings', preview.buildings],
                    ['Spaces', preview.spaces],
                    ['Systems', preview.systems],
                    ['Assets', preview.assets],
                  ].map(([label, count]) => (
                    <div key={label} className="rounded-md border bg-background p-2 text-center">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-lg font-semibold">{count}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  The file will be validated again when you commit.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {failure && (
            <Alert variant="destructive" data-testid="alert-import-failure">
              <FileWarning className="size-4" />
              <AlertTitle>Import not completed</AlertTitle>
              <AlertDescription>
                <p data-testid="text-import-failure">{failure.message}</p>
                {failure.report && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => downloadTextFile(failure.report!, 'portfolio-import-errors.csv')}
                    data-testid="button-download-validation-report"
                  >
                    <Download className="mr-2 size-4" />
                    Download validation report
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={importPortfolio.isPending || validatePortfolio.isPending}
            data-testid="button-cancel-portfolio-import"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={preview ? handleImport : handleValidate}
            disabled={!file || importPortfolio.isPending || validatePortfolio.isPending}
            data-testid="button-submit-portfolio-import"
          >
            <Upload className="mr-2 size-4" />
            {importPortfolio.isPending
              ? 'Importing...'
              : validatePortfolio.isPending
                ? 'Validating...'
                : preview
                  ? 'Commit import'
                  : 'Validate and review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}