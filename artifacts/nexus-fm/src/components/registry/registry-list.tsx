import { Link } from 'wouter';
import { Search, Plus, Edit2, Trash2, ArrowRight, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { RegistryRecord } from '@workspace/api-client-react';
import { listFacilitiesQueryQMin } from '@workspace/api-zod';

export const registrySearchHelpText =
  `1–${listFacilitiesQueryQMin - 1} karakter mencocokkan kode secara tepat. ` +
  `Gunakan ${listFacilitiesQueryQMin}+ karakter untuk mencari dalam nama atau kode.`;

interface RegistryListProps<T extends RegistryRecord> {
  title: string;
  description: string;
  items: T[] | undefined;
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  page: number;
  totalItems: number;
  limit: number;
  hasNextPage: boolean;
  canGoPrevious: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onCreate?: () => void;
  onImport?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  renderItemLink: (item: T) => string;
  testIdPrefix?: string;
}

export function RegistryList<T extends RegistryRecord>({
  title,
  description,
  items,
  isLoading,
  searchQuery,
  onSearchChange,
  page,
  totalItems,
  limit,
  hasNextPage,
  canGoPrevious,
  onNextPage,
  onPreviousPage,
  onCreate,
  onImport,
  onEdit,
  onDelete,
  renderItemLink,
  testIdPrefix = 'registry'
}: RegistryListProps<T>) {
  const searchHelpId = `${testIdPrefix}-search-help`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Cari berdasarkan nama atau kode"
              aria-label={`Cari ${title}`}
              aria-describedby={searchHelpId}
              className="pl-9 bg-card border-border focus-visible:ring-primary"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              data-testid={`input-search-${testIdPrefix}`}
            />
            <p
              id={searchHelpId}
              className="mt-1.5 text-xs text-muted-foreground"
              data-testid={`text-search-help-${testIdPrefix}`}
            >
              {registrySearchHelpText}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onImport && (
              <Button variant="outline" onClick={onImport} data-testid={`button-import-${testIdPrefix}`}>
                <Upload className="size-4 mr-2" />
                Impor CSV
              </Button>
            )}
            {onCreate && (
              <Button onClick={onCreate} data-testid={`button-create-${testIdPrefix}`}>
                <Plus className="size-4 mr-2" />
                Buat
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border font-mono">
              <tr>
                <th className="px-6 py-4 font-medium">Nama</th>
                <th className="px-6 py-4 font-medium">Kode</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="hover:bg-muted/10">
                    <td className="px-6 py-4"><Skeleton className="h-5 w-48" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-24" /></td>
                    <td className="px-6 py-4"><Skeleton className="h-5 w-16" /></td>
                    <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-24 ml-auto" /></td>
                  </tr>
                ))
              ) : items?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    Tidak ada catatan yang sesuai dengan kriteria Anda.
                  </td>
                </tr>
              ) : (
                items?.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4 font-medium text-foreground">
                      <Link href={renderItemLink(item)} className="hover:text-primary transition-colors hover:underline" data-testid={`link-${testIdPrefix}-item-${item.id}`}>
                        {item.name}
                      </Link>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate max-w-md">{item.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                      {item.code || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-mono font-medium border ${
                        item.status === 'ACTIVE' 
                          ? 'bg-primary/10 text-primary border-primary/20' 
                          : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {item.status === 'ACTIVE' ? 'Aktif' : 'Tidak aktif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onEdit && item.capabilities?.update && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => onEdit(item)}
                            aria-label={`Edit ${item.name}`}
                            data-testid={`button-edit-${testIdPrefix}-${item.id}`}
                          >
                            <Edit2 className="size-4" />
                          </Button>
                        )}
                        {onDelete && item.capabilities?.delete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => onDelete(item)}
                            aria-label={`Hapus ${item.name}`}
                            data-testid={`button-delete-${testIdPrefix}-${item.id}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="size-8 ml-2 hover:bg-primary hover:text-primary-foreground" asChild>
                          <Link
                            href={renderItemLink(item)}
                            aria-label={`Lihat ${item.name}`}
                            data-testid={`link-view-${testIdPrefix}-${item.id}`}
                          >
                            <ArrowRight className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {totalItems > 0 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground font-mono bg-muted/10">
            <div>
                Menampilkan {Math.min((page - 1) * limit + 1, totalItems)} sampai {Math.min(page * limit, totalItems)} dari {totalItems}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 font-mono"
                onClick={onPreviousPage}
                disabled={!canGoPrevious}
                data-testid={`button-prev-page-${testIdPrefix}`}
              >
                Sebelumnya
              </Button>
               <div className="px-2">Halaman {page}</div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 font-mono"
                onClick={onNextPage}
                disabled={!hasNextPage}
                data-testid={`button-next-page-${testIdPrefix}`}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}