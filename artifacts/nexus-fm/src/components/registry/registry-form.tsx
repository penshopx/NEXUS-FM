import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RegistryInputStatus } from '@workspace/api-client-react';

const schema = z.object({
  name: z.string().min(1, 'Nama wajib diisi').max(200),
  code: z.string().max(100).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  status: z.enum([RegistryInputStatus.ACTIVE, RegistryInputStatus.INACTIVE]).optional(),
});

type RegistryFormValues = z.infer<typeof schema>;

export interface RegistryFormProps {
  defaultValues?: Partial<{ name: string; code?: string | null; description?: string | null; status: string }>;
  onSubmit: (data: RegistryFormValues) => void;
  isPending: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

export function RegistryForm({ defaultValues, onSubmit, isPending, submitLabel = 'Simpan', onCancel }: RegistryFormProps) {
  const form = useForm<RegistryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name || '',
      code: defaultValues?.code || '',
      description: defaultValues?.description || '',
      status: (defaultValues?.status as RegistryInputStatus) || RegistryInputStatus.ACTIVE,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nama</FormLabel>
                <FormControl>
                  <Input placeholder="Contoh: Kampus Utama" {...field} data-testid="input-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Kode</FormLabel>
                <FormControl>
                  <Input placeholder="Contoh: MC-01" {...field} value={field.value || ''} data-testid="input-code" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={RegistryInputStatus.ACTIVE}>Aktif</SelectItem>
                  <SelectItem value={RegistryInputStatus.INACTIVE}>Tidak aktif</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deskripsi</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Detail tambahan..."
                  className="resize-none min-h-[100px]" 
                  {...field} 
                  value={field.value || ''}
                  data-testid="input-description" 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} data-testid="button-cancel">
              Batal
            </Button>
          )}
          <Button type="submit" disabled={isPending} data-testid="button-submit">
            {isPending ? 'Menyimpan...' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}