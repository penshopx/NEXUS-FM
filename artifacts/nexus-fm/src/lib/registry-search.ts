export const REGISTRY_SEARCH_MIN_LENGTH = 3;

export function registrySearchQuery(value: string) {
  const query = value.trim();
  return query.length >= REGISTRY_SEARCH_MIN_LENGTH ? query : undefined;
}