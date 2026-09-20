import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Combos activos del establecimiento, con sus productos y grupos. */
export function useActiveCombos(establishmentId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['active-menu-combos', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_combos')
        .select('id, name, description, price, image_url, is_active, menu_combo_items(id, product_id, item_group, sort_order, products(id, name, price))')
        .eq('establishment_id', establishmentId!)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!establishmentId && enabled,
  });
}

export interface ComboExpandedLine {
  product_id: string;
  name: string;
  price: number;
}

/**
 * Convierte la selección de un combo en líneas de pedido:
 * el precio del combo se aplica al plato principal y los acompañamientos van en $0,
 * de modo que el total sea exactamente el precio del combo y cada producto quede registrado.
 */
export function expandComboSelection(combo: any, selectedItems: any[]): ComboExpandedLine[] {
  if (selectedItems.length === 0) return [];
  const mainIdx = Math.max(0, selectedItems.findIndex(i => i.item_group === 'main'));
  return selectedItems.map((i, idx) => ({
    product_id: i.product_id,
    name: `${i.products?.name ?? 'Producto'} (${combo.name})`,
    price: idx === mainIdx ? Number(combo.price) : 0,
  }));
}
