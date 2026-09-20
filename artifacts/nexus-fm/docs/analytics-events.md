# Analytics events

Replit-hosted analytics injects the tracker into published website builds. Event calls are safe no-ops when analytics is unavailable.

| Event name | When it fires | Dimensions |
| --- | --- | --- |
| `member_search_reset` | After an administrator uses **Clear search** and the member-search URL state is cleared. | `had_pagination`: whether the cleared search was beyond page 1. `had_organization_filter`: whether an organization filter was active. |

The event does not include search text, member details, organization IDs, or organization display metadata.