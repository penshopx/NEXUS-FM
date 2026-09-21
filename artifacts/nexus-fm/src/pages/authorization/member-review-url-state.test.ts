import { describe, expect, it } from 'vitest';
import {
  parseMemberReviewUrlState,
  transitionMemberReviewUrlState,
} from './member-review-url-state';

describe('member review URL state', () => {
  it('parses malformed and partial bookmarked state safely', () => {
    expect(parseMemberReviewUrlState(new URLSearchParams(
      'query=+Target+&organizationName=Ignored&page=2oops&memberId=user-1',
    ))).toEqual({
      query: 'Target',
      organization: null,
      page: 1,
      selection: null,
      hasActiveState: true,
    });
  });

  it('restores existing bookmarked links with metadata fallbacks', () => {
    expect(parseMemberReviewUrlState(new URLSearchParams(
      'query=Target&organizationId=org-2&page=2&memberId=user-1&memberOrganizationId=org-1',
    ))).toEqual({
      query: 'Target',
      organization: { id: 'org-2', name: 'org-2', slug: 'org-2' },
      page: 2,
      selection: { memberId: 'user-1', organizationId: 'org-1' },
      hasActiveState: true,
    });
  });

  it('produces canonical search state while preserving unrelated URL keys', () => {
    const next = transitionMemberReviewUrlState(
      new URLSearchParams(
        'tab=bindings&query=Old&page=4&memberId=user-1&memberOrganizationId=org-1',
      ),
      {
        type: 'search',
        query: '  Target  ',
        organization: { id: 'org-2', name: 'Acme Facilities', slug: 'acme' },
      },
    );

    expect(next.toString()).toBe(
      'tab=bindings&query=Target&organizationId=org-2&organizationName=Acme+Facilities&organizationSlug=acme',
    );
  });

  it('applies explicit preservation and clearing rules for each transition', () => {
    const selected = new URLSearchParams(
      'tab=bindings&query=Target&organizationId=org-2&organizationName=Acme&organizationSlug=acme&page=3&memberId=user-1&memberOrganizationId=org-1',
    );

    expect(transitionMemberReviewUrlState(selected, { type: 'page', page: 1 }).toString())
      .toBe('tab=bindings&query=Target&organizationId=org-2&organizationName=Acme&organizationSlug=acme');
    expect(transitionMemberReviewUrlState(selected, { type: 'clear-selection' }).toString())
      .toBe('tab=bindings&query=Target&organizationId=org-2&organizationName=Acme&organizationSlug=acme&page=3');
    expect(transitionMemberReviewUrlState(selected, { type: 'clear' }).toString())
      .toBe('tab=bindings');
  });
});
