# Analytics events

Replit-hosted analytics injects the tracker into published website builds. Event calls are safe no-ops when analytics is unavailable.

| Event name | When it fires | Dimensions |
| --- | --- | --- |
| `member_search_reset` | After an administrator uses **Clear search** and the member-search URL state is cleared. | `had_pagination`: whether the cleared search was beyond page 1. `had_organization_filter`: whether an organization filter was active. |
| `member_search_after_reset` | Once the next explicitly submitted member search after a reset receives a successful response. Browser navigation and automatic refetches do not fire it. | `reset_had_pagination`: whether the reset search was beyond page 1. `reset_had_organization_filter`: whether the reset search had an organization filter. `has_organization_filter`: whether the new search has an organization filter. `result`: `matches` or `no_matches`. |
| `saved_member_unavailable_shown` | Once when a successful member search confirms that a saved selection is unavailable. Loading, errors, retries, and ordinary rerenders do not repeat the event for the same unavailable selection. | None. |
| `saved_member_unavailable_cleared` | When an administrator clears the unavailable saved selection from its notice. | None. |
| `binding_page_navigated` | After an administrator uses **Previous** or **Next** in a member's binding review. | `direction`: `previous` or `next`. `page`: destination page number. `role_filter`: active canonical role or `ALL`. `status_filter`: active binding status or `ALL`. |
| `binding_filters_applied` | Once a role or status filter receives a successful response after an administrator applies it. Failed requests, automatic refetches, and initial loading do not fire the event. | `role_filter`: active canonical role or `ALL`. `status_filter`: active canonical binding status or `ALL`. `result_count_bucket`: `no_matches`, `1_20`, `21_100`, or `101_plus`, based on the response total. |
| `binding_filters_cleared` | Once the binding list receives a successful response after an administrator clears one filter through its **All** option or clears all filters with **Clear filters**. | `role_filter`: remaining canonical role or `ALL`. `status_filter`: remaining canonical binding status or `ALL`. `result_count_bucket`: `no_matches`, `1_20`, `21_100`, or `101_plus`, based on the response total. |

These events do not include search text, member IDs, organization IDs, names, emails, organization display metadata, exact result counts, or other free-form text. The saved-member-unavailable events have no dimensions.