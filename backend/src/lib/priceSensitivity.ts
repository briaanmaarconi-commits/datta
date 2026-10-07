import type pg from "pg";

// Sensibilidad de la demanda al precio (elasticidad precio) por producto, pensada para que el dueño
// entienda si puede subir un precio. Se compara el último cambio de precio de cada plato:
// - cada día con ventas del local tiene un "precio vigente" del plato (aunque ese día no se haya vendido);
// - la demanda se mide en unidades cada 100 pedidos del local, para que un mes flojo o uno fuerte
//   no se confunda con el efecto del precio.

export const LOOKBACK_DAYS = 180;
const MIN_DAYS_PER_PRICE = 7;
const MIN_UNITS = 10;

export type Verdict = "can_raise" | "careful" | "lower_helped" | "inconclusive" | "no_change" | "not_enough_data";

export interface SaleRow { product_id: string; day: string; unit_price: number; quantity: number }
export interface ProductInfo { id: string; name: string; price: number }

export interface Sensitivity {
  product_id: string;
  name: string;
  current_price: number;
  verdict: Verdict;
  /** Frase lista para mostrar o para que la use el asistente. */
  summary: string;
  before?: { price: number; days: number; units: number; per100: number };
  after?: { price: number; days: number; units: number; per100: number };
  price_change_pct?: number;
  demand_change_pct?: number;
  revenue_change_pct?: number;
  elasticity?: number;
  units: number;
}

const pct = (a: number, b: number) => (a === 0 ? 0 : ((b - a) / a) * 100);
const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}%`;

/**
 * Cálculo puro (testeable). `ordersByDay`: pedidos cerrados del local por día (solo días abiertos).
 */
export function computeSensitivity(products: ProductInfo[], sales: SaleRow[], ordersByDay: Map<string, number>): Sensitivity[] {
  const days = [...ordersByDay.keys()].sort();
  const byProduct = new Map<string, SaleRow[]>();
  for (const s of sales) {
    const list = byProduct.get(s.product_id);
    if (list) list.push(s);
    else byProduct.set(s.product_id, [s]);
  }

  const out: Sensitivity[] = [];
  for (const p of products) {
    const rows = byProduct.get(p.id) ?? [];
    const units = rows.reduce((s, r) => s + r.quantity, 0);
    const base = { product_id: p.id, name: p.name, current_price: p.price, units };
    if (units === 0) continue;

    // Precio del día = el más vendido ese día (las promos sueltas no cambian el precio vigente).
    const perDay = new Map<string, Map<number, number>>();
    for (const r of rows) {
      const price = Math.round(r.unit_price * 100) / 100;
      const m = perDay.get(r.day) ?? new Map<number, number>();
      m.set(price, (m.get(price) ?? 0) + r.quantity);
      perDay.set(r.day, m);
    }
    const firstSale = [...perDay.keys()].sort()[0];
    let current: number | null = null;
    // segmentos consecutivos de precio vigente: [{price, days, units, orders}]
    const segments: { price: number; days: number; units: number; orders: number }[] = [];
    for (const d of days) {
      if (d < firstSale) continue;
      const m = perDay.get(d);
      let unitsToday = 0;
      if (m) {
        let best = -1;
        for (const [price, q] of m) {
          unitsToday += q;
          if (q > best) { best = q; current = price; }
        }
      }
      if (current === null) continue;
      const last = segments[segments.length - 1];
      if (last && last.price === current) {
        last.days++;
        last.units += unitsToday;
        last.orders += ordersByDay.get(d) ?? 0;
      } else {
        segments.push({ price: current, days: 1, units: unitsToday, orders: ordersByDay.get(d) ?? 0 });
      }
    }

    // Se unen segmentos repetidos del mismo precio (p. ej. vuelve al precio anterior tras una promo larga).
    const levels = new Map<number, { price: number; days: number; units: number; orders: number; lastIdx: number }>();
    segments.forEach((s, i) => {
      const l = levels.get(s.price) ?? { price: s.price, days: 0, units: 0, orders: 0, lastIdx: i };
      l.days += s.days; l.units += s.units; l.orders += s.orders; l.lastIdx = i;
      levels.set(s.price, l);
    });
    const valid = [...levels.values()].filter((l) => l.days >= MIN_DAYS_PER_PRICE && l.orders > 0).sort((a, b) => a.lastIdx - b.lastIdx);

    if (levels.size < 2) {
      out.push({ ...base, verdict: "no_change", summary: `No cambió de precio en los últimos ${LOOKBACK_DAYS / 30} meses: todavía no se puede medir.` });
      continue;
    }
    if (valid.length < 2 || units < MIN_UNITS) {
      out.push({ ...base, verdict: "not_enough_data", summary: "Cambió de precio hace poco o se vende poco: hacen falta unas semanas más de ventas para sacar conclusiones." });
      continue;
    }

    const after = valid[valid.length - 1];
    const before = valid[valid.length - 2];
    const per100 = (l: typeof after) => (l.units / l.orders) * 100;
    const qB = per100(before), qA = per100(after);
    const dP = pct(before.price, after.price);
    const dQ = pct(qB, qA);
    const dR = pct(qB * before.price, qA * after.price);
    // Elasticidad arco (punto medio): robusta al sentido del cambio.
    const e = ((qA - qB) / ((qA + qB) / 2)) / ((after.price - before.price) / ((after.price + before.price) / 2));
    const pick = (l: typeof after) => ({ price: l.price, days: l.days, units: l.units, per100: Math.round(per100(l) * 10) / 10 });

    const raised = after.price > before.price;
    const change = `${raised ? "Subió" : "Bajó"} de ${money(before.price)} a ${money(after.price)} (${fmtPct(dP)})`;
    let verdict: Verdict;
    let summary: string;
    if (e > 0.05) {
      verdict = "inconclusive";
      summary = `${change} y la demanda se movió en el mismo sentido (${fmtPct(dQ)}). Seguramente influyeron otras cosas (temporada, promos, carta): no se puede sacar una conclusión del precio.`;
    } else if (e > -1) {
      verdict = raised ? "can_raise" : "inconclusive";
      summary = raised
        ? `${change} y casi no afectó las ventas (${fmtPct(dQ)} cada 100 pedidos): lo que factura este plato cambió ${fmtPct(dR)}. Los clientes no son muy sensibles al precio: tiene margen para ajustarlo.`
        : `${change} y se vendió apenas más (${fmtPct(dQ)}): la facturación de este plato cambió ${fmtPct(dR)}. Bajarlo no atrajo muchas más ventas.`;
    } else {
      verdict = raised ? "careful" : "lower_helped";
      summary = raised
        ? `${change} y se vendió bastante menos (${fmtPct(dQ)} cada 100 pedidos): lo que factura este plato cambió ${fmtPct(dR)}. Los clientes son sensibles al precio de este plato: cuidado con volver a subirlo.`
        : `${change} y se vendió mucho más (${fmtPct(dQ)}): la facturación de este plato cambió ${fmtPct(dR)}. Bajar el precio funcionó.`;
    }
    out.push({
      ...base, verdict, summary, before: pick(before), after: pick(after),
      price_change_pct: Math.round(dP * 10) / 10, demand_change_pct: Math.round(dQ * 10) / 10,
      revenue_change_pct: Math.round(dR * 10) / 10, elasticity: Math.round(e * 100) / 100,
    });
  }

  const order: Record<Verdict, number> = { careful: 0, can_raise: 1, lower_helped: 2, inconclusive: 3, not_enough_data: 4, no_change: 5 };
  return out.sort((a, b) => order[a.verdict] - order[b.verdict] || b.units - a.units);
}

/** Lee ventas de los últimos LOOKBACK_DAYS del local y calcula la sensibilidad de cada producto. */
export async function analyzePriceSensitivity(c: pg.PoolClient, establishmentId: string): Promise<Sensitivity[]> {
  const tz = "America/Argentina/Buenos_Aires";
  const products = (
    await c.query(`SELECT id, name, price::float AS price FROM public.products WHERE establishment_id = $1`, [establishmentId])
  ).rows as ProductInfo[];
  const sales = (
    await c.query(
      `SELECT oi.product_id, to_char((o.created_at AT TIME ZONE '${tz}')::date, 'YYYY-MM-DD') AS day,
              oi.unit_price::float AS unit_price, oi.quantity
         FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
        WHERE o.establishment_id = $1 AND o.status = 'closed' AND o.created_at >= now() - make_interval(days => $2)
          AND oi.product_id IS NOT NULL AND oi.unit_price > 0`,
      [establishmentId, LOOKBACK_DAYS],
    )
  ).rows as SaleRow[];
  const days = (
    await c.query(
      `SELECT to_char((created_at AT TIME ZONE '${tz}')::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
         FROM public.orders WHERE establishment_id = $1 AND status = 'closed' AND created_at >= now() - make_interval(days => $2)
        GROUP BY 1`,
      [establishmentId, LOOKBACK_DAYS],
    )
  ).rows as { day: string; n: number }[];
  return computeSensitivity(products, sales, new Map(days.map((d) => [d.day, d.n])));
}

/** Resumen corto para el asistente (solo lo que se puede concluir). */
export function sensitivityForChat(list: Sensitivity[]): string {
  const measurable = list.filter((s) => ["careful", "can_raise", "lower_helped", "inconclusive"].includes(s.verdict));
  const lines = measurable.slice(0, 15).map((s) => `- ${s.name} (precio actual ${money(s.current_price)}): ${s.summary}`);
  const notMeasured = list.length - measurable.length;
  return `${lines.join("\n") || "- Ningún producto tuvo un cambio de precio medible todavía."}
${notMeasured > 0 ? `- Otros ${notMeasured} productos no cambiaron de precio o tienen pocos datos: no se puede medir su sensibilidad.` : ""}`;
}
