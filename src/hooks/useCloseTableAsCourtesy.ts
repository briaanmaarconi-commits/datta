import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CourtesyType = 'invitation' | 'staff_meal' | 'internal';

export const COURTESY_TYPES: { value: CourtesyType; label: string }[] = [
  { value: 'invitation', label: 'Invitación / Cortesía' },
  { value: 'staff_meal', label: 'Comida de personal' },
  { value: 'internal', label: 'Consumo interno' },
];

interface CloseAsCourtesyParams {
  establishmentId: string;
  userId: string | null;
  tableId: string;
  tableNumber: number;
  orderIds: string[];
  courtesyType: CourtesyType;
  notes?: string;
  /** Persona (cuenta corriente de cortesías) a la que se imputa el consumo */
  accountId?: string | null;
}

/**
 * Cierra una o varias órdenes de una mesa como cortesía:
 * 1. Marca las órdenes como 'cancelled' con payment_method = 'courtesy'
 * 2. Libera la mesa
 * 3. Descuenta stock de los ingredientes según las recetas de los productos pedidos
 * 4. Genera un finance_transaction (expense) con el costo TOTAL de los ingredientes consumidos
 *
 * NO genera invoice. NO genera ingreso por venta.
 */
export async function closeTableAsCourtesy(params: CloseAsCourtesyParams) {
  const { establishmentId, userId, tableId, tableNumber, orderIds, courtesyType, notes, accountId } = params;
  if (orderIds.length === 0) throw new Error('No hay pedidos para cerrar');

  const typeLabel = COURTESY_TYPES.find(t => t.value === courtesyType)?.label ?? 'Consumo interno';

  // 1. Traer todos los items de las órdenes con productos
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('product_id, quantity, unit_price, cost_snapshot, products(name, stock_mode, cost)')
    .in('order_id', orderIds);
  if (itemsErr) throw itemsErr;

  // Monto de venta (lo que hubiera pagado el cliente)
  const saleAmount = (items || []).reduce(
    (s: number, it: any) => s + Number(it.unit_price ?? 0) * Number(it.quantity ?? 0),
    0,
  );

  // 2. Calcular consumo agregado por ingrediente (vía recetas) + descuento de stock directo

  const ingredientUsage: Map<string, number> = new Map(); // ingredient_id -> total qty (en unidad base)
  const directDeductions: { product_id: string; qty: number }[] = [];
  let totalCost = 0;

  for (const item of items || []) {
    const stockMode = (item.products as any)?.stock_mode;
    const qty = Number(item.quantity);

    if (stockMode === 'recipe') {
      const { data: recipes } = await supabase
        .from('product_recipes')
        .select('ingredient_id, quantity')
        .eq('product_id', item.product_id);
      for (const r of recipes || []) {
        const used = Number(r.quantity) * qty;
        ingredientUsage.set(r.ingredient_id, (ingredientUsage.get(r.ingredient_id) ?? 0) + used);
      }
    } else if (stockMode === 'direct') {
      directDeductions.push({ product_id: item.product_id, qty });
    } else {
      // stock_mode = 'none': usar costo manual (cost_snapshot del item o cost del producto)
      const unitCost = Number(item.cost_snapshot) || Number((item.products as any)?.cost) || 0;
      totalCost += unitCost * qty;
    }
  }

  // 3. Costear consumo y descontar stock de ingredientes
  if (ingredientUsage.size > 0) {
    const ids = Array.from(ingredientUsage.keys());
    const { data: ings } = await supabase.from('ingredients').select('id, name, unit, current_stock, cost_per_unit').in('id', ids);
    for (const ing of ings || []) {
      const used = ingredientUsage.get(ing.id) ?? 0;
      totalCost += Number(ing.cost_per_unit) * used;
      const newStock = Math.max(0, Number(ing.current_stock) - used);
      await supabase.from('ingredients').update({ current_stock: newStock }).eq('id', ing.id);
    }
  }

  // 4. Descontar stock directo y costear
  for (const d of directDeductions) {
    const { data: prod } = await supabase.from('products').select('direct_stock, cost').eq('id', d.product_id).single();
    if (prod) {
      totalCost += Number(prod.cost) * d.qty;
      const newStock = Math.max(0, Number(prod.direct_stock) - d.qty);
      await supabase.from('products').update({ direct_stock: newStock }).eq('id', d.product_id);
    }
  }

  // 5. Crear SIEMPRE el registro en Caja (aunque costo=0) para dejar trazabilidad de la cortesía
  let financeTxId: string | null = null;
  const { data: catId, error: catErr } = await supabase.rpc('ensure_consumption_expense_category', {
    _establishment_id: establishmentId,
    _consumption_type: courtesyType,
  });
  if (catErr) throw catErr;
  if (catId) {
    const { data: tx, error: txErr } = await supabase.from('finance_transactions').insert({
      establishment_id: establishmentId,
      category_id: catId as unknown as string,
      type: 'expense',
      amount: totalCost,
      description: `${typeLabel} — Mesa ${tableNumber}${notes ? ` (${notes})` : ''}`,
      date: new Date().toISOString().split('T')[0],
      created_by: userId,
    }).select('id').single();
    if (txErr) throw txErr;
    financeTxId = tx.id;
  }

  // 6. Registrar movimientos de stock por cada ingrediente
  if (ingredientUsage.size > 0) {
    const movements = Array.from(ingredientUsage.entries()).map(([ingredient_id, qty]) => ({
      establishment_id: establishmentId,
      ingredient_id,
      type: 'consumption' as any,
      quantity: -qty,
      reason: `${typeLabel} — Mesa ${tableNumber}${notes ? ` (${notes})` : ''}`,
      consumption_type: courtesyType,
      finance_transaction_id: financeTxId,
      reference_id: orderIds[0],
      created_by: userId,
    }));
    await supabase.from('stock_movements').insert(movements as any);
  }

  // 7. Registrar el consumo en la cuenta corriente de cortesías
  await supabase.from('courtesy_charges').insert({
    establishment_id: establishmentId,
    account_id: accountId ?? null,
    table_number: tableNumber,
    order_ids: orderIds,
    courtesy_type: courtesyType,
    sale_amount: saleAmount,
    cost_amount: totalCost,
    notes: notes || null,
    finance_transaction_id: financeTxId,
    created_by: userId,
  } as any);

  // 8. Cerrar las órdenes y liberar la mesa
  for (const orderId of orderIds) {
    await supabase.from('orders').update({
      status: 'cancelled' as any,
      payment_method: 'courtesy',
    } as any).eq('id', orderId);
  }
  await supabase.from('tables').update({ status: 'free' as any }).eq('id', tableId);

  return { totalCost, saleAmount, financeTxId };
}

export function useCloseTableAsCourtesy(opts?: { onSuccess?: (r: { totalCost: number }) => void; onError?: (e: any) => void }) {
  return useMutation({
    mutationFn: closeTableAsCourtesy,
    onSuccess: opts?.onSuccess,
    onError: opts?.onError,
  });
}
