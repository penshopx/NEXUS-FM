import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingDetailPage } from './buildings/building-detail';
import { FacilitiesPage } from './facilities';
import { FacilityDetailPage } from './facilities/facility-detail';
import { SpaceDetailPage } from './spaces/space-detail';
import { SystemDetailPage } from './systems/system-detail';

const api = vi.hoisted(() => ({
  facilities: vi.fn(),
  buildings: vi.fn(),
  spaces: vi.fn(),
  spaceSystems: vi.fn(),
  spaceAssets: vi.fn(),
  systemAssets: vi.fn(),
}));

const mutation = { mutate: vi.fn(), isPending: false };
const capabilities = {
  createChildren: { BUILDING: true, SPACE: true, SYSTEM: true, ASSET: true },
};

function listResponse(params: { cursor?: string; q?: string }) {
  return {
    data: {
      items: [],
      total: 30,
      nextCursor: params.cursor === 'next-cursor' ? undefined : 'next-cursor',
      collectionCapabilities: { create: false },
    },
    isLoading: false,
    error: null,
  };
}

vi.mock('@workspace/api-client-react', async () => {
  const actual = await vi.importActual<typeof import('@workspace/api-client-react')>(
    '@workspace/api-client-react',
  );
  const record = (id: string, name: string, parents = {}) => ({
    id,
    name,
    status: 'ACTIVE',
    capabilities,
    ...parents,
  });

  return {
    ...actual,
    useListFacilities: (params: { cursor?: string; q?: string }) => {
      api.facilities(params);
      return listResponse(params);
    },
    useListFacilityBuildings: (_id: string, params: { cursor?: string; q?: string }) => {
      api.buildings(params);
      return listResponse(params);
    },
    useListBuildingSpaces: (_id: string, params: { cursor?: string; q?: string }) => {
      api.spaces(params);
      return listResponse(params);
    },
    useListSpaceSystems: (_id: string, params: { cursor?: string; q?: string }) => {
      api.spaceSystems(params);
      return listResponse(params);
    },
    useListSpaceAssets: (_id: string, params: { cursor?: string; q?: string }) => {
      api.spaceAssets(params);
      return listResponse(params);
    },
    useListSystemAssets: (_id: string, params: { cursor?: string; q?: string }) => {
      api.systemAssets(params);
      return listResponse(params);
    },
    useGetFacility: () => ({
      data: record('facility-1', 'Facility One'),
      isLoading: false,
      error: null,
    }),
    useGetBuilding: () => ({
      data: record('building-1', 'Building One', { facilityId: 'facility-1' }),
      isLoading: false,
      error: null,
    }),
    useGetSpace: () => ({
      data: record('space-1', 'Space One', {
        facilityId: 'facility-1',
        buildingId: 'building-1',
      }),
      isLoading: false,
      error: null,
    }),
    useGetSystem: () => ({
      data: record('system-1', 'System One', {
        facilityId: 'facility-1',
        buildingId: 'building-1',
        spaceId: 'space-1',
      }),
      isLoading: false,
      error: null,
    }),
    useCreateFacility: () => mutation,
    useUpdateFacility: () => mutation,
    useDeleteFacility: () => mutation,
    useCreateFacilityBuilding: () => mutation,
    useUpdateBuilding: () => mutation,
    useDeleteBuilding: () => mutation,
    useCreateBuildingSpace: () => mutation,
    useUpdateSpace: () => mutation,
    useDeleteSpace: () => mutation,
    useCreateSpaceSystem: () => mutation,
    useCreateSpaceAsset: () => mutation,
    useUpdateSystem: () => mutation,
    useUpdateAsset: () => mutation,
    useDeleteSystem: () => mutation,
    useDeleteAsset: () => mutation,
    useCreateSystemAsset: () => mutation,
  };
});

function renderPage(Page: ComponentType) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

type Case = {
  name: string;
  Page: ComponentType;
  path: string;
  prefix: string;
  listPrefix: string;
  tab?: string;
  request: ReturnType<typeof vi.fn>;
};

const cases: Case[] = [
  {
    name: 'facilities',
    Page: FacilitiesPage,
    path: '/app/facilities',
    prefix: '',
    listPrefix: 'registry',
    request: api.facilities,
  },
  {
    name: 'nested buildings',
    Page: FacilityDetailPage,
    path: '/app/facilities/facility-1',
    prefix: '',
    listPrefix: 'registry',
    request: api.buildings,
  },
  {
    name: 'nested spaces',
    Page: BuildingDetailPage,
    path: '/app/buildings/building-1',
    prefix: '',
    listPrefix: 'registry',
    request: api.spaces,
  },
  {
    name: 'space systems',
    Page: SpaceDetailPage,
    path: '/app/spaces/space-1',
    prefix: 'systems-',
    listPrefix: 'systems',
    request: api.spaceSystems,
  },
  {
    name: 'space assets',
    Page: SpaceDetailPage,
    path: '/app/spaces/space-1',
    prefix: 'assets-',
    listPrefix: 'assets',
    tab: 'assets',
    request: api.spaceAssets,
  },
  {
    name: 'system assets',
    Page: SystemDetailPage,
    path: '/app/systems/system-1',
    prefix: '',
    listPrefix: 'assets',
    request: api.systemAssets,
  },
];

beforeEach(() => {
  sessionStorage.clear();
  Object.values(api).forEach((spy) => spy.mockClear());
});

afterEach(cleanup);

describe('registry screen cursor contract', () => {
  it.each(cases)(
    '$name consumes nextCursor and sends only cursor-based pagination after history restoration and search reset',
    async ({ Page, path, prefix, listPrefix, tab, request }) => {
      sessionStorage.setItem(
        `registry-cursors:${path}:${prefix}:restored`,
        JSON.stringify({
          'restored-cursor': { previousCursor: null, previousPage: 1 },
        }),
      );
      window.history.replaceState(
        null,
        '',
        `${path}?${prefix}q=restored&${prefix}cursor=restored-cursor&${prefix}page=2`,
      );
      renderPage(Page);

      await waitFor(() => {
        expect(request).toHaveBeenCalledWith({
          q: 'restored',
          cursor: 'restored-cursor',
          limit: 10,
        });
      });
      expect(request.mock.lastCall?.[0]).not.toHaveProperty('page');
      expect(request.mock.lastCall?.[0]).not.toHaveProperty('offset');

      if (tab) {
        await userEvent.click(screen.getByTestId(`tab-${tab}`));
      }
      await userEvent.click(screen.getByTestId(`button-prev-page-${listPrefix}`));
      await waitFor(() => {
        expect(request).toHaveBeenCalledWith({
          q: 'restored',
          cursor: undefined,
          limit: 10,
        });
      });

      await userEvent.click(screen.getByTestId(`button-next-page-${listPrefix}`));
      await waitFor(() => {
        expect(request).toHaveBeenCalledWith({
          q: 'restored',
          cursor: 'next-cursor',
          limit: 10,
        });
      });

      const search = screen.getByTestId(`input-search-${listPrefix}`);
      await userEvent.clear(search);
      await userEvent.type(search, 'reset');
      await waitFor(
        () => {
          expect(request).toHaveBeenCalledWith({
            q: 'reset',
            cursor: undefined,
            limit: 10,
          });
        },
        { timeout: 1_000 },
      );

      for (const [params] of request.mock.calls) {
        expect(params).toEqual(expect.objectContaining({ limit: 10 }));
        expect(params).not.toHaveProperty('page');
        expect(params).not.toHaveProperty('offset');
      }
    },
  );

  it('keeps space systems and standalone asset URL state independent across tabs and browser history', async () => {
    const path = '/app/spaces/space-1';
    sessionStorage.setItem(
      `registry-cursors:${path}:systems-:systems-old`,
      JSON.stringify({
        'systems-cursor': { previousCursor: null, previousPage: 1 },
      }),
    );
    sessionStorage.setItem(
      `registry-cursors:${path}:assets-:assets-old`,
      JSON.stringify({
        'assets-cursor': { previousCursor: null, previousPage: 1 },
      }),
    );
    window.history.replaceState(
      null,
      '',
      `${path}?systems-q=systems-old&systems-cursor=systems-cursor&systems-page=2&assets-q=assets-old&assets-cursor=assets-cursor&assets-page=2`,
    );
    renderPage(SpaceDetailPage);

    await waitFor(() => {
      expect(api.spaceSystems).toHaveBeenCalledWith({
        q: 'systems-old',
        cursor: 'systems-cursor',
        limit: 10,
      });
    });

    await userEvent.click(screen.getByTestId('button-next-page-systems'));
    await waitFor(() => {
      expect(api.spaceSystems).toHaveBeenCalledWith({
        q: 'systems-old',
        cursor: 'next-cursor',
        limit: 10,
      });
    });
    let params = new URLSearchParams(window.location.search);
    expect(params.get('assets-q')).toBe('assets-old');
    expect(params.get('assets-cursor')).toBe('assets-cursor');
    expect(params.get('assets-page')).toBe('2');

    const systemsSearch = screen.getByTestId('input-search-systems');
    await userEvent.clear(systemsSearch);
    await userEvent.type(systemsSearch, 'systems-new');
    await waitFor(() => {
      expect(api.spaceSystems).toHaveBeenCalledWith({
        q: 'systems-new',
        cursor: undefined,
        limit: 10,
      });
    });
    params = new URLSearchParams(window.location.search);
    expect(params.get('assets-q')).toBe('assets-old');
    expect(params.get('assets-cursor')).toBe('assets-cursor');
    expect(params.get('assets-page')).toBe('2');

    await userEvent.click(screen.getByTestId('tab-assets'));
    await waitFor(() => {
      expect(api.spaceAssets).toHaveBeenCalledWith({
        q: 'assets-old',
        cursor: 'assets-cursor',
        limit: 10,
      });
    });
    expect(screen.getByTestId('input-search-assets')).toHaveValue('assets-old');

    await userEvent.click(screen.getByTestId('button-next-page-assets'));
    await waitFor(() => {
      expect(api.spaceAssets).toHaveBeenCalledWith({
        q: 'assets-old',
        cursor: 'next-cursor',
        limit: 10,
      });
    });
    params = new URLSearchParams(window.location.search);
    expect(params.get('systems-q')).toBe('systems-new');
    expect(params.has('systems-cursor')).toBe(false);
    expect(params.has('systems-page')).toBe(false);

    const assetsSearch = screen.getByTestId('input-search-assets');
    await userEvent.clear(assetsSearch);
    await userEvent.type(assetsSearch, 'assets-new');
    await waitFor(() => {
      expect(api.spaceAssets).toHaveBeenCalledWith({
        q: 'assets-new',
        cursor: undefined,
        limit: 10,
      });
    });
    params = new URLSearchParams(window.location.search);
    expect(params.get('systems-q')).toBe('systems-new');
    expect(params.has('systems-cursor')).toBe(false);
    expect(params.has('systems-page')).toBe(false);

    await userEvent.click(screen.getByTestId('tab-systems'));
    expect(screen.getByTestId('input-search-systems')).toHaveValue('systems-new');
    await userEvent.click(screen.getByTestId('tab-assets'));
    expect(screen.getByTestId('input-search-assets')).toHaveValue('assets-new');

    act(() => window.history.back());
    await waitFor(() => {
      const restored = new URLSearchParams(window.location.search);
      expect(restored.get('systems-q')).toBe('systems-new');
      expect(restored.has('systems-cursor')).toBe(false);
      expect(restored.get('assets-q')).toBe('assets-old');
      expect(restored.get('assets-cursor')).toBe('next-cursor');
      expect(restored.get('assets-page')).toBe('3');
    });
    await waitFor(() => {
      expect(screen.getByTestId('input-search-assets')).toHaveValue('assets-old');
    });

    act(() => window.history.forward());
    await waitFor(() => {
      const restored = new URLSearchParams(window.location.search);
      expect(restored.get('systems-q')).toBe('systems-new');
      expect(restored.has('systems-cursor')).toBe(false);
      expect(restored.get('assets-q')).toBe('assets-new');
      expect(restored.has('assets-cursor')).toBe(false);
      expect(restored.has('assets-page')).toBe(false);
    });
    await waitFor(() => {
      expect(screen.getByTestId('input-search-assets')).toHaveValue('assets-new');
    });
  });
});