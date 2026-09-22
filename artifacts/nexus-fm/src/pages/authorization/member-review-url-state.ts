export const memberReviewParamNames = [
  'query',
  'organizationId',
  'organizationName',
  'organizationSlug',
  'page',
  'memberId',
  'memberOrganizationId',
] as const;

export type MemberReviewUrlState = {
  query: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  } | null;
  page: number;
  selection: {
    memberId: string;
    organizationId: string;
  } | null;
  hasActiveState: boolean;
  wasRepaired: boolean;
};

export type MemberReviewUrlTransition =
  | {
      type: 'search';
      query: string;
      organization: MemberReviewUrlState['organization'];
    }
  | { type: 'page'; page: number }
  | { type: 'select-member'; memberId: string; organizationId: string }
  | { type: 'clear-selection' }
  | { type: 'clear' };

function readTrimmed(params: URLSearchParams, name: string) {
  return (params.get(name) ?? '').trim();
}

export function parseMemberReviewUrlState(params: URLSearchParams): MemberReviewUrlState {
  const query = readTrimmed(params, 'query');
  const organizationId = readTrimmed(params, 'organizationId');
  const organizationName = readTrimmed(params, 'organizationName');
  const organizationSlug = readTrimmed(params, 'organizationSlug');
  const rawPage = readTrimmed(params, 'page');
  const parsedPage = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const memberId = readTrimmed(params, 'memberId');
  const memberOrganizationId = readTrimmed(params, 'memberOrganizationId');
  const hasOrganizationValues = Boolean(organizationId || organizationName || organizationSlug);
  const hasCompleteOrganization = Boolean(organizationId && organizationName && organizationSlug);
  const hasSelectionValues = Boolean(memberId || memberOrganizationId);
  const hasCompleteSelection = Boolean(memberId && memberOrganizationId);
  const hasInvalidPage = params.has('page') && (
    !/^\d+$/.test(rawPage) ||
    !Number.isSafeInteger(parsedPage) ||
    parsedPage <= 0
  );

  return {
    query,
    organization: organizationId
      ? {
          id: organizationId,
          name: organizationName || organizationId,
          slug: organizationSlug || organizationId,
        }
      : null,
    page,
    selection: memberId && memberOrganizationId
      ? { memberId, organizationId: memberOrganizationId }
      : null,
    hasActiveState: memberReviewParamNames.some((name) => params.has(name)),
    wasRepaired: hasInvalidPage ||
      (hasOrganizationValues && !hasCompleteOrganization) ||
      (hasSelectionValues && !hasCompleteSelection),
  };
}

function clearSelection(params: URLSearchParams) {
  params.delete('memberId');
  params.delete('memberOrganizationId');
}

function clearOrganization(params: URLSearchParams) {
  params.delete('organizationId');
  params.delete('organizationName');
  params.delete('organizationSlug');
}

export function transitionMemberReviewUrlState(
  current: URLSearchParams,
  transition: MemberReviewUrlTransition,
) {
  const next = new URLSearchParams(current);

  switch (transition.type) {
    case 'search': {
      const query = transition.query.trim();
      if (query) next.set('query', query);
      else next.delete('query');
      next.delete('page');
      clearSelection(next);
      if (transition.organization) {
        next.set('organizationId', transition.organization.id);
        next.set('organizationName', transition.organization.name);
        next.set('organizationSlug', transition.organization.slug);
      } else {
        clearOrganization(next);
      }
      break;
    }
    case 'page':
      if (transition.page > 1) next.set('page', String(transition.page));
      else next.delete('page');
      clearSelection(next);
      break;
    case 'select-member':
      next.set('memberId', transition.memberId);
      next.set('memberOrganizationId', transition.organizationId);
      break;
    case 'clear-selection':
      clearSelection(next);
      break;
    case 'clear':
      memberReviewParamNames.forEach((name) => next.delete(name));
      break;
  }

  return next;
}
