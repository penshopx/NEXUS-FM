import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'wouter';
import { useDebounce } from '@/hooks/use-debounce';
import { trackEvent } from '@/lib/analytics';
import { registrySearchQuery } from '@/lib/registry-search';

interface RegistryCursorPaginationOptions {
  prefix?: string;
  resourceType: 'facility' | 'building' | 'space' | 'system' | 'asset';
}

interface CursorHistoryEntry {
  previousCursor: string | null;
  previousPage: number;
}

type CursorHistory = Record<string, CursorHistoryEntry>;
const REGISTRY_ANALYTICS_URL = '/app/registry';

function readCursorHistory(key: string): CursorHistory {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as CursorHistory
      : {};
  } catch {
    return {};
  }
}

function writeCursorHistory(key: string, history: CursorHistory) {
  try {
    sessionStorage.setItem(key, JSON.stringify(history));
  } catch {
    // URL navigation remains usable even when session storage is unavailable.
  }
}

function parsePage(value: string | null) {
  const page = Number.parseInt(value ?? '1', 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function useRegistryCursorPagination({
  prefix = '',
  resourceType,
}: RegistryCursorPaginationOptions) {
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const queryParam = `${prefix}q`;
  const cursorParam = `${prefix}cursor`;
  const pageParam = `${prefix}page`;
  const urlQuery = urlSearchParams.get(queryParam) ?? '';
  const cursor = urlSearchParams.get(cursorParam) ?? undefined;
  const page = cursor ? parsePage(urlSearchParams.get(pageParam)) : 1;
  const [search, setSearch] = useState(urlQuery);
  const debouncedSearch = useDebounce(search, 300);
  const effectiveInputQuery = registrySearchQuery(debouncedSearch) ?? '';
  const committedQueryRef = useRef(urlQuery);
  const syncingFromUrlRef = useRef(false);
  const historyKey = `registry-cursors:${window.location.pathname}:${prefix}:${urlQuery}`;
  const previousEntry = cursor ? readCursorHistory(historyKey)[cursor] : undefined;

  useEffect(() => {
    if (urlQuery === committedQueryRef.current) return;
    committedQueryRef.current = urlQuery;
    syncingFromUrlRef.current = true;
    setSearch(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    if (syncingFromUrlRef.current) {
      syncingFromUrlRef.current = false;
      return;
    }
    if (effectiveInputQuery === urlQuery) return;

    if (cursor) {
      trackEvent('registry_search_reset', {
        resource_type: resourceType,
        page_depth: page,
      }, {
        url: REGISTRY_ANALYTICS_URL,
      });
    }
    committedQueryRef.current = effectiveInputQuery;
    setUrlSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (effectiveInputQuery) next.set(queryParam, effectiveInputQuery);
      else next.delete(queryParam);
      next.delete(cursorParam);
      next.delete(pageParam);
      return next;
    });
  }, [
    cursorParam,
    effectiveInputQuery,
    pageParam,
    queryParam,
    cursor,
    page,
    resourceType,
    setUrlSearchParams,
    urlQuery,
  ]);

  const goNext = (nextCursor: string) => {
    trackEvent('registry_next_page', {
      resource_type: resourceType,
      page_depth: page + 1,
    }, {
      url: REGISTRY_ANALYTICS_URL,
    });
    const history = readCursorHistory(historyKey);
    history[nextCursor] = {
      previousCursor: cursor ?? null,
      previousPage: page,
    };
    writeCursorHistory(historyKey, history);

    setUrlSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set(cursorParam, nextCursor);
      next.set(pageParam, String(page + 1));
      return next;
    });
  };

  const goPrevious = () => {
    if (!previousEntry) return;
    trackEvent('registry_previous_page', {
      resource_type: resourceType,
      page_depth: previousEntry.previousPage,
    }, {
      url: REGISTRY_ANALYTICS_URL,
    });
    setUrlSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (previousEntry.previousCursor) next.set(cursorParam, previousEntry.previousCursor);
      else next.delete(cursorParam);
      if (previousEntry.previousPage > 1) next.set(pageParam, String(previousEntry.previousPage));
      else next.delete(pageParam);
      return next;
    });
  };

  const reset = () => {
    setUrlSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete(cursorParam);
      next.delete(pageParam);
      return next;
    });
  };

  return {
    search,
    setSearch,
    registrySearch: registrySearchQuery(urlQuery),
    cursor,
    page,
    canGoPrevious: !!previousEntry,
    goNext,
    goPrevious,
    reset,
  };
}