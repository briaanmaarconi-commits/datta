import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import CostsTab from '@/components/admin/CostsTab';

export default function AdminCosts() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = db
      .channel('products-costs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products-with-recipes'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_recipes' }, () => {
        queryClient.invalidateQueries({ queryKey: ['products-with-recipes'] });
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [queryClient]);

  const { data: products = [] } = useQuery({
    queryKey: ['products-with-recipes', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('products')
        .select('*, categories(name), product_recipes(quantity, ingredients(name, unit, cost_per_unit))')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Precios y márgenes</h1>
      <CostsTab products={products as any} establishmentId={establishmentId!} />
    </div>
  );
}
