import type { ScopeType } from "./generated/types/scopeType";

type AuthorizationScopeDefinition = {
  warningBreadth: number | null;
  compatibilityDepth: number | null;
};

/**
 * Shared authorization scope semantics.
 *
 * warningBreadth orders scopes from broadest to narrowest for administrator
 * warnings. compatibilityDepth is intentionally limited to the operational
 * object hierarchy accepted by server permission compatibility checks.
 */
export const AUTHORIZATION_SCOPE_DEFINITIONS = {
  PLATFORM: { warningBreadth: 0, compatibilityDepth: null },
  ORGANIZATION: { warningBreadth: 1, compatibilityDepth: null },
  PORTFOLIO: { warningBreadth: 2, compatibilityDepth: null },
  FACILITY: { warningBreadth: 3, compatibilityDepth: 0 },
  BUILDING: { warningBreadth: 4, compatibilityDepth: 1 },
  SPACE: { warningBreadth: 5, compatibilityDepth: 2 },
  ASSET: { warningBreadth: 6, compatibilityDepth: 3 },
  ASSIGNED: { warningBreadth: null, compatibilityDepth: null },
  TEAM: { warningBreadth: null, compatibilityDepth: null },
  VENDOR_ASSIGNMENT: { warningBreadth: null, compatibilityDepth: null },
  OWNED_REQUEST: { warningBreadth: null, compatibilityDepth: null },
} as const satisfies Record<ScopeType, AuthorizationScopeDefinition>;

export function isBindingScopeCompatible(defaultScope: ScopeType, bindingScope: ScopeType) {
  if (bindingScope === "PLATFORM") return defaultScope === "PLATFORM";
  if (defaultScope === "PLATFORM") return false;
  if (defaultScope === "ORGANIZATION") return true;

  const defaultDepth = AUTHORIZATION_SCOPE_DEFINITIONS[defaultScope].compatibilityDepth;
  const bindingDepth = AUTHORIZATION_SCOPE_DEFINITIONS[bindingScope].compatibilityDepth;
  if (defaultDepth !== null) return bindingDepth !== null && bindingDepth >= defaultDepth;

  return defaultScope === bindingScope;
}

export function doesAuthorizationScopeBroaden(currentScope: ScopeType, nextScope: ScopeType) {
  if (currentScope === nextScope) return false;

  const currentBreadth = AUTHORIZATION_SCOPE_DEFINITIONS[currentScope].warningBreadth;
  const nextBreadth = AUTHORIZATION_SCOPE_DEFINITIONS[nextScope].warningBreadth;

  if (currentBreadth !== null && nextBreadth !== null) {
    return nextBreadth < currentBreadth;
  }

  if (currentBreadth !== null && nextBreadth === null) {
    return currentBreadth > AUTHORIZATION_SCOPE_DEFINITIONS.PORTFOLIO.warningBreadth;
  }

  return true;
}