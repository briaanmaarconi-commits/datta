import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

/** 1 onza de barra = 30 ml (la medida que usan los bartenders). */
export const OZ_ML = 30;

export interface DrinkProduct {
  kind: 'product';
  id: string;
  name: string;
  stock: number; // unidades
  min: number;
  cost: number;
  category: string | null;
}

export interface Bottle {
  kind: 'bottle';
  id: string;
  name: string;
  bottle_ml: number;
  stock_ml: number;
  min_ml: number;
  cost_per_ml: number;
}

export type DrinkItem = DrinkProduct | Bottle;

export const bottlesOf = (b: Bottle) => b.stock_ml / b.bottle_ml;
export const fmtNum = (n: number, max = 1) => Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: max });
export const fmtMoney = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
export const itemKey = (i: Pick<DrinkItem, 'kind' | 'id'>) => `${i.kind}:${i.id}`;

/** Stock que hay (en unidades o botellas) y si hay que reponer. */
export function stockStatus(i: DrinkItem) {
  const [stock, min] = i.kind === 'product' ? [i.stock, i.min] : [i.stock_ml, i.min_ml];
  if (stock <= 0 || stock < min) return { label: 'Reponer', variant: 'destructive' as const };
  if (min > 0 && stock <= min * 1.25) return { label: 'Justo', variant: 'secondary' as const };
  return { label: 'OK', variant: 'outline' as const };
}

/** Inventario del modo "Bebidas y tragos": bebidas por unidad + botellas para tragos. */
export function useDrinksInventory() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  const products = useQuery({
    queryKey: ['drinks-products', establishmentId],
    queryFn: async (): Promise<DrinkProduct[]> => {
      const { data, error } = await db
        .from('products')
        .select('id, name, direct_stock, direct_min_stock, cost, categories(name)')
        .eq('establishment_id', establishmentId!)
        .eq('stock_mode', 'direct')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        kind: 'product',
        id: p.id,
        name: p.name,
        stock: Number(p.direct_stock) || 0,
        min: Number(p.direct_min_stock) || 0,
        cost: Number(p.cost) || 0,
        category: p.categories?.name ?? null,
      }));
    },
    enabled: !!establishmentId,
  });

  const bottles = useQuery({
    queryKey: ['drinks-bottles', establishmentId],
    queryFn: async (): Promise<Bottle[]> => {
      const { data, error } = await db
        .from('ingredients')
        .select('id, name, bottle_ml, current_stock, min_stock, cost_per_unit, is_active')
        .eq('establishment_id', establishmentId!)
        .not('bottle_ml', 'is', null)
        .order('name');
      if (error) throw error;
      return (data ?? [])
        .filter((b: any) => b.is_active !== false)
        .map((b: any) => ({
          kind: 'bottle',
          id: b.id,
          name: b.name,
          bottle_ml: Number(b.bottle_ml),
          stock_ml: Number(b.current_stock) || 0,
          min_ml: Number(b.min_stock) || 0,
          cost_per_ml: Number(b.cost_per_unit) || 0,
        }));
    },
    enabled: !!establishmentId,
  });

  const refresh = () => {
    for (const k of ['drinks-products', 'drinks-bottles', 'drinks-purchases', 'direct-stock-products', 'waste-items', 'stock_movements']) {
      queryClient.invalidateQueries({ queryKey: [k] });
    }
  };

  return {
    products: products.data ?? [],
    bottles: bottles.data ?? [],
    isLoading: products.isLoading || bottles.isLoading,
    refresh,
  };
}
