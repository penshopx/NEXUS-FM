import type { ScopeType } from '@workspace/api-client-react';
import { doesAuthorizationScopeBroaden } from '@workspace/api-zod';

export function doesBindingScopeBroaden(currentScope: ScopeType, nextScope: ScopeType) {
  return doesAuthorizationScopeBroaden(currentScope, nextScope);
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