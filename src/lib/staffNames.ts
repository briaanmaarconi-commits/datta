import { db } from '@/lib/db';

/** Nombre corto para mostrar de un usuario del local: nombre completo o, si no tiene, el email antes de la @. */
export function staffDisplayName(p: { full_name?: string | null; email?: string | null } | null | undefined): string | null {
  const name = p?.full_name?.trim();
  if (name) return name;
  const email = p?.email?.trim();
  return email ? email.split('@')[0] : null;
}

/** id de usuario → nombre, para los ids que se pidan (la base solo devuelve personal del propio local). */
export async function fetchStaffNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data, error } = await db.from('profiles').select('id, full_name, email').in('id', unique);
  if (error) {
    console.warn('No se pudieron leer los nombres del personal', error);
    return out;
  }
  for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
    const n = staffDisplayName(p);
    if (n) out.set(p.id, n);
  }
  return out;
}

interface WithCreator {
  created_by?: string | null;
  waiter_name?: string | null;
  order_items?: { created_by?: string | null; waiter_name?: string | null }[] | null;
}

/** Agrega `waiter_name` a cada pedido y a cada ítem (quién lo cargó; si el ítem no lo sabe, quien abrió el pedido). */
export async function attachWaiterNames<T extends WithCreator>(orders: T[]): Promise<T[]> {
  const names = await fetchStaffNames(
    orders.flatMap((o) => [o.created_by, ...(o.order_items ?? []).map((i) => i.created_by)]),
  );
  for (const o of orders) {
    o.waiter_name = (o.created_by && names.get(o.created_by)) || null;
    for (const i of o.order_items ?? []) {
      i.waiter_name = (i.created_by && names.get(i.created_by)) || o.waiter_name || null;
    }
  }
  return orders;
}

/** Mozo a imprimir en una comanda: el de los ítems que salen (agregado de otro mozo), si no el del pedido. */
export function waiterForTicket(order: WithCreator, items: { waiter_name?: string | null }[]): string | null {
  return items.find((i) => i.waiter_name)?.waiter_name ?? order.waiter_name ?? null;
}
