import { describe, expect, it } from 'vitest';
import {
  ListFacilitiesQueryParams,
  listFacilitiesQueryQMin,
} from '@workspace/api-zod';
import { registrySearchHelpText } from './registry-list';

describe('registry search limit', () => {
  it('keeps generated validation and displayed guidance aligned', () => {
    const belowMinimum = 'x'.repeat(listFacilitiesQueryQMin - 1);
    const atMinimum = 'x'.repeat(listFacilitiesQueryQMin);

    expect(ListFacilitiesQueryParams.safeParse({
      q: belowMinimum,
      page: 1,
      limit: 50,
    }).success).toBe(false);
    expect(ListFacilitiesQueryParams.safeParse({
      q: atMinimum,
      page: 1,
      limit: 50,
    }).success).toBe(true);
    expect(registrySearchHelpText).toContain(`1–${listFacilitiesQueryQMin - 1}`);
    expect(registrySearchHelpText).toContain(`${listFacilitiesQueryQMin}+`);
  });
});