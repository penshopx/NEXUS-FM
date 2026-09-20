import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegistryRecord } from '@workspace/api-client-react';
import { registrySearchQuery } from '@/lib/registry-search';
import { RegistryList } from './registry-list';

afterEach(cleanup);

describe('RegistryList search', () => {
  it('only produces API queries for trimmed terms of at least three characters', () => {
    expect(registrySearchQuery('')).toBeUndefined();
    expect(registrySearchQuery(' a ')).toBeUndefined();
    expect(registrySearchQuery(' ab ')).toBeUndefined();
    expect(registrySearchQuery(' abc ')).toBe('abc');
  });

  it('communicates the three-character minimum and keeps the input controlled', async () => {
    const onSearchChange = vi.fn();
    render(
      <RegistryList<RegistryRecord>
        title="Facilities"
        description="Facility registry"
        items={[]}
        isLoading={false}
        searchQuery=""
        onSearchChange={onSearchChange}
        page={1}
        totalItems={0}
        limit={10}
        onPageChange={vi.fn()}
        renderItemLink={(item) => `/app/facilities/${item.id}`}
        testIdPrefix="facilities"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Search Facilities' });
    const help = screen.getByTestId('text-search-help-facilities');
    expect(input).toHaveAttribute('placeholder', 'Search (3+ characters)');
    expect(input).toHaveAttribute('aria-describedby', help.id);
    expect(help).toHaveTextContent('Enter at least 3 characters to search.');

    await userEvent.type(input, 'ab');
    expect(onSearchChange).toHaveBeenCalledWith('a');
    expect(onSearchChange).toHaveBeenCalledWith('b');
  });
});