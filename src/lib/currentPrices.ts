import { db } from '@/lib/db';

/** Precio que se cobra hoy: el promocional si la promo está activa, si no el de carta. */
export const effectivePrice = (p: { price: number | string; promo_price?: number | string | null; promo_active?: boolean | null }) =>
  p.promo_active && p.promo_price != null ? Number(p.promo_price) : Number(p.price);

/**
 * Justo antes de mandar un pedido, vuelve a leer el precio actual de cada producto.
 * La pantalla pudo quedar con la carta vieja (celular sin conexión en vivo, pedido guardado de antes),
 * y así nunca se cobra un precio desactualizado. Las líneas de combo (con line_id) conservan su precio.
 */
export async function withCurrentPrices<T extends { product_id: string; price: number; line_id?: string; name?: string }>(
  cart: T[],
): Promise<{ cart: T[]; changed: string[] }> {
  const ids = [...new Set(cart.filter(l => !l.line_id).map(l => l.product_id))];
  if (ids.length === 0) return { cart, changed: [] };
  const { data, error } = await db.from('products').select('id, name, price, promo_price, promo_active').in('id', ids);
  if (error) throw error;
  const byId = new Map((data ?? []).map((p: any) => [p.id, p]));
  const changed: string[] = [];
  const next = cart.map(l => {
    const p: any = l.line_id ? undefined : byId.get(l.product_id);
    if (!p) return l;
    const price = effectivePrice(p);
    if (price === Number(l.price)) return l;
    changed.push(l.name ?? p.name);
    return { ...l, price };
  });
  return { cart: next, changed };
}
