export function registrySearchQuery(value: string) {
  const query = value.trim();
  return query || undefined;
}