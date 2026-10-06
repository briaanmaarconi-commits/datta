// Análisis diario con IA: por establecimiento compara ayer vs el mismo día de la semana pasada, detecta
// anomalías y escribe filas en ai_insights. Port de la edge function ai-daily-analysis (los días se
// calculan en horario de Argentina, no en UTC).
import { ai, aiEnabled, textOf } from "../ai.js";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { artDayRange, addDays } from "../lib/time.js";

interface Insight {
  kind: "alert" | "recommendation";
  severity: "info" | "warning" | "critical";
  category: "sales" | "costs" | "product" | "stock" | "operations" | "health" | "other";
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

const pctChange = (cur: number, prev: number) => (!prev ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100);
const ars = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const sum = (rows: { [k: string]: unknown }[], key: string) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);

export async function analyzeEstablishment(establishmentId: string): Promise<Record<string, unknown>> {
  return withDb(SERVICE, async (c) => {
    const q = async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows;

    const prefs = (await q(`SELECT to_jsonb(p) AS j FROM public.ensure_insight_preferences($1) p`, [establishmentId]))[0]?.j ?? {};
    if (prefs.enabled === false) return { skipped: true };
    const silenced: string[] = prefs.silenced_categories ?? [];
    const th = prefs.thresholds ?? { sales_drop_pct: 15, cost_rise_pct: 15, ticket_drop_pct: 10 };

    const y = artDayRange(1);
    const weekAgoStart = new Date(y.start.getTime() - 7 * 86_400_000);
    const weekAgoEnd = new Date(y.end.getTime() - 7 * 86_400_000);
    const weekAgoDate = addDays(y.date, -7);
    const weekAgoNext = addDays(y.nextDate, -7);

    const orderSql = `SELECT id, total FROM public.orders WHERE establishment_id = $1 AND status = 'closed' AND created_at >= $2 AND created_at < $3`;
    const yOrders = await q(orderSql, [establishmentId, y.start, y.end]);
    const pOrders = await q(orderSql, [establishmentId, weekAgoStart, weekAgoEnd]);

    const ySales = sum(yOrders, "total");
    const pSales = sum(pOrders, "total");
    const yCount = yOrders.length;
    const pCount = pOrders.length;
    const yTicket = yCount ? ySales / yCount : 0;
    const pTicket = pCount ? pSales / pCount : 0;
    const insights: Insight[] = [];

    if (!silenced.includes("sales") && pSales > 0) {
      const delta = pctChange(ySales, pSales);
      if (delta <= -Number(th.sales_drop_pct ?? 15)) {
        insights.push({
          kind: "alert", severity: Math.abs(delta) >= 30 ? "critical" : "warning", category: "sales",
          title: `Caída de ventas ${delta.toFixed(0)}%`,
          body: `Ayer facturaste ${ars(ySales)} vs ${ars(pSales)} el mismo día de la semana pasada.`,
          payload: { ySales, pSales, delta },
        });
      } else if (delta >= 20) {
        insights.push({
          kind: "recommendation", severity: "info", category: "sales",
          title: `Ventas en alza +${delta.toFixed(0)}%`,
          body: `Ayer vendiste ${ars(ySales)} (${delta.toFixed(0)}% más que la semana pasada). Buen momento para reforzar stock de los productos más pedidos.`,
          payload: { ySales, pSales, delta },
        });
      }
    }

    if (!silenced.includes("sales") && pTicket > 0) {
      const delta = pctChange(yTicket, pTicket);
      if (delta <= -Number(th.ticket_drop_pct ?? 10)) {
        insights.push({
          kind: "alert", severity: "warning", category: "sales",
          title: `Ticket promedio bajó ${delta.toFixed(0)}%`,
          body: `Pasó de ${ars(pTicket)} a ${ars(yTicket)}. Revisá sugerencias de venta cruzada o ajustes de menú.`,
          payload: { yTicket, pTicket, delta },
        });
      }
    }

    if (!silenced.includes("costs")) {
      const expSql = `SELECT coalesce(sum(amount), 0)::float AS s FROM public.finance_transactions WHERE establishment_id = $1 AND type = 'expense' AND date >= $2 AND date < $3`;
      const yE = Number((await q(expSql, [establishmentId, y.date, y.nextDate]))[0].s);
      const pE = Number((await q(expSql, [establishmentId, weekAgoDate, weekAgoNext]))[0].s);
      if (pE > 0) {
        const delta = pctChange(yE, pE);
        if (delta >= Number(th.cost_rise_pct ?? 15)) {
          insights.push({
            kind: "alert", severity: delta >= 30 ? "critical" : "warning", category: "costs",
            title: `Gastos +${delta.toFixed(0)}% vs semana pasada`,
            body: `Ayer registraste ${ars(yE)} en gastos vs ${ars(pE)} el mismo día anterior. Revisá si hubo cargas duplicadas o aumentos de proveedores.`,
            payload: { yE, pE, delta },
          });
        }
      }
    }

    if (!silenced.includes("product") && yOrders.length > 0) {
      const items = await q(
        `SELECT oi.product_id, oi.quantity, oi.unit_price, oi.cost_snapshot, p.name
           FROM public.order_items oi LEFT JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = ANY($1)`,
        [yOrders.map((o) => o.id)],
      );
      const byProduct: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
      for (const it of items) {
        if (!it.product_id) continue;
        const r = (byProduct[it.product_id] ||= { name: it.name ?? "Producto", qty: 0, revenue: 0, cost: 0 });
        const qty = Number(it.quantity || 0);
        r.qty += qty;
        r.revenue += qty * Number(it.unit_price || 0);
        r.cost += qty * Number(it.cost_snapshot || 0);
      }
      const ranked = Object.values(byProduct).sort((a, b) => b.qty - a.qty);
      const top = ranked[0];
      if (top) {
        insights.push({
          kind: "recommendation", severity: "info", category: "product",
          title: `Top de ayer: ${top.name}`,
          body: `${top.qty} unidades, ${ars(top.revenue)} de ingresos${top.cost ? `, margen ${(((top.revenue - top.cost) / top.revenue) * 100).toFixed(0)}%` : ""}. Asegurá stock y considerá destacarlo.`,
          payload: top,
        });
      }
      const low = ranked.find((p) => p.revenue > 0 && p.cost > 0 && (p.revenue - p.cost) / p.revenue < 0.2);
      if (low) {
        insights.push({
          kind: "alert", severity: "warning", category: "product",
          title: `Baja rentabilidad: ${low.name}`,
          body: `Margen ${(((low.revenue - low.cost) / low.revenue) * 100).toFixed(0)}%. Revisá precio o costo del insumo.`,
          payload: low,
        });
      }
    }

    if (!silenced.includes("stock")) {
      const ing = await q(
        `SELECT name, current_stock, min_stock, unit FROM public.ingredients WHERE establishment_id = $1 AND min_stock IS NOT NULL LIMIT 50`,
        [establishmentId],
      );
      const critical = ing.filter((i) => Number(i.min_stock || 0) > 0 && Number(i.current_stock || 0) <= Number(i.min_stock));
      if (critical.length > 0) {
        insights.push({
          kind: "alert", severity: critical.length > 5 ? "critical" : "warning", category: "stock",
          title: `${critical.length} insumo${critical.length === 1 ? "" : "s"} bajo mínimo`,
          body: critical.slice(0, 5).map((i) => `• ${i.name}: ${i.current_stock} ${i.unit ?? ""} (mín ${i.min_stock})`).join("\n"),
          payload: { count: critical.length },
        });
      }
    }

    if (!silenced.includes("operations")) {
      const shifts = await q(
        `SELECT id, closed_at FROM public.shift_controls WHERE establishment_id = $1 AND opened_at >= $2 AND opened_at < $3`,
        [establishmentId, y.start, y.end],
      );
      const open = shifts.filter((s) => !s.closed_at);
      if (open.length > 0) {
        insights.push({
          kind: "alert", severity: "warning", category: "operations",
          title: `${open.length} turno de caja sin cerrar`,
          body: "Quedaron turnos abiertos de ayer. Cerralos para no afectar las métricas del día.",
          payload: { openShifts: open.length },
        });
      } else if (shifts.length === 0 && yCount > 0) {
        insights.push({
          kind: "alert", severity: "info", category: "operations",
          title: "No se registró apertura de caja ayer",
          body: "Hubo pedidos pero no se abrió turno. Revisá el flujo de cierre diario.",
        });
      }
    }

    if (!silenced.includes("health") && (ySales > 0 || yCount > 0) && aiEnabled()) {
      try {
        const summary = {
          sales_yesterday: Math.round(ySales), sales_prev: Math.round(pSales),
          orders_yesterday: yCount, orders_prev: pCount,
          avg_ticket_yesterday: Math.round(yTicket), avg_ticket_prev: Math.round(pTicket),
        };
        const res = await ai().messages.create({
          model: env.AI_MODEL_ANALYSIS,
          max_tokens: 200,
          system: "Sos un consultor de restaurantes en Argentina. Respondé en español rioplatense, máximo 2 oraciones, claro y accionable. No uses markdown ni listas.",
          messages: [{ role: "user", content: `Datos de ayer vs misma fecha de la semana pasada: ${JSON.stringify(summary)}. Dame una recomendación concreta para el dueño.` }],
        });
        const text = textOf(res);
        if (text) insights.push({ kind: "recommendation", severity: "info", category: "health", title: "Sugerencia de la IA", body: text, payload: summary });
      } catch (e) {
        console.error("AI recommendation failed", e);
      }
    }

    for (const i of insights) {
      await c.query(
        `INSERT INTO public.ai_insights (establishment_id, kind, severity, category, title, body, payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [establishmentId, i.kind, i.severity, i.category, i.title, i.body, JSON.stringify(i.payload ?? {})],
      );
    }
    return { generated: insights.length };
  });
}

export async function runDailyAnalysis(onlyEstablishment?: string) {
  const ids = onlyEstablishment
    ? [onlyEstablishment]
    : (await withDb(SERVICE, (c) => c.query(`SELECT id FROM public.establishments`))).rows.map((r) => r.id as string);
  const results: Record<string, unknown> = {};
  for (const id of ids) {
    try {
      results[id] = await analyzeEstablishment(id);
    } catch (e) {
      console.error("analyze failed", id, e);
      results[id] = { error: String(e) };
    }
  }
  return results;
}
