type AnalyticsData = Record<string, string | number | boolean>;
type AnalyticsProperties = Record<string, unknown>;

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