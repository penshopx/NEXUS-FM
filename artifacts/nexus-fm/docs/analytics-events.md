# Analytics events

Replit-hosted analytics injects the tracker into published website builds. Event calls are safe no-ops when analytics is unavailable.

| Event name | When it fires | Dimensions |
| --- | --- | --- |
| `member_search_reset` | After an administrator uses **Clear search** and the member-search URL state is cleared. | `had_pagination`: whether the cleared search was beyond page 1. `had_organization_filter`: whether an organization filter was active. |
| `member_search_after_reset` | Once the next explicitly submitted member search after a reset receives a successful response. Browser navigation and automatic refetches do not fire it. | `reset_had_pagination`: whether the reset search was beyond page 1. `reset_had_organization_filter`: whether the reset search had an organization filter. `has_organization_filter`: whether the new search has an organization filter. `result`: `matches` or `no_matches`. |
| `binding_page_navigated` | After an administrator uses **Previous** or **Next** in a member's binding review. | `direction`: `previous` or `next`. `page`: destination page number. `role_filter`: active canonical role or `ALL`. `status_filter`: active binding status or `ALL`. |

These events do not include search text, member IDs, organization IDs, names, emails, organization display metadata, or other free-form text.