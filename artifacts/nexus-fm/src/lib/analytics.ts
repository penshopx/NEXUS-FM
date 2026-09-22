type AnalyticsData = Record<string, string | number | boolean>;
type AnalyticsProperties = Record<string, unknown>;

export type ResultCountBucket = 'no_matches' | '1_20' | '21_100' | '101_plus';

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

export function trackEvent(
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