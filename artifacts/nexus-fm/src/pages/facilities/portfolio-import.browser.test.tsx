import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoHighImpactAccessibilityViolations } from '@/test/accessibility';

const api = vi.hoisted(() => ({
  listFacilities: vi.fn(),
  createFacility: vi.fn(),
  updateFacility: vi.fn(),
  deleteFacility: vi.fn(),
  validateImport: vi.fn(),
  importPortfolio: vi.fn(),
  downloadTemplate: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>(
    '@workspace/api-client-react',
  );
  return {
    ...actual,
    useListFacilities: api.listFacilities,
    useCreateFacility: api.createFacility,
    useUpdateFacility: api.updateFacility,
    useDeleteFacility: api.deleteFacility,
    useValidateFacilityPortfolioImport: api.validateImport,
    useImportFacilityPortfolio: api.importPortfolio,
    downloadFacilityPortfolioImportTemplate: api.downloadTemplate,
    getListFacilitiesQueryKey: (params?: unknown) =>
      params ? ['/api/facilities', params] : ['/api/facilities'],
  };
});


import { Toaster } from '@/components/ui/toaster';
import { FacilitiesPage } from './index';

type MutationOptions<T> = {
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
};

function idleMutation(mutate = vi.fn()) {
  return { mutate, isPending: false, reset: vi.fn() };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(client, 'invalidateQueries');

  render(
    <QueryClientProvider client={client}>
      <FacilitiesPage />
      <Toaster />
    </QueryClientProvider>,
  );

  return { client, invalidateQueries };
}

async function openImportDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('button-import-registry'));
  return screen.getByRole('dialog', { name: 'Import portfolio from CSV' });
}

async function selectCsv(user: ReturnType<typeof userEvent.setup>, contents = 'facility_name\nHQ') {
  const file = new File([contents], 'portfolio.csv', { type: 'text/csv' });
  await user.upload(screen.getByTestId('input-portfolio-import-file'), file);
  return file;
}

describe('facility portfolio import browser regressions', () => {
  beforeEach(() => {
    analytics.track.mockReset();
    window.umami = { track: analytics.track };
    api.listFacilities.mockReturnValue({
      data: {
        items: [],
        page: 1,
        limit: 10,
        total: 0,
        collectionCapabilities: { create: true },
      },
      isLoading: false,
      error: null,
    });
    api.createFacility.mockReturnValue(idleMutation());
    api.updateFacility.mockReturnValue(idleMutation());
    api.deleteFacility.mockReturnValue(idleMutation());
    api.validateImport.mockReturnValue(idleMutation());
    api.importPortfolio.mockReturnValue(idleMutation());
    api.downloadTemplate.mockResolvedValue('facility_name,building_name\nHQ,North');

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:portfolio-import'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    delete window.umami;
    cleanup();
    vi.restoreAllMocks();
  });

  it('downloads the template, imports a validated CSV, reports the count, and refreshes the registry', async () => {
    const user = userEvent.setup();
    const validate = vi.fn((_variables: unknown, options: MutationOptions<unknown>) => {
      options.onSuccess?.({
        total: 8,
        facilities: 2,
        buildings: 3,
        spaces: 1,
        systems: 1,
        assets: 1,
        facilityGroups: [{
          facilityStatus: 'NEW_FACILITY',
          name: 'North Campus',
          clientRef: 'facility-a',
          id: null,
          code: 'FACILITY-A',
          counts: { buildings: 2, spaces: 1, systems: 1, assets: 1 },
          records: [
            { row: 3, kind: 'BUILDING', name: 'Main Building', clientRef: 'building-a', parentRef: 'facility-a', code: 'BLDG-A', status: 'ACTIVE' },
            { row: 4, kind: 'BUILDING', name: 'Annex', clientRef: 'building-b', parentRef: 'facility-a', status: 'ACTIVE' },
            { row: 5, kind: 'SPACE', name: 'Mechanical Room', clientRef: 'space-a', parentRef: 'building-a', status: 'ACTIVE' },
            { row: 6, kind: 'SYSTEM', name: 'HVAC', clientRef: 'system-a', parentRef: 'space-a', status: 'ACTIVE' },
            { row: 7, kind: 'ASSET', name: 'Air Handler', clientRef: 'asset-a', parentRef: 'space-a', systemRef: 'system-a', status: 'ACTIVE' },
          ],
        }, {
          facilityStatus: 'EXISTING_FACILITY',
          name: 'South Campus',
          clientRef: '2cc1d1b7-f3bd-45f1-a266-a78d7641a95f',
          id: '2cc1d1b7-f3bd-45f1-a266-a78d7641a95f',
          counts: { buildings: 1, spaces: 0, systems: 0, assets: 0 },
          records: [
            { row: 9, kind: 'BUILDING', name: 'South Building', clientRef: 'building-south', parentRef: 'facility-south', status: 'ACTIVE' },
          ],
        }],
      });
    });
    const commit = vi.fn((_variables: unknown, options: MutationOptions<{ imported: number }>) => {
      options.onSuccess?.({ imported: 5 });
    });
    api.validateImport.mockReturnValue(idleMutation(validate));
    api.importPortfolio.mockReturnValue(idleMutation(commit));
    const { invalidateQueries } = renderPage();

    await openImportDialog(user);
    await user.click(screen.getByTestId('button-download-import-template'));

    await waitFor(() => expect(api.downloadTemplate).toHaveBeenCalledOnce());
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:portfolio-import');

    const file = await selectCsv(user);
    expect(screen.getByTestId('text-selected-import-file')).toHaveTextContent('portfolio.csv');
    await user.click(screen.getByTestId('button-submit-portfolio-import'));

    expect(validate).toHaveBeenCalledWith(
      { data: file },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(await screen.findByTestId('alert-import-preview')).toHaveTextContent(
      'Validation passed. Committing will create 8 records.',
    );
    expect(analytics.track).toHaveBeenCalledWith('portfolio_import', {
      stage: 'validation_success',
      workflow_stage: 'review',
      record_count: 8,
      facility_count: 2,
    });
    expect(screen.getByText('North Campus')).toBeVisible();
    expect(screen.getByText('South Campus')).toBeVisible();
    expect(screen.getByTestId('status-import-facility-0')).toHaveTextContent('NEW FACILITY');
    expect(screen.getByTestId('identifier-import-facility-0')).toHaveTextContent('CSV ref: facility-a');
    expect(screen.getByTestId('status-import-facility-1')).toHaveTextContent('EXISTING REGISTRY FACILITY');
    expect(screen.getByTestId('identifier-import-facility-1')).toHaveTextContent(
      'registry ID: 2cc1d1b7-f3bd-45f1-a266-a78d7641a95f',
    );
    expect(screen.queryByText('Main Building')).not.toBeInTheDocument();

    const previewFilter = screen.getByTestId('input-filter-import-preview');
    await user.type(previewFilter, 'asset');
    expect(screen.getByText('North Campus')).toBeVisible();
    expect(screen.queryByText('South Campus')).not.toBeInTheDocument();
    expect(screen.getByText('Air Handler')).toBeVisible();
    expect(screen.queryByText('Main Building')).not.toBeInTheDocument();
    expect(screen.getByText('1 match')).toBeVisible();

    await user.clear(previewFilter);
    expect(screen.getByText('North Campus')).toBeVisible();
    expect(screen.getByText('South Campus')).toBeVisible();
    expect(screen.queryByText('Air Handler')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('button-toggle-import-facility-0'));
    expect(screen.getByText('Main Building')).toBeVisible();
    expect(screen.getByTestId('row-import-preview-7')).toHaveTextContent('system: system-a');
    const northRecords = within(screen.getByTestId('list-import-facility-records-0'))
      .getAllByRole('listitem');
    expect(northRecords.map((record) => record.textContent)).toEqual([
      expect.stringContaining('Main Building'),
      expect.stringContaining('Mechanical Room'),
      expect.stringContaining('HVAC'),
      expect.stringContaining('Air Handler'),
      expect.stringContaining('Annex'),
    ]);
    expect(screen.getByTestId('row-import-preview-5')).toHaveAttribute('data-parent-ref', 'building-a');
    expect(screen.getByTestId('row-import-preview-7')).toHaveAttribute('data-parent-ref', 'system-a');
    await user.click(screen.getByTestId('button-toggle-import-facility-1'));
    expect(within(screen.getByTestId('list-import-facility-records-1')).getByText('South Building')).toBeVisible();

    await user.click(screen.getByTestId('button-submit-portfolio-import'));

    expect(commit).toHaveBeenCalledWith(
      { data: file },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(await screen.findByText('Portfolio imported successfully')).toBeVisible();
    expect(screen.getByText('5 records were created.')).toBeVisible();
    expect(screen.queryByTestId('dialog-portfolio-import')).not.toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['/api/facilities'] });
    expect(analytics.track).toHaveBeenCalledWith('portfolio_import', {
      stage: 'commit_success',
      workflow_stage: 'commit',
      record_count: 5,
    });
    expect(analytics.track).not.toHaveBeenCalledWith(
      'portfolio_import',
      expect.objectContaining({ stage: 'cancelled' }),
    );
  });

  it('has no serious or critical accessibility violations on the registry and its dialogs', async () => {
    const user = userEvent.setup();
    api.listFacilities.mockReturnValue({
      data: {
        items: [{
          id: 'facility-1',
          name: 'North Campus',
          code: 'NORTH',
          description: 'Primary operations campus',
          status: 'ACTIVE',
          capabilities: { update: true, delete: true },
        }],
        page: 1,
        limit: 10,
        total: 1,
        collectionCapabilities: { create: true },
      },
      isLoading: false,
      error: null,
    });
    renderPage();

    await expectNoHighImpactAccessibilityViolations();

    await user.click(screen.getByTestId('button-create-registry'));
    expect(screen.getByRole('dialog', { name: 'Create Facility' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('button-edit-registry-facility-1'));
    expect(screen.getByRole('dialog', { name: 'Edit Facility' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await user.click(screen.getByTestId('button-delete-registry-facility-1'));
    expect(screen.getByRole('alertdialog', { name: 'Are you absolutely sure?' })).toBeVisible();
    await expectNoHighImpactAccessibilityViolations();
    await user.keyboard('{Escape}');

    await openImportDialog(user);
    await expectNoHighImpactAccessibilityViolations();
  });

  it('offers the generated validation report for download', async () => {
    const user = userEvent.setup();
    const report = 'row,error\n2,facility_name is required';
    api.validateImport.mockReturnValue(idleMutation(
      vi.fn((_variables: unknown, options: MutationOptions<never>) => {
        options.onError?.({ status: 400, data: report });
      }),
    ));
    renderPage();

    await openImportDialog(user);
    await selectCsv(user);
    await user.click(screen.getByTestId('button-submit-portfolio-import'));

    expect(await screen.findByTestId('text-import-failure')).toHaveTextContent(
      'The CSV contains validation errors.',
    );
    expect(analytics.track).toHaveBeenCalledWith('portfolio_import', {
      stage: 'validation_failure',
      workflow_stage: 'validation',
      reason: 'invalid_csv',
    });
    await user.click(screen.getByTestId('button-download-validation-report'));

    const downloadedBlob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0] as Blob;
    expect(await downloadedBlob.text()).toBe(report);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it.each([
    [
      403,
      'You do not have permission to import this portfolio. Ask an administrator to grant the required registry access.',
    ],
    [
      413,
      'This CSV is larger than the 2 MB upload limit. Split it into smaller files and try again.',
    ],
  ])('shows specific guidance when validation fails with status %s', async (status, guidance) => {
    const user = userEvent.setup();
    api.validateImport.mockReturnValue(idleMutation(
      vi.fn((_variables: unknown, options: MutationOptions<never>) => {
        options.onError?.({ status });
      }),
    ));
    renderPage();

    await openImportDialog(user);
    await selectCsv(user);
    await user.click(screen.getByTestId('button-submit-portfolio-import'));

    expect(await screen.findByTestId('text-import-failure')).toHaveTextContent(guidance);
  });

  it('hides import controls from users without facility creation access', () => {
    api.listFacilities.mockReturnValue({
      data: {
        items: [],
        page: 1,
        limit: 10,
        total: 0,
        collectionCapabilities: { create: false },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.queryByTestId('button-import-registry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dialog-portfolio-import')).not.toBeInTheDocument();
  });

  it('records review abandonment without exposing the selected filename', async () => {
    const user = userEvent.setup();
    api.validateImport.mockReturnValue(idleMutation(
      vi.fn((_variables: unknown, options: MutationOptions<unknown>) => {
        options.onSuccess?.({
          total: 250_000,
          facilities: 1,
          buildings: 0,
          spaces: 0,
          systems: 0,
          assets: 0,
          facilityGroups: [],
        });
      }),
    ));
    renderPage();

    await openImportDialog(user);
    await selectCsv(user, 'facility_name\nPrivate Campus');
    await user.click(screen.getByTestId('button-submit-portfolio-import'));
    await screen.findByTestId('alert-import-preview');
    await user.click(screen.getByTestId('button-cancel-portfolio-import'));

    expect(analytics.track).toHaveBeenCalledWith('portfolio_import', {
      stage: 'cancelled',
      workflow_stage: 'review',
      record_count: 100_000,
    });
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('portfolio.csv');
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('Private Campus');
  });

  it('keeps importing when analytics throws', async () => {
    const user = userEvent.setup();
    analytics.track.mockImplementation(() => {
      throw new Error('analytics unavailable');
    });
    api.validateImport.mockReturnValue(idleMutation(
      vi.fn((_variables: unknown, options: MutationOptions<unknown>) => {
        options.onSuccess?.({
          total: 1,
          facilities: 1,
          buildings: 0,
          spaces: 0,
          systems: 0,
          assets: 0,
          facilityGroups: [],
        });
      }),
    ));
    renderPage();

    await openImportDialog(user);
    await selectCsv(user);
    await user.click(screen.getByTestId('button-submit-portfolio-import'));

    expect(await screen.findByTestId('alert-import-preview')).toBeVisible();
  });
});