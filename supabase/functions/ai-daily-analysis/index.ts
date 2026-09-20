// Daily AI analysis: for each establishment, aggregate yesterday vs the prior period,
// detect anomalies, ask Lovable AI for short recommendations, and write rows into ai_insights.
//
// Trigger: pg_cron once a day (~04:00 ART = 07:00 UTC) OR manually with header x-establishment-id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-establishment-id",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface Insight {
  kind: "alert" | "recommendation";
  severity: "info" | "warning" | "critical";
  category: "sales" | "costs" | "product" | "stock" | "operations" | "health" | "other";
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}

function pctChange(current: number, prev: number) {
  if (!prev) return current > 0 ? 100 : 0;
  return ((current - prev) / prev) * 100;
}

function ars(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

async function analyzeEstablishment(supabase: ReturnType<typeof createClient>, establishmentId: string) {
  // Ensure preferences exist
  const { data: prefsRow } = await supabase.rpc("ensure_insight_preferences", { _establishment_id: establishmentId });
  const prefs = (prefsRow as any) || {};
  if (prefs?.enabled === false) return { skipped: true };

  const silenced: string[] = prefs?.silenced_categories || [];
  const thresholds = prefs?.thresholds || { sales_drop_pct: 15, cost_rise_pct: 15, ticket_drop_pct: 10 };

  const now = new Date();
  const yesterdayEnd = new Date(now); yesterdayEnd.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = new Date(yesterdayEnd); yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  const weekAgoStart = new Date(yesterdayStart); weekAgoStart.setUTCDate(weekAgoStart.getUTCDate() - 7);
  const weekAgoEnd = new Date(yesterdayEnd); weekAgoEnd.setUTCDate(weekAgoEnd.getUTCDate() - 7);

  // Yesterday's closed orders
  const { data: yOrders } = await supabase
    .from("orders")
    .select("id,total,status,created_at")
    .eq("establishment_id", establishmentId)
    .eq("status", "closed")
    .gte("created_at", yesterdayStart.toISOString())
    .lt("created_at", yesterdayEnd.toISOString());

  // Same weekday a week ago
  const { data: pOrders } = await supabase
    .from("orders")
    .select("id,total")
    .eq("establishment_id", establishmentId)
    .eq("status", "closed")
    .gte("created_at", weekAgoStart.toISOString())
    .lt("created_at", weekAgoEnd.toISOString());

  const ySales = (yOrders ?? []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const pSales = (pOrders ?? []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const yCount = yOrders?.length ?? 0;
  const pCount = pOrders?.length ?? 0;
  const yTicket = yCount ? ySales / yCount : 0;
  const pTicket = pCount ? pSales / pCount : 0;

  const insights: Insight[] = [];

  // Sales drop / rise
  if (!silenced.includes("sales") && pSales > 0) {
    const delta = pctChange(ySales, pSales);
    if (delta <= -Number(thresholds.sales_drop_pct ?? 15)) {
      insights.push({
        kind: "alert",
        severity: Math.abs(delta) >= 30 ? "critical" : "warning",
        category: "sales",
        title: `Caída de ventas ${delta.toFixed(0)}%`,
        body: `Ayer facturaste ${ars(ySales)} vs ${ars(pSales)} el mismo día de la semana pasada.`,
        payload: { ySales, pSales, delta },
      });
    } else if (delta >= 20) {
      insights.push({
        kind: "recommendation",
        severity: "info",
        category: "sales",
        title: `Ventas en alza +${delta.toFixed(0)}%`,
        body: `Ayer vendiste ${ars(ySales)} (${delta.toFixed(0)}% más que la semana pasada). Buen momento para reforzar stock de los productos más pedidos.`,
        payload: { ySales, pSales, delta },
      });
    }
  }

  // Ticket promedio
  if (!silenced.includes("sales") && pTicket > 0) {
    const delta = pctChange(yTicket, pTicket);
    if (delta <= -Number(thresholds.ticket_drop_pct ?? 10)) {
      insights.push({
        kind: "alert",
        severity: "warning",
        category: "sales",
        title: `Ticket promedio bajó ${delta.toFixed(0)}%`,
        body: `Pasó de ${ars(pTicket)} a ${ars(yTicket)}. Revisá sugerencias de venta cruzada o ajustes de menú.`,
        payload: { yTicket, pTicket, delta },
      });
    }
  }

  // Gastos del día (finance_transactions)
  if (!silenced.includes("costs")) {
    const { data: yExp } = await supabase
      .from("finance_transactions")
      .select("amount")
      .eq("establishment_id", establishmentId)
      .eq("type", "expense")
      .gte("date", yesterdayStart.toISOString().slice(0, 10))
      .lt("date", yesterdayEnd.toISOString().slice(0, 10));
    const { data: pExp } = await supabase
      .from("finance_transactions")
      .select("amount")
      .eq("establishment_id", establishmentId)
      .eq("type", "expense")
      .gte("date", weekAgoStart.toISOString().slice(0, 10))
      .lt("date", weekAgoEnd.toISOString().slice(0, 10));
    const yE = (yExp ?? []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const pE = (pExp ?? []).reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    if (pE > 0) {
      const delta = pctChange(yE, pE);
      if (delta >= Number(thresholds.cost_rise_pct ?? 15)) {
        insights.push({
          kind: "alert",
          severity: delta >= 30 ? "critical" : "warning",
          category: "costs",
          title: `Gastos +${delta.toFixed(0)}% vs semana pasada`,
          body: `Ayer registraste ${ars(yE)} en gastos vs ${ars(pE)} el mismo día anterior. Revisá si hubo cargas duplicadas o aumentos de proveedores.`,
          payload: { yE, pE, delta },
        });
      }
    }
  }

  // Producto top y rentabilidad
  if (!silenced.includes("product") && yOrders && yOrders.length > 0) {
    const orderIds = yOrders.map((o: any) => o.id);
    const { data: items } = await supabase
      .from("order_items")
      .select("product_id, quantity, unit_price, cost_snapshot, products(name)")
      .in("order_id", orderIds);
    const byProduct: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
    for (const it of items ?? []) {
      const id = (it as any).product_id;
      if (!id) continue;
      const r = (byProduct[id] ||= {
        name: (it as any).products?.name ?? "Producto",
        qty: 0,
        revenue: 0,
        cost: 0,
      });
      const q = Number((it as any).quantity || 0);
      r.qty += q;
      r.revenue += q * Number((it as any).unit_price || 0);
      r.cost += q * Number((it as any).cost_snapshot || 0);
    }
    const ranked = Object.values(byProduct).sort((a, b) => b.qty - a.qty);
    const top = ranked[0];
    if (top) {
      insights.push({
        kind: "recommendation",
        severity: "info",
        category: "product",
        title: `Top de ayer: ${top.name}`,
        body: `${top.qty} unidades, ${ars(top.revenue)} de ingresos${top.cost ? `, margen ${(((top.revenue - top.cost) / top.revenue) * 100).toFixed(0)}%` : ""}. Asegurá stock y considerá destacarlo.`,
        payload: top,
      });
    }
    // Low margin product
    const lowMargin = ranked.find((p) => p.revenue > 0 && p.cost > 0 && (p.revenue - p.cost) / p.revenue < 0.2);
    if (lowMargin) {
      insights.push({
        kind: "alert",
        severity: "warning",
        category: "product",
        title: `Baja rentabilidad: ${lowMargin.name}`,
        body: `Margen ${(((lowMargin.revenue - lowMargin.cost) / lowMargin.revenue) * 100).toFixed(0)}%. Revisá precio o costo del insumo.`,
        payload: lowMargin,
      });
    }
  }

  // Stock crítico
  if (!silenced.includes("stock")) {
    const { data: lowStock } = await supabase
      .from("ingredients")
      .select("name, current_stock, min_stock, unit")
      .eq("establishment_id", establishmentId)
      .not("min_stock", "is", null)
      .limit(50);
    const critical = (lowStock ?? []).filter(
      (i: any) => Number(i.min_stock || 0) > 0 && Number(i.current_stock || 0) <= Number(i.min_stock),
    );
    if (critical.length > 0) {
      insights.push({
        kind: "alert",
        severity: critical.length > 5 ? "critical" : "warning",
        category: "stock",
        title: `${critical.length} insumo${critical.length === 1 ? "" : "s"} bajo mínimo`,
        body: critical
          .slice(0, 5)
          .map((i: any) => `• ${i.name}: ${i.current_stock} ${i.unit ?? ""} (mín ${i.min_stock})`)
          .join("\n"),
        payload: { count: critical.length },
      });
    }
  }

  // Ausencia de cierre de caja
  if (!silenced.includes("operations")) {
    const { data: shifts } = await supabase
      .from("shift_controls")
      .select("id, closed_at, opened_at")
      .eq("establishment_id", establishmentId)
      .gte("opened_at", yesterdayStart.toISOString())
      .lt("opened_at", yesterdayEnd.toISOString());
    const openShifts = (shifts ?? []).filter((s: any) => !s.closed_at);
    if (openShifts.length > 0) {
      insights.push({
        kind: "alert",
        severity: "warning",
        category: "operations",
        title: `${openShifts.length} turno de caja sin cerrar`,
        body: `Quedaron turnos abiertos de ayer. Cerralos para no afectar las métricas del día.`,
        payload: { openShifts: openShifts.length },
      });
    } else if ((shifts ?? []).length === 0 && yCount > 0) {
      insights.push({
        kind: "alert",
        severity: "info",
        category: "operations",
        title: "No se registró apertura de caja ayer",
        body: "Hubo pedidos pero no se abrió turno. Revisá el flujo de cierre diario.",
      });
    }
  }

  // Health summary via Lovable AI
  if (!silenced.includes("health") && (ySales > 0 || yCount > 0)) {
    try {
      const summary = {
        sales_yesterday: Math.round(ySales),
        sales_prev: Math.round(pSales),
        orders_yesterday: yCount,
        orders_prev: pCount,
        avg_ticket_yesterday: Math.round(yTicket),
        avg_ticket_prev: Math.round(pTicket),
      };
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Sos un consultor de restaurantes en Argentina. Respondé en español rioplatense, máximo 2 oraciones, claro y accionable. No uses markdown ni listas.",
            },
            {
              role: "user",
              content: `Datos de ayer vs misma fecha de la semana pasada: ${JSON.stringify(summary)}. Dame una recomendación concreta para el dueño.`,
            },
          ],
          max_tokens: 200,
        }),
      });
      if (aiRes.ok) {
        const j = await aiRes.json();
        const text = j?.choices?.[0]?.message?.content?.trim();
        if (text) {
          insights.push({
            kind: "recommendation",
            severity: "info",
            category: "health",
            title: "Sugerencia de la IA",
            body: text,
            payload: summary,
          });
        }
      }
    } catch (e) {
      console.error("AI recommendation failed", e);
    }
  }

  // Persist insights
  if (insights.length > 0) {
    const rows = insights.map((i) => ({ ...i, establishment_id: establishmentId, payload: i.payload ?? {} }));
    const { error } = await supabase.from("ai_insights").insert(rows);
    if (error) console.error("insert insights", error);
  }
  return { generated: insights.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const explicit = req.headers.get("x-establishment-id");
    let establishments: string[] = [];
    if (explicit) {
      establishments = [explicit];
    } else {
      const { data } = await supabase.from("establishments").select("id");
      establishments = (data ?? []).map((e: any) => e.id);
    }

    const results: Record<string, unknown> = {};
    for (const id of establishments) {
      try {
        results[id] = await analyzeEstablishment(supabase, id);
      } catch (e) {
        console.error("analyze failed", id, e);
        results[id] = { error: String(e) };
      }
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
