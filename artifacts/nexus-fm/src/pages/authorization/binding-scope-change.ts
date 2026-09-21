import type { ScopeType } from '@workspace/api-client-react';

const hierarchicalScopeBreadth: Partial<Record<ScopeType, number>> = {
  PLATFORM: 0,
  ORGANIZATION: 1,
  PORTFOLIO: 2,
  FACILITY: 3,
  BUILDING: 4,
  SPACE: 5,
  ASSET: 6,
};

export function doesBindingScopeBroaden(currentScope: ScopeType, nextScope: ScopeType) {
  if (currentScope === nextScope) return false;

  const currentBreadth = hierarchicalScopeBreadth[currentScope];
  const nextBreadth = hierarchicalScopeBreadth[nextScope];

  if (currentBreadth !== undefined && nextBreadth !== undefined) {
    return nextBreadth < currentBreadth;
  }

  if (currentBreadth !== undefined && nextBreadth === undefined) {
    return currentBreadth > hierarchicalScopeBreadth.PORTFOLIO!;
  }

  return true;
}

export function describeBindingScope(
  scopeType: ScopeType,
  scopeId: string | null | undefined,
  options: {
    organizationName: string;
    targetName?: string | null;
  },
) {
  if (scopeType === 'PLATFORM') return 'Platform';
  if (scopeType === 'ORGANIZATION') return `Organization: ${options.organizationName}`;

  const target = options.targetName?.trim() || scopeId?.trim() || 'No target selected';
  return `${scopeType.replaceAll('_', ' ')}: ${target}`;
}