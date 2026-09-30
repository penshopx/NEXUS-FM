// Compiled by the frontend typecheck, but never imported into the app.
// These negative assertions fail the build if export analytics become permissive.
import type { trackAccessReviewEvent, trackEvent } from './analytics';

function checkExportAnalyticsTypes(
  track: typeof trackAccessReviewEvent,
  trackGeneric: typeof trackEvent,
) {
  track('access_review_export', {
    outcome: 'success',
    role_filter_active: false,
    status_filter_active: true,
  });

  // @ts-expect-error access-review exports cannot use the unrestricted tracker
  trackGeneric('access_review_export', { user_id: 'private' });

  // @ts-expect-error outcome must be success or failure
  track('access_review_export', { outcome: 'denied', role_filter_active: false, status_filter_active: false });

  // @ts-expect-error both filter flags are required
  track('access_review_export', { outcome: 'success', role_filter_active: false });

  // @ts-expect-error selected role values must not be sent
  track('access_review_export', { outcome: 'success', role_filter_active: false, status_filter_active: false, role_filter: 'PLATFORM_ADMIN' });

  // @ts-expect-error identifiers and server text must not be sent, including through spreads
  track('access_review_export', {
    outcome: 'failure',
    ...{ role_filter_active: false, status_filter_active: false, user_id: 'private', server_error: 'private' },
  });

  // @ts-expect-error flags must be booleans, not selected status values
  track('access_review_export', { outcome: 'failure', role_filter_active: false, status_filter_active: 'SUSPENDED' });
}

void checkExportAnalyticsTypes;