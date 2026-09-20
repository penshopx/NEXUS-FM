import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRegistryCursorPagination } from './use-registry-cursor-pagination';

beforeEach(() => {
  window.history.replaceState(null, '', '/app/facilities');
  sessionStorage.clear();
});

afterEach(cleanup);

describe('useRegistryCursorPagination', () => {
  it('traverses cursor pages and restores them through browser history', async () => {
    const { result } = renderHook(() => useRegistryCursorPagination());

    act(() => result.current.goNext('cursor-1'));
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.cursor).toBe('cursor-1');

    act(() => result.current.goNext('cursor-2'));
    await waitFor(() => expect(result.current.page).toBe(3));
    expect(result.current.cursor).toBe('cursor-2');

    act(() => result.current.goPrevious());
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.cursor).toBe('cursor-1');

    act(() => window.history.back());
    await waitFor(() => expect(result.current.page).toBe(3));
    expect(result.current.cursor).toBe('cursor-2');

    act(() => window.history.forward());
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.cursor).toBe('cursor-1');
  });

  it('keeps the URL bounded during deep traversal', async () => {
    const { result } = renderHook(() => useRegistryCursorPagination());

    for (let page = 2; page <= 100; page += 1) {
      act(() => result.current.goNext(`cursor-${page}`));
      await waitFor(() => expect(result.current.page).toBe(page));
    }

    expect(window.location.search.length).toBeLessThan(100);
    expect(result.current.cursor).toBe('cursor-100');
    expect(result.current.canGoPrevious).toBe(true);
  });

  it('resets a later cursor atomically without clearing a short raw search', async () => {
    window.history.replaceState(
      null,
      '',
      '/app/facilities?q=old&cursor=cursor-2&page=2',
    );
    const { result } = renderHook(() => useRegistryCursorPagination());

    expect(result.current.registrySearch).toBe('old');
    expect(result.current.cursor).toBe('cursor-2');

    act(() => result.current.setSearch('new'));
    expect(result.current.registrySearch).toBe('old');
    expect(result.current.cursor).toBe('cursor-2');
    await waitFor(() => expect(result.current.registrySearch).toBe('new'));
    expect(result.current.cursor).toBeUndefined();
    expect(result.current.page).toBe(1);

    act(() => result.current.setSearch('ab'));
    await waitFor(() => expect(result.current.registrySearch).toBeUndefined());
    expect(result.current.search).toBe('ab');
    expect(result.current.cursor).toBeUndefined();
  });

  it('keeps Back and Forward on the restored search instead of rewriting stale input', async () => {
    const { result } = renderHook(() => useRegistryCursorPagination());

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