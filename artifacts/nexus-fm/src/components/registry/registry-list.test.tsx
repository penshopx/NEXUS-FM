import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegistryRecord } from '@workspace/api-client-react';
import { registrySearchQuery } from '@/lib/registry-search';
import { RegistryList } from './registry-list';

afterEach(cleanup);

describe('RegistryList search', () => {
  it('produces API queries for trimmed exact short codes and longer substrings', () => {
    expect(registrySearchQuery('')).toBeUndefined();
    expect(registrySearchQuery(' a ')).toBe('a');
    expect(registrySearchQuery(' ab ')).toBe('ab');
    expect(registrySearchQuery(' abc ')).toBe('abc');
  });

  it('explains exact short-code lookup and keeps the input controlled', async () => {
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
        hasNextPage={false}
        canGoPrevious={false}
        onNextPage={vi.fn()}
        onPreviousPage={vi.fn()}
        renderItemLink={(item) => `/app/facilities/${item.id}`}
        testIdPrefix="facilities"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Cari Facilities' });
    const help = screen.getByTestId('text-search-help-facilities');
    expect(input).toHaveAttribute('placeholder', 'Cari berdasarkan nama atau kode');
    expect(input).toHaveAttribute('aria-describedby', help.id);
    expect(help).toHaveTextContent('1–2 karakter mencocokkan kode secara tepat. Gunakan 3+ karakter untuk mencari dalam nama atau kode.');

    await userEvent.type(input, 'ab');
    expect(onSearchChange).toHaveBeenCalledWith('a');
    expect(onSearchChange).toHaveBeenCalledWith('b');
  });
});

describe('RegistryList cursor pagination', () => {
  it('moves forward and backward through multiple cursor pages', async () => {
    const onNextPage = vi.fn();
    const onPreviousPage = vi.fn();
    const { rerender } = render(
      <RegistryList<RegistryRecord>
        title="Facilities"
        description="Facility registry"
        items={[{ id: '1', name: 'One', status: 'ACTIVE', capabilities: {} } as RegistryRecord]}
        isLoading={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        page={1}
        totalItems={30}
        limit={10}
        hasNextPage
        canGoPrevious={false}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        renderItemLink={(item) => `/app/facilities/${item.id}`}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    expect(onNextPage).toHaveBeenCalledOnce();

    rerender(
      <RegistryList<RegistryRecord>
        title="Facilities"
        description="Facility registry"
        items={[{ id: '2', name: 'Two', status: 'ACTIVE', capabilities: {} } as RegistryRecord]}
        isLoading={false}
        searchQuery=""
        onSearchChange={vi.fn()}
        page={3}
        totalItems={30}
        limit={10}
        hasNextPage={false}
        canGoPrevious
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        renderItemLink={(item) => `/app/facilities/${item.id}`}
      />,
    );

    expect(screen.getByText('Halaman 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Sebelumnya' }));
    expect(onPreviousPage).toHaveBeenCalledOnce();
  });
});