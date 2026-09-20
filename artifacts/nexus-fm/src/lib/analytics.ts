type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    // Injected by Replit's deployment proxy when Project Analytics is enabled.
    // The application must not initialize or configure this tracker itself.
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never interrupt application workflows.
  }
}