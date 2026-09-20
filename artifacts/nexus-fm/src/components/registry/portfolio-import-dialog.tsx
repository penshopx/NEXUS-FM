import { useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Download, FileWarning, Search, Upload, X } from 'lucide-react';
import {
  downloadFacilityPortfolioImportTemplate,
  useImportFacilityPortfolio,
  useValidateFacilityPortfolioImport,
} from '@workspace/api-client-react';
import type { PortfolioImportPreview } from '@workspace/api-client-react';
import type {
  PortfolioImportFacilityGroup,
  PortfolioImportPreviewRecord,
} from '@workspace/api-client-react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trackEvent } from '@/lib/analytics';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ANALYTICS_COUNT = 100_000;

type ImportFailure = {
  message: string;
  report?: string;
};

const PREVIEW_PAGE_SIZE = 100;

type HierarchyRecord = {
  record: PortfolioImportPreviewRecord;
  depth: number;
};

function includesPreviewQuery(
  item: {
    name: string;
    code?: string | null;
    clientRef: string;
    kind: string;
  },
  query: string,
) {
  return [item.name, item.code, item.clientRef, item.kind]
    .some((value) => value?.toLowerCase().includes(query));
}

function flattenFacilityHierarchy(facility: PortfolioImportFacilityGroup): HierarchyRecord[] {
  const recordsByRef = new Map(facility.records.map((record) => [record.clientRef.toLowerCase(), record]));
  const childrenByRef = new Map<string, PortfolioImportPreviewRecord[]>();
  const roots: PortfolioImportPreviewRecord[] = [];

  for (const record of facility.records) {
    const parentRef = (record.kind === 'ASSET' && record.systemRef
      ? record.systemRef
      : record.parentRef)?.toLowerCase();
    if (!parentRef || !recordsByRef.has(parentRef)) {
      roots.push(record);
      continue;
    }
    const children = childrenByRef.get(parentRef) ?? [];
    children.push(record);
    childrenByRef.set(parentRef, children);
  }

  const flattened: HierarchyRecord[] = [];
  const visited = new Set<string>();
  const appendSubtree = (record: PortfolioImportPreviewRecord, depth: number) => {
    const key = record.clientRef.toLowerCase();
    if (visited.has(key)) return;
    visited.add(key);
    flattened.push({ record, depth });
    for (const child of childrenByRef.get(key) ?? []) appendSubtree(child, depth + 1);
  };

  for (const root of roots) appendSubtree(root, 0);
  // Validation rejects cycles, but this keeps the preview complete if a future
  // contract permits references to an ancestor that is not included in the CSV.
  for (const record of facility.records) appendSubtree(record, 0);
  return flattened;
}

function FacilityPreviewGroup({ facility, index, filter }: {
  facility: PortfolioImportFacilityGroup;
  index: number;
  filter: string;
}) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PREVIEW_PAGE_SIZE);
  const hierarchy = flattenFacilityHierarchy(facility);
  const normalizedFilter = filter.trim().toLowerCase();
  const facilityMatches = normalizedFilter.length > 0 && includesPreviewQuery({
    name: facility.name,
    code: facility.code,
    clientRef: facility.clientRef,
    kind: 'FACILITY',
  }, normalizedFilter);
  const matchingHierarchy = normalizedFilter
    ? hierarchy.filter(({ record }) => includesPreviewQuery(record, normalizedFilter))
    : hierarchy;
  const visibleRecords = matchingHierarchy.slice(0, visibleCount);
  const descendantCount = facility.records.length;
  const matchingDescendantCount = matchingHierarchy.length;
  const isExistingFacility = facility.facilityStatus === 'EXISTING_FACILITY';
  const isFiltering = normalizedFilter.length > 0;
  const isOpen = isFiltering || open;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={isFiltering ? undefined : setOpen}
      className="rounded-md border bg-background"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          disabled={isFiltering}
          className="flex w-full items-start gap-2 rounded-md p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`button-toggle-import-facility-${index}`}
        >
          {isOpen
            ? <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            : <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">{facility.name}</span>
              <span
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"
                data-testid={`status-import-facility-${index}`}
              >
                {isExistingFacility ? 'EXISTING REGISTRY FACILITY' : 'NEW FACILITY'}
              </span>
            </span>
            <span
              className="block truncate font-mono text-xs text-muted-foreground"
              data-testid={`identifier-import-facility-${index}`}
            >
              {isExistingFacility ? `registry ID: ${facility.id}` : `CSV ref: ${facility.clientRef}`}
              {facility.code ? ` · code: ${facility.code}` : ''}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {isFiltering
              ? `${matchingDescendantCount + (facilityMatches ? 1 : 0)} ${matchingDescendantCount + (facilityMatches ? 1 : 0) === 1 ? 'match' : 'matches'}`
              : `${descendantCount} ${descendantCount === 1 ? 'descendant' : 'descendants'}`}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-3 py-2">
          <p className="mb-2 text-xs text-muted-foreground">
            {facility.counts.buildings} buildings · {facility.counts.spaces} spaces ·{' '}
            {facility.counts.systems} systems · {facility.counts.assets} assets
          </p>
          {isFiltering && facilityMatches && matchingDescendantCount === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              The facility matches. Its {descendantCount} {descendantCount === 1 ? 'descendant is' : 'descendants are'} kept collapsed.
            </p>
          ) : descendantCount === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No descendants are planned for this facility.</p>
          ) : (
            <ul className="space-y-1" data-testid={`list-import-facility-records-${index}`}>
              {visibleRecords.map(({ record, depth }) => {
                return (
                  <li
                    key={`${record.kind}-${record.clientRef}`}
                    className="rounded border border-border/70 px-2 py-1.5 text-xs"
                    style={{ marginLeft: `${depth * 0.75}rem` }}
                    data-parent-ref={record.kind === 'ASSET' && record.systemRef
                      ? record.systemRef
                      : record.parentRef}
                    data-testid={`row-import-preview-${record.row}`}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{record.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                        {record.kind}
                      </span>
                      {record.status === 'INACTIVE' && (
                        <span className="text-[10px] font-medium text-muted-foreground">INACTIVE</span>
                      )}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                      ref: {record.clientRef}
                      {record.code ? ` · code: ${record.code}` : ''}
                      {record.parentRef ? ` · parent: ${record.parentRef}` : ''}
                      {record.systemRef ? ` · system: ${record.systemRef}` : ''}
                      {record.id ? ` · id: ${record.id}` : ''}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {visibleCount < matchingDescendantCount && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setVisibleCount((count) => count + PREVIEW_PAGE_SIZE)}
              data-testid={`button-show-more-import-records-${index}`}
            >
              Show next {Math.min(PREVIEW_PAGE_SIZE, matchingDescendantCount - visibleCount)} records
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

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

function boundedCount(count: number) {
  return Math.min(Math.max(Math.trunc(count), 0), MAX_ANALYTICS_COUNT);
}

function validationFailureReason(error: unknown) {
  const status = getErrorStatus(error);
  if (status === 400) return 'invalid_csv';
  if (status === 403) return 'forbidden';
  if (status === 413) return 'file_too_large';
  return 'request_failed';
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
  const [previewFilter, setPreviewFilter] = useState('');
  const importPortfolio = useImportFacilityPortfolio();
  const validatePortfolio = useValidateFacilityPortfolioImport();

  const reset = () => {
    setFile(null);
    setFailure(null);
    setPreview(null);
    setPreviewFilter('');
    importPortfolio.reset();
    validatePortfolio.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen: boolean, trackCancellation = true) => {
    if (!nextOpen && !importPortfolio.isPending && !validatePortfolio.isPending) {
      if (open && trackCancellation) {
        trackEvent('portfolio_import', {
          stage: 'cancelled',
          workflow_stage: preview ? 'review' : file ? 'validation' : 'selection',
          record_count: boundedCount(preview?.total ?? 0),
        });
      }
      reset();
    }
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
      trackEvent('portfolio_import', {
        stage: 'validation_failure',
        workflow_stage: 'validation',
        reason: 'file_too_large',
      });
      return;
    }

    setFailure(null);
    validatePortfolio.mutate(
      { data: file },
      {
        onSuccess: (result) => {
          setPreview(result);
          trackEvent('portfolio_import', {
            stage: 'validation_success',
            workflow_stage: 'review',
            record_count: boundedCount(result.total),
            facility_count: boundedCount(result.facilities),
          });
        },
        onError: (error) => {
          setFailure(describeImportFailure(error));
          trackEvent('portfolio_import', {
            stage: 'validation_failure',
            workflow_stage: 'validation',
            reason: validationFailureReason(error),
          });
        },
      },
    );
  };

  const handleImport = () => {
    if (!file || !preview) return;
    setFailure(null);
    importPortfolio.mutate({ data: file }, {
      onSuccess: (result) => {
        trackEvent('portfolio_import', {
          stage: 'commit_success',
          workflow_stage: 'commit',
          record_count: boundedCount(result.imported),
        });
        onImported(result.imported);
        handleOpenChange(false, false);
      },
      onError: (error) => {
        setPreview(null);
        setFailure(describeImportFailure(error));
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]" data-testid="dialog-portfolio-import">
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
                setPreviewFilter('');
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
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">Planned hierarchy by facility</p>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      type="search"
                      value={previewFilter}
                      onChange={(event) => setPreviewFilter(event.target.value)}
                      placeholder="Filter by name, code, reference, or kind"
                      aria-label="Filter planned hierarchy"
                      className="pl-9 pr-9"
                      data-testid="input-filter-import-preview"
                    />
                    {previewFilter && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0.5 top-0.5 size-8"
                        onClick={() => setPreviewFilter('')}
                        aria-label="Clear preview filter"
                        data-testid="button-clear-import-preview-filter"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-[280px] pr-3">
                    <div className="space-y-2" data-testid="list-import-facility-groups">
                      {preview.facilityGroups
                        .map((facility, index) => ({ facility, index }))
                        .filter(({ facility }) => {
                          const query = previewFilter.trim().toLowerCase();
                          if (!query) return true;
                          return includesPreviewQuery({
                            name: facility.name,
                            code: facility.code,
                            clientRef: facility.clientRef,
                            kind: 'FACILITY',
                          }, query) || facility.records.some((record) => includesPreviewQuery(record, query));
                        })
                        .map(({ facility, index }) => (
                          <FacilityPreviewGroup
                            key={`${facility.clientRef}-${index}`}
                            facility={facility}
                            index={index}
                            filter={previewFilter}
                          />
                        ))}
                      {previewFilter.trim() && !preview.facilityGroups.some((facility) => {
                        const query = previewFilter.trim().toLowerCase();
                        return includesPreviewQuery({
                          name: facility.name,
                          code: facility.code,
                          clientRef: facility.clientRef,
                          kind: 'FACILITY',
                        }, query) || facility.records.some((record) => includesPreviewQuery(record, query));
                      }) && (
                        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                          No planned records match this filter.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
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