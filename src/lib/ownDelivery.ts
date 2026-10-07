import { db } from '@/lib/db';

// Delivery propio (pedidos por teléfono). Los pedidos son orders con channel 'delivery' y
// external_platform 'propio'; la ficha del cliente vive en customers (backend/sql/109_delivery_customers.sql).

export const OWN_PLATFORM = 'propio';

/** En los comprobantes internos (invoices) el delivery propio usa la "mesa" 0. */
export const DELIVERY_TABLE_NUMBER = 0;
export const tableLabel = (n: number | null | undefined) => (n === DELIVERY_TABLE_NUMBER ? 'Delivery' : `Mesa ${n ?? '-'}`);
/** Para columnas "Mesa": el número, o "Delivery". */
export const tableCell = (n: number | null | undefined) => (n === DELIVERY_TABLE_NUMBER ? 'Delivery' : n ?? '-');

export type PayMethod = 'cash' | 'transfer' | 'card';
export const PAY_LABEL: Record<PayMethod, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' };

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  phone_digits: string;
  street_address: string | null;
  dwelling_type: 'house' | 'apartment';
  floor: string | null;
  apartment: string | null;
  address_notes: string | null;
  whatsapp_opt_in: boolean;
  whatsapp_opt_in_at: string | null;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
  created_at: string;
}

/** Datos de entrega guardados en el pedido (copia: si el cliente se muda, el pedido no cambia). */
export interface DeliveryInfo {
  address: string | null;
  dwelling_type?: 'house' | 'apartment';
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone?: string | null;
  pay_method?: PayMethod;
  pay_with?: number | null;
}

export const onlyDigits = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '');

/** "Av. Siempre Viva 742 · Depto 3° B" */
export function formatAddress(a: { street_address?: string | null; address?: string | null; dwelling_type?: string | null; floor?: string | null; apartment?: string | null }) {
  const street = (a.street_address ?? a.address ?? '').trim();
  if (a.dwelling_type !== 'apartment') return street || 'Sin dirección';
  const unit = [a.floor ? `${a.floor}°` : '', a.apartment ?? ''].filter(Boolean).join(' ');
  return `${street || 'Sin dirección'} · Depto${unit ? ` ${unit}` : ''}`;
}

/** Link de WhatsApp (asume Argentina si el número no trae código de país). */
export function whatsappUrl(phone: string, text?: string) {
  let d = onlyDigits(phone);
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('54')) d = `549${d}`;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/**
 * Cobra y cierra un pedido de delivery propio igual que una mesa: el pedido queda cerrado con el medio
 * de pago, entra a Ventas, genera el comprobante interno (para la caja y el turno) y descuenta stock.
 */
export async function closeOwnDeliveryOrder(params: {
  order: { id: string; total: number; delivery_fee: number; customer_name: string | null; order_items: { quantity: number; unit_price: number; products?: { name: string } | null }[] };
  payMethod: PayMethod;
  amountPaid: number;
  establishmentId: string;
  userId: string | null;
}) {
  const { order, payMethod, establishmentId, userId } = params;
  const total = Number(order.total);
  const paid = payMethod === 'cash' ? params.amountPaid : total;
  if (payMethod === 'cash' && !(paid >= total)) throw new Error('El monto recibido tiene que cubrir el total');

  const { error: closeErr } = await db.from('orders').update({
    status: 'closed', payment_method: payMethod, amount_paid: paid, delivered_at: new Date().toISOString(),
  } as any).eq('id', order.id);
  if (closeErr) throw closeErr;

  let { data: salesCat } = await db.from('finance_categories').select('id')
    .eq('establishment_id', establishmentId).eq('name', 'Ventas').eq('type', 'income').maybeSingle();
  if (!salesCat) {
    ({ data: salesCat } = await db.from('finance_categories')
      .insert({ establishment_id: establishmentId, name: 'Ventas', type: 'income' }).select('id').single());
  }
  if (salesCat) {
    await db.from('finance_transactions').insert({
      establishment_id: establishmentId, category_id: (salesCat as any).id, type: 'income', amount: total,
      description: `Delivery${order.customer_name ? ` - ${order.customer_name}` : ''} - ${PAY_LABEL[payMethod]}`,
      date: new Date().toISOString().split('T')[0], created_by: userId,
    });
  }

  const items = [
    ...order.order_items.map(i => ({
      name: i.products?.name || 'Producto', qty: i.quantity, unit_price: Number(i.unit_price), subtotal: Number(i.unit_price) * i.quantity,
    })),
    ...(Number(order.delivery_fee) > 0
      ? [{ name: 'Envío', qty: 1, unit_price: Number(order.delivery_fee), subtotal: Number(order.delivery_fee), manual: true }]
      : []),
  ];
  const { data: invoice } = await db.from('invoices').insert({
    establishment_id: establishmentId, table_number: DELIVERY_TABLE_NUMBER, order_ids: [order.id], items, total,
    payment_method: payMethod, amount_paid: paid, change_amount: payMethod === 'cash' ? Math.max(0, paid - total) : 0,
    created_by: userId, tip_amount: 0,
  } as any).select('id').maybeSingle();

  if ((invoice as any)?.id) {
    const { error: stockErr } = await db.rpc('apply_sale_stock' as any, { _invoice_id: (invoice as any).id });
    if (stockErr) console.error('apply_sale_stock', stockErr);
  }
}
