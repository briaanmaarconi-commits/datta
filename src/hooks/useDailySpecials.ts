import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';

// Platos del día: productos normales dentro de la categoría especial "Plato del día" del local
// (ver backend/sql/122_platos_del_dia.sql). Los carga cualquier persona del personal, mozos incluidos.

const lastPriceKey = (establishmentId: string) => `daily_special_last_price:${establishmentId}`;

export function getLastDailySpecialPrice(establishmentId?: string | null): number | null {
  if (!establishmentId) return null;
  try {
    const v = Number(localStorage.getItem(lastPriceKey(establishmentId)));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** ¿Es un plato del día? (los de la categoría especial o los marcados desde la carta). */
export const isDailySpecial = (p: any, dailyCategoryId?: string | null) =>
  !!p.is_daily_special || (!!dailyCategoryId && p.category_id === dailyCategoryId);

export function useDailySpecials(establishmentId?: string | null) {
  const queryClient = useQueryClient();

  const { data: categoryId = null } = useQuery({
    queryKey: ['daily-special-category', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('categories')
        .select('id')
        .eq('establishment_id', establishmentId!)
        .eq('is_daily_special_category', true)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.id ?? null) as string | null;
    },
    enabled: !!establishmentId,
  });

  // Devuelve la promesa: el diálogo se cierra recién cuando la lista ya muestra el cambio.
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['products', establishmentId] }),
    queryClient.invalidateQueries({ queryKey: ['cashier-add-products', establishmentId] }),
    queryClient.invalidateQueries({ queryKey: ['daily-special-category', establishmentId] }),
  ]);

  const save = useMutation({
    mutationFn: async ({ id, name, price }: { id?: string; name: string; price: number }) => {
      const cleanName = name.trim();
      if (id) {
        const { error } = await db.from('products').update({ name: cleanName, price }).eq('id', id);
        if (error) throw error;
      } else {
        const { data: catId, error: catErr } = await db.rpc('ensure_daily_special_category' as any);
        if (catErr) throw catErr;
        // Si ya se cargó antes con el mismo nombre, se reactiva en vez de duplicarlo.
        const { data: existing, error: findErr } = await db
          .from('products')
          .select('id')
          .eq('category_id', catId as string)
          .ilike('name', cleanName)
          .limit(1);
        if (findErr) throw findErr;
        const prev = (existing as any[] | null)?.[0];
        const { error } = prev
          ? await db.from('products')
              .update({ name: cleanName, price, is_available: true, is_daily_special: true })
              .eq('id', prev.id)
          : await db.from('products').insert({
              establishment_id: establishmentId!,
              category_id: catId as string,
              name: cleanName,
              price,
              is_available: true,
              is_daily_special: true,
            });
        if (error) throw error;
      }
      try { localStorage.setItem(lastPriceKey(establishmentId!), String(price)); } catch {}
    },
    onSuccess: refresh,
  });

  // Nunca se borra: los pedidos viejos apuntan al producto. Se oculta.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('products').update({ is_available: false, is_daily_special: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return { categoryId, save, remove };
}
