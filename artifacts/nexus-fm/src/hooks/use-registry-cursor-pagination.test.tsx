import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRegistryCursorPagination } from './use-registry-cursor-pagination';

const trackEvent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/analytics', () => ({ trackEvent }));

beforeEach(() => {
  window.history.replaceState(null, '', '/app/facilities');
  sessionStorage.clear();
  trackEvent.mockReset();
});

afterEach(cleanup);

describe('useRegistryCursorPagination', () => {
  it('traverses cursor pages and restores them through browser history', async () => {
    const { result } = renderHook(() =>
      useRegistryCursorPagination({ resourceType: 'facility' }),
    );

    act(() => result.current.goNext('cursor-1'));
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.cursor).toBe('cursor-1');

    act(() => result.current.goNext('cursor-2'));
    await waitFor(() => expect(result.current.page).toBe(3));
    expect(result.current.cursor).toBe('cursor-2');

    act(() => result.current.goPrevious());
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.cursor).toBe('cursor-1');
    expect(trackEvent.mock.calls).toEqual([
      [
        'registry_next_page',
        { resource_type: 'facility', page_depth: 2 },
        { url: '/app/registry' },
      ],
      [
        'registry_next_page',
        { resource_type: 'facility', page_depth: 3 },
        { url: '/app/registry' },
      ],
      [
        'registry_previous_page',
        { resource_type: 'facility', page_depth: 2 },
        { url: '/app/registry' },
      ],
    ]);

    act(() => window.history.back());
    await waitFor(() => expect(result.current.page).toBe(3));
    expect(result.current.cursor).toBe('cursor-2');

    act(() => window.history.forward());
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.cursor).toBe('cursor-1');
  });

  it('keeps the URL bounded during deep traversal', async () => {
    const { result } = renderHook(() =>
      useRegistryCursorPagination({ resourceType: 'facility' }),
    );

    for (let page = 2; page <= 100; page += 1) {
      act(() => result.current.goNext(`cursor-${page}`));
      await waitFor(() => expect(result.current.page).toBe(page));
    }

    expect(window.location.search.length).toBeLessThan(100);
    expect(result.current.cursor).toBe('cursor-100');
    expect(result.current.canGoPrevious).toBe(true);
  });

  it('resets a later cursor atomically when searching for a short exact code', async () => {
    window.history.replaceState(
      null,
      '',
      '/app/facilities?q=old&cursor=cursor-2&page=2',
    );
    const { result } = renderHook(() =>
      useRegistryCursorPagination({ resourceType: 'facility' }),
    );

    expect(result.current.registrySearch).toBe('old');
    expect(result.current.cursor).toBe('cursor-2');

    act(() => result.current.setSearch('new'));
    expect(result.current.registrySearch).toBe('old');
    expect(result.current.cursor).toBe('cursor-2');
    await waitFor(() => expect(result.current.registrySearch).toBe('new'));
    expect(result.current.cursor).toBeUndefined();
    expect(result.current.page).toBe(1);
    expect(trackEvent).toHaveBeenCalledWith('registry_search_reset', {
      resource_type: 'facility',
      page_depth: 2,
    }, {
      url: '/app/registry',
    });
    expect(trackEvent.mock.calls.flat()).not.toContain('new');

    act(() => result.current.setSearch('ab'));
    await waitFor(() => expect(result.current.registrySearch).toBe('ab'));
    expect(result.current.search).toBe('ab');
    expect(result.current.cursor).toBeUndefined();
  });

  it('keeps Back and Forward on the restored search instead of rewriting stale input', async () => {
    const { result } = renderHook(() =>
      useRegistryCursorPagination({ resourceType: 'facility' }),
    );

    act(() => result.current.setSearch('first'));
    await waitFor(() => expect(result.current.registrySearch).toBe('first'));
    act(() => result.current.setSearch('second'));
    await waitFor(() => expect(result.current.registrySearch).toBe('second'));

    act(() => window.history.back());
    await waitFor(() => expect(result.current.registrySearch).toBe('first'));
    await waitFor(() => expect(result.current.search).toBe('first'));
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(window.location.search).toBe('?q=first');
    expect(result.current.registrySearch).toBe('first');

    act(() => window.history.forward());
    await waitFor(() => expect(result.current.registrySearch).toBe('second'));
    await waitFor(() => expect(result.current.search).toBe('second'));
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(window.location.search).toBe('?q=second');
    expect(result.current.registrySearch).toBe('second');
  });
});