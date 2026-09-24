// Type-only regression checks: this file is checked by the frontend typecheck,
// but is not imported into the browser bundle.
import { trackAccessReviewEvent, trackEvent } from './analytics';

function accessReviewPrivacyContract() {
  trackAccessReviewEvent('saved_member_unavailable_shown');
  trackAccessReviewEvent('access_review_export', {
    outcome: 'success',
    role_filter_active: true,
    status_filter_active: false,
  });

  // @ts-expect-error Access-review names cannot use the unrestricted tracker.
  trackEvent('access_review_export', { member_id: 'private' });
  // @ts-expect-error Unknown event names are not allowed in access review.
  trackAccessReviewEvent('member_id_exported');
  // @ts-expect-error An event without properties cannot carry an identifier.
  trackAccessReviewEvent('saved_member_unavailable_shown', { member_id: 'private' });
  // @ts-expect-error Required safe dimensions cannot be omitted.
  trackAccessReviewEvent('access_review_export', { outcome: 'success' });
  // @ts-expect-error Unknown fields are rejected even when passed by spread.
  trackAccessReviewEvent('access_review_export', {
    outcome: 'success',
    role_filter_active: true,
    status_filter_active: false,
    ...{ organization_id: 'private' },
  });
  trackAccessReviewEvent('binding_page_navigated', {
    direction: 'next',
    page: 2,
    role_filter: 'ALL',
    status_filter: 'ALL',
    // @ts-expect-error Private binding identifiers are not dimensions.
    binding_id: 'private',
    // @ts-expect-error Private scope identifiers are not dimensions.
    scope_id: 'private',
  });
}

void accessReviewPrivacyContract;