import type { CanonicalRole, UserRoleBindingStatus } from '@workspace/api-client-react';

type AnalyticsData = Record<string, string | number | boolean>;
type AnalyticsProperties = Record<string, unknown>;

export type ResultCountBucket = 'no_matches' | '1_20' | '21_100' | '101_plus';

// Only aggregate dimensions belong in access-review events. IDs, names, query
// text, scope targets, and URLs must never become event properties.
export interface AccessReviewEventProperties {
  member_search_after_reset: {
    reset_had_pagination: boolean;
    reset_had_organization_filter: boolean;
    has_organization_filter: boolean;
    result: 'matches' | 'no_matches';
  };
  member_search_reset: {
    had_pagination: boolean;
    had_organization_filter: boolean;
  };
  saved_member_unavailable_shown: undefined;
  saved_member_unavailable_cleared: undefined;
  binding_filters_applied: {
    role_filter: CanonicalRole | 'ALL';
    status_filter: UserRoleBindingStatus | 'ALL';
    result_count_bucket: ResultCountBucket;
  };
  binding_filters_cleared: AccessReviewEventProperties['binding_filters_applied'];
  binding_page_recovered: {
    previous_page: number;
    recovered_page: number;
    role_filter: CanonicalRole | 'ALL';
    status_filter: UserRoleBindingStatus | 'ALL';
  };
  binding_page_navigated: {
    direction: 'previous' | 'next';
    page: number;
    role_filter: CanonicalRole | 'ALL';
    status_filter: UserRoleBindingStatus | 'ALL';
  };
  access_review_export: {
    outcome: 'success' | 'failure';
    role_filter_active: boolean;
    status_filter_active: boolean;
  };
}

type AccessReviewEventName = keyof AccessReviewEventProperties;
type AccessReviewDataEvent = {
  [Name in AccessReviewEventName]: AccessReviewEventProperties[Name] extends undefined ? never : Name;
}[AccessReviewEventName];
type AccessReviewEmptyEvent = Exclude<AccessReviewEventName, AccessReviewDataEvent>;

interface TrackEventOptions {
  url?: string;
}

declare global {
  interface Window {
    // Injected by Replit's deployment proxy when Project Analytics is enabled.
    // The application must not initialize or configure this tracker itself.
    umami?: {
      track(name: string, data?: AnalyticsData): void;
      track(
        transform: (properties: AnalyticsProperties) => AnalyticsProperties,
      ): void;
    };
  }
}

export function getResultCountBucket(count: number): ResultCountBucket {
  if (count <= 0) return 'no_matches';
  if (count <= 20) return '1_20';
  if (count <= 100) return '21_100';
  return '101_plus';
}

// Access-review names cannot use the unrestricted tracker, even by accident.
export function trackEvent<const Name extends string>(
  name: Name & (Name extends AccessReviewEventName ? never : unknown),
  data?: AnalyticsData,
  options?: TrackEventOptions,
): void {
  emitEvent(name, data, options);
}

export function trackAccessReviewEvent<Name extends AccessReviewEmptyEvent>(name: Name): void;
export function trackAccessReviewEvent<
  Name extends AccessReviewDataEvent,
  const Data extends AccessReviewEventProperties[Name],
>(
  name: Name,
  data: Data & Record<Exclude<keyof Data, keyof AccessReviewEventProperties[Name]>, never>,
): void;
export function trackAccessReviewEvent(
  name: AccessReviewEventName,
  data?: AnalyticsData,
): void {
  emitEvent(name, data);
}

function emitEvent(
  name: string,
  data?: AnalyticsData,
  options?: TrackEventOptions,
): void {
  if (typeof window === 'undefined') return;

  try {
    if (options?.url) {
      window.umami?.track((properties) => ({
        ...properties,
        name,
        data,
        url: options.url,
      }));
      return;
    }
    window.umami?.track(name, data);
  } catch {
    // Analytics must never interrupt application workflows.
  }
}