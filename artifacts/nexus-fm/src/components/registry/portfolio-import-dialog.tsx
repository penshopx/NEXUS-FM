import { useRef, useState, type ReactNode } from 'react';
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
import {
  commitFailureReason,
  validationFailureReason,
  type ValidationFailureReason,
} from '@/lib/portfolio-import-failure';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ANALYTICS_COUNT = 100_000;
const MAX_ANALYTICS_ATTEMPT = 10;

type ImportFailure = {
  message: string;
  report?: string;
};

const PREVIEW_PAGE_SIZE = 100;

type FacilityOriginFilter = 'ALL' | 'NEW_FACILITY' | 'EXISTING_FACILITY';

type HierarchyRecord = {
  record: PortfolioImportPreviewRecord;
  depth: number;
};

type SearchProjection = {
  value: string;
  starts: number[];
  ends: number[];
};

function projectPreviewSearchValue(value: string): SearchProjection {
  const projection: SearchProjection = { value: '', starts: [], ends: [] };
  const segments: Array<{ value: string; start: number; end: number }> = [];

  for (let index = 0; index < value.length;) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    const end = index + character.length;

    if (/^\p{M}$/u.test(character) && segments.length > 0) {
      const previous = segments[segments.length - 1];
      previous.value += character;
      previous.end = end;
    } else {
      segments.push({ value: character, start: index, end });
    }
    index = end;
  }

  for (const segment of segments) {
    const searchableSegment = segment.value
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    projection.value += searchableSegment;
    for (let index = 0; index < searchableSegment.length; index += 1) {
      projection.starts.push(segment.start);
      projection.ends.push(segment.end);
    }
  }

  return projection;
}

function normalizePreviewSearchValue(value: string) {
  return projectPreviewSearchValue(value.trim()).value;
}

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
    .some((value) => value && projectPreviewSearchValue(value).value.includes(query));
}

function HighlightedPreviewText({ value, query }: {
  value: string;
  query: string;
}) {
  const normalizedQuery = normalizePreviewSearchValue(query);
  if (!normalizedQuery) return value;

  const parts: ReactNode[] = [];
  const projection = projectPreviewSearchValue(value);
  let cursor = 0;
  let searchCursor = 0;
  let matchIndex = projection.value.indexOf(normalizedQuery);

  while (matchIndex !== -1) {
    const matchStart = projection.starts[matchIndex];
    const projectedMatchEnd = matchIndex + normalizedQuery.length - 1;
    const matchEnd = projection.ends[projectedMatchEnd];
    if (matchStart === undefined || matchEnd === undefined) break;
    if (matchStart > cursor) parts.push(value.slice(cursor, matchStart));
    parts.push(
      <mark
        key={`${matchStart}-${matchEnd}`}
        className="rounded-sm bg-primary/15 px-0.5 font-semibold text-inherit underline decoration-2 underline-offset-2"
        data-testid="highlight-import-preview-match"
      >
        {value.slice(matchStart, matchEnd)}
      </mark>,
    );
    cursor = matchEnd;
    searchCursor = matchIndex + normalizedQuery.length;
    matchIndex = projection.value.indexOf(normalizedQuery, searchCursor);
  }

  if (cursor === 0) return value;
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
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
  const normalizedFilter = normalizePreviewSearchValue(filter);
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
              <span className="truncate text-sm font-medium">
                <HighlightedPreviewText value={facility.name} query={normalizedFilter} />
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                <HighlightedPreviewText value="FACILITY" query={normalizedFilter} />
              </span>
              <span
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"
                data-testid={`status-import-facility-${index}`}
              >
                 {isExistingFacility ? 'FASILITAS REGISTRY YANG ADA' : 'FASILITAS BARU'}
              </span>
            </span>
            <span
              className="block truncate font-mono text-xs text-muted-foreground"
              data-testid={`identifier-import-facility-${index}`}
            >
               {isExistingFacility ? 'ID registry: ' : 'ref CSV: '}
               <HighlightedPreviewText
                 value={isExistingFacility ? (facility.id ?? facility.clientRef) : facility.clientRef}
                 query={normalizedFilter}
               />
               {facility.code ? (
                 <> · kode: <HighlightedPreviewText value={facility.code} query={normalizedFilter} /></>
               ) : null}
            </span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {isFiltering
              ? `${matchingDescendantCount + (facilityMatches ? 1 : 0)} kecocokan`
              : `${descendantCount} turunan`}
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-3 py-2">
          <p className="mb-2 text-xs text-muted-foreground">
            {facility.counts.buildings} bangunan · {facility.counts.spaces} ruang ·{' '}
            {facility.counts.systems} sistem · {facility.counts.assets} aset
          </p>
          {isFiltering && facilityMatches && matchingDescendantCount === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
               Fasilitas ini cocok. {descendantCount} turunannya tetap diciutkan.
            </p>
          ) : descendantCount === 0 ? (
             <p className="py-2 text-xs text-muted-foreground">Tidak ada turunan yang direncanakan untuk fasilitas ini.</p>
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
                      <span className="font-medium">
                        <HighlightedPreviewText value={record.name} query={normalizedFilter} />
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                        <HighlightedPreviewText value={record.kind} query={normalizedFilter} />
                      </span>
                      {record.status === 'INACTIVE' && (
                        <span className="text-[10px] font-medium text-muted-foreground">TIDAK AKTIF</span>
                      )}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                       ref: <HighlightedPreviewText value={record.clientRef} query={normalizedFilter} />
                       {record.code ? (
                         <> · code: <HighlightedPreviewText value={record.code} query={normalizedFilter} /></>
                       ) : null}
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
               Tampilkan {Math.min(PREVIEW_PAGE_SIZE, matchingDescendantCount - visibleCount)} catatan berikutnya
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
  if (!Number.isFinite(count)) return 0;
  return Math.min(Math.max(Math.trunc(count), 0), MAX_ANALYTICS_COUNT);
}

function describeImportFailure(error: unknown): ImportFailure {
  const status = getErrorStatus(error);
  const report = getErrorReport(error);

  if (status === 400) {
    return {
      message: 'CSV berisi kesalahan validasi. Unduh laporan, perbaiki baris yang tercantum, lalu unggah kembali file tersebut.',
      report,
    };
  }
  if (status === 403) {
    return { message: 'Anda tidak memiliki izin untuk mengimpor portofolio ini. Minta administrator memberikan akses registry yang diperlukan.' };
  }
  if (status === 413) {
    return { message: 'CSV ini lebih besar dari batas unggah 2 MB. Bagi menjadi beberapa file yang lebih kecil lalu coba lagi.' };
  }
  return { message: 'Portofolio tidak dapat diimpor. Silakan coba lagi.' };
}

function describeCommitFailure(error: unknown): ImportFailure {
  if (getErrorStatus(error) === 409) {
    return {
      message: 'Registry berubah setelah validasi. Validasi kembali file ini, tinjau perubahan terbaru, lalu lakukan commit lagi.',
    };
  }
  return describeImportFailure(error);
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
  const validationAttemptRef = useRef(0);
  const reportDownloadedRef = useRef(false);
  const latestValidationFailureReasonRef = useRef<ValidationFailureReason | null>(null);
  const previewFilterUsedRef = useRef(false);
  const previewFilterClearCountRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [failure, setFailure] = useState<ImportFailure | null>(null);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [preview, setPreview] = useState<PortfolioImportPreview | null>(null);
  const [previewFilter, setPreviewFilter] = useState('');
  const [facilityOriginFilter, setFacilityOriginFilter] = useState<FacilityOriginFilter>('ALL');
  const importPortfolio = useImportFacilityPortfolio({
    request: {
      headers: preview?.registryVersion
        ? { 'X-Portfolio-Registry-Version': preview.registryVersion }
        : {},
    },
  });
  const validatePortfolio = useValidateFacilityPortfolioImport();

  const reset = () => {
    validationAttemptRef.current = 0;
    reportDownloadedRef.current = false;
    latestValidationFailureReasonRef.current = null;
    previewFilterUsedRef.current = false;
    previewFilterClearCountRef.current = 0;
    setFile(null);
    setFailure(null);
    setPreview(null);
    setPreviewFilter('');
    setFacilityOriginFilter('ALL');
    importPortfolio.reset();
    validatePortfolio.reset();
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleOpenChange = (nextOpen: boolean, trackCancellation = true) => {
    if (!nextOpen && !importPortfolio.isPending && !validatePortfolio.isPending) {
      if (open && trackCancellation) {
        const workflowStage = preview ? 'review' : file ? 'validation' : 'selection';
        trackEvent('portfolio_import', {
          stage: 'cancelled',
          workflow_stage: workflowStage,
          record_count: boundedCount(preview?.total ?? 0),
          ...(workflowStage === 'validation' && latestValidationFailureReasonRef.current
            ? { validation_failure_reason: latestValidationFailureReasonRef.current }
            : {}),
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
    validationAttemptRef.current = Math.min(
      validationAttemptRef.current + 1,
      MAX_ANALYTICS_ATTEMPT,
    );
    const attemptNumber = validationAttemptRef.current;
    const isRetry = attemptNumber > 1;

    if (file.size > MAX_IMPORT_BYTES) {
      latestValidationFailureReasonRef.current = 'file_too_large';
      setFailure({ message: 'CSV ini lebih besar dari batas unggah 2 MB. Bagi menjadi beberapa file yang lebih kecil lalu coba lagi.' });
      trackEvent('portfolio_import', {
        stage: 'validation_failure',
        workflow_stage: 'validation',
        reason: 'file_too_large',
        attempt_number: attemptNumber,
        is_retry: isRetry,
        report_available: false,
      });
      return;
    }

    setFailure(null);
    validatePortfolio.mutate(
      { data: file },
      {
        onSuccess: (result) => {
          setPreview(result);
          setFacilityOriginFilter('ALL');
          trackEvent('portfolio_import', {
            stage: 'validation_success',
            workflow_stage: 'review',
            record_count: boundedCount(result.total),
            facility_count: boundedCount(result.facilities),
            new_facility_count: boundedCount(result.newFacilities),
            existing_facility_count: boundedCount(result.existingFacilities),
            attempt_number: attemptNumber,
            is_retry: isRetry,
            report_downloaded: reportDownloadedRef.current,
            ...(latestValidationFailureReasonRef.current
              ? { validation_failure_reason: latestValidationFailureReasonRef.current }
              : {}),
          });
        },
        onError: (error) => {
          const reason = validationFailureReason(error);
          latestValidationFailureReasonRef.current = reason;
          setFailure(describeImportFailure(error));
          trackEvent('portfolio_import', {
            stage: 'validation_failure',
            workflow_stage: 'validation',
            reason,
            attempt_number: attemptNumber,
            is_retry: isRetry,
            report_available: Boolean(getErrorReport(error)),
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
          preview_filter_used: previewFilterUsedRef.current,
          preview_filter_active: previewFilter.trim().length > 0,
          preview_filter_clear_count: boundedCount(previewFilterClearCountRef.current),
        });
        onImported(result.imported);
        handleOpenChange(false, false);
      },
      onError: (error) => {
        trackEvent('portfolio_import', {
          stage: 'commit_failure',
          workflow_stage: 'commit',
          reason: commitFailureReason(error),
          record_count: boundedCount(preview.total),
          facility_count: boundedCount(preview.facilities),
        });
        setPreview(null);
        setFailure(describeCommitFailure(error));
      },
    });
  };

  const handlePreviewFilterChange = (nextFilter: string) => {
    const wasActive = previewFilter.trim().length > 0;
    const isActive = nextFilter.trim().length > 0;

    setPreviewFilter(nextFilter);
    if (!preview) return;

    if (!wasActive && isActive) {
      previewFilterUsedRef.current = true;
      trackEvent('portfolio_import_preview_filter', {
        action: 'applied',
        workflow_stage: 'review',
        record_count: boundedCount(preview.total),
        facility_count: boundedCount(preview.facilities),
      });
    } else if (wasActive && !isActive) {
      previewFilterClearCountRef.current += 1;
      trackEvent('portfolio_import_preview_filter', {
        action: 'cleared',
        workflow_stage: 'review',
        record_count: boundedCount(preview.total),
        facility_count: boundedCount(preview.facilities),
      });
    }
  };

  const handleValidationReportDownload = () => {
    if (!failure?.report) return;

    downloadTextFile(failure.report, 'portfolio-import-errors.csv');
    reportDownloadedRef.current = true;
    trackEvent('portfolio_validation_report_download', {
      workflow_stage: 'validation',
      attempt_number: Math.max(validationAttemptRef.current, 1),
      is_retry: validationAttemptRef.current > 1,
      ...(latestValidationFailureReasonRef.current
        ? { validation_failure_reason: latestValidationFailureReasonRef.current }
        : {}),
    });
  };

  const normalizedPreviewFilter = normalizePreviewSearchValue(previewFilter);
  const visibleFacilityGroups = preview?.facilityGroups
    .map((facility, index) => ({ facility, index }))
    .filter(({ facility }) => (
      facilityOriginFilter === 'ALL' || facility.facilityStatus === facilityOriginFilter
    ))
    .filter(({ facility }) => (
      !normalizedPreviewFilter
      || includesPreviewQuery({
        name: facility.name,
        code: facility.code,
        clientRef: facility.clientRef,
        kind: 'FACILITY',
      }, normalizedPreviewFilter)
      || facility.records.some((record) => includesPreviewQuery(record, normalizedPreviewFilter))
    )) ?? [];

  const emptyPreviewMessage = normalizedPreviewFilter
    ? facilityOriginFilter === 'ALL'
      ? 'Tidak ada catatan yang direncanakan sesuai filter teks ini.'
      : 'Tidak ada fasilitas dari asal yang dipilih yang sesuai dengan filter teks ini. Coba hapus pencarian atau pilih asal lain.'
    : facilityOriginFilter === 'NEW_FACILITY'
      ? 'Tidak ada fasilitas baru dalam pratinjau ini. Pilih Semua atau Fasilitas registry yang ada.'
      : facilityOriginFilter === 'EXISTING_FACILITY'
        ? 'Tidak ada fasilitas registry yang ada dalam pratinjau ini. Pilih Semua atau Fasilitas baru.'
        : 'Tidak ada grup fasilitas dalam pratinjau ini.';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]" data-testid="dialog-portfolio-import">
        <DialogHeader>
          <DialogTitle>Impor portofolio dari CSV</DialogTitle>
          <DialogDescription>
            Gunakan templat untuk menambahkan fasilitas beserta bangunan, ruang, sistem, dan asetnya dalam satu impor tervalidasi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">1. Unduh templat CSV</p>
                <p className="mt-1 text-xs text-muted-foreground">Pertahankan nama header tanpa perubahan.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleTemplateDownload}
                disabled={isDownloadingTemplate}
                data-testid="button-download-import-template"
              >
                <Download className="mr-2 size-4" />
                {isDownloadingTemplate ? 'Mengunduh...' : 'Unduh templat'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="portfolio-import-file">2. Pilih CSV yang telah diisi</Label>
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
                 setFacilityOriginFilter('ALL');
              }}
              data-testid="input-portfolio-import-file"
            />
            <p className="text-xs text-muted-foreground">Hanya file CSV, maksimal 2 MB. Tidak ada yang disimpan kecuali semua baris valid.</p>
          </div>

          {file && (
            <p className="text-sm text-foreground" data-testid="text-selected-import-file">
              Dipilih: <span className="font-medium">{file.name}</span>
            </p>
          )}

          {preview && (
            <Alert data-testid="alert-import-preview">
              <CheckCircle2 className="size-4" />
              <AlertTitle>Tinjau perubahan sebelum mengimpor</AlertTitle>
              <AlertDescription>
                <p className="mb-3">Validasi berhasil. Commit akan membuat {preview.total} catatan.</p>
                <dl className="mb-2 grid grid-cols-2 gap-2" aria-label="Ringkasan asal fasilitas">
                  <div className="rounded-md border bg-background p-2 text-center" data-testid="summary-import-new-facilities">
                    <dt className="text-xs text-muted-foreground">Fasilitas baru</dt>
                    <dd className="text-lg font-semibold">{preview.newFacilities}</dd>
                  </div>
                  <div className="rounded-md border bg-background p-2 text-center" data-testid="summary-import-existing-facilities">
                    <dt className="text-xs text-muted-foreground">Fasilitas registry yang ada</dt>
                    <dd className="text-lg font-semibold">{preview.existingFacilities}</dd>
                  </div>
                </dl>
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
                  <p className="mb-2 text-sm font-medium">Hierarki yang direncanakan berdasarkan fasilitas</p>
                   <div className="mb-2">
                     <Label className="mb-1.5 block text-xs text-muted-foreground">
                       Tampilkan fasilitas
                     </Label>
                     <div
                       role="group"
                       aria-label="Filter asal fasilitas"
                       className="flex flex-wrap gap-1.5"
                       data-testid="filter-import-facility-origin"
                     >
                       {([
                         ['ALL', 'Semua', 'filter-import-origin-all'],
                         ['NEW_FACILITY', 'Fasilitas baru', 'filter-import-origin-new'],
                         ['EXISTING_FACILITY', 'Fasilitas registry yang ada', 'filter-import-origin-existing'],
                       ] as const).map(([value, label, testId]) => (
                         <Button
                           key={value}
                           type="button"
                           variant={facilityOriginFilter === value ? 'default' : 'outline'}
                           size="sm"
                           aria-pressed={facilityOriginFilter === value}
                           onClick={() => setFacilityOriginFilter(value)}
                           data-testid={testId}
                         >
                           {label}
                         </Button>
                       ))}
                     </div>
                   </div>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                    <Input
                      type="search"
                      value={previewFilter}
                      onChange={(event) => handlePreviewFilterChange(event.target.value)}
                      placeholder="Filter berdasarkan nama, kode, referensi, atau jenis"
                      aria-label="Filter hierarki yang direncanakan"
                      className="pl-9 pr-9"
                      data-testid="input-filter-import-preview"
                    />
                    {previewFilter && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0.5 top-0.5 size-8"
                        onClick={() => handlePreviewFilterChange('')}
                        aria-label="Hapus filter pratinjau"
                        data-testid="button-clear-import-preview-filter"
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="h-[280px] pr-3">
                    <div className="space-y-2" data-testid="list-import-facility-groups">
                       {visibleFacilityGroups.map(({ facility, index }) => (
                          <FacilityPreviewGroup
                            key={`${facility.clientRef}-${index}`}
                            facility={facility}
                            index={index}
                            filter={previewFilter}
                          />
                        ))}
                       {visibleFacilityGroups.length === 0 && (
                         <p
                           className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground"
                           data-testid="empty-import-facility-filter"
                         >
                           {emptyPreviewMessage}
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  File akan divalidasi kembali saat Anda melakukan commit.
                </p>
              </AlertDescription>
            </Alert>
          )}

          {failure && (
            <Alert variant="destructive" data-testid="alert-import-failure">
              <FileWarning className="size-4" />
              <AlertTitle>Impor belum selesai</AlertTitle>
              <AlertDescription>
                <p data-testid="text-import-failure">{failure.message}</p>
                {failure.report && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleValidationReportDownload}
                    data-testid="button-download-validation-report"
                  >
                    <Download className="mr-2 size-4" />
                    Unduh laporan validasi
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
            Batal
          </Button>
          <Button
            type="button"
            onClick={preview ? handleImport : handleValidate}
            disabled={!file || importPortfolio.isPending || validatePortfolio.isPending}
            data-testid="button-submit-portfolio-import"
          >
            <Upload className="mr-2 size-4" />
            {importPortfolio.isPending
              ? 'Mengimpor...'
              : validatePortfolio.isPending
                ? 'Memvalidasi...'
                : preview
                  ? 'Commit impor'
                  : 'Validasi dan tinjau'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}