// Reporte diario por email (Resend directo). Port de daily-report-email, con las correcciones:
// usa las columnas reales de ai_insight_preferences (daily_report_enabled / daily_report_emails / daily_report_hour),
// escapa el HTML y calcula el día en horario de Argentina.
import { Resend } from "resend";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { artDayRange } from "../lib/time.js";

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

interface ReportData {
  name: string;
  date: string;
  sales: number;
  orders: number;
  avgTicket: number;
  topProduct?: { name: string; units: number };
  cashBalance: number;
  insights: { title: string; body: string | null; severity: string }[];
  recommendations: { title: string; body: string | null; severity: string }[];
}

function buildHtml(p: ReportData): string {
  const color = (s: string) => (s === "critical" ? "#ef4444" : s === "warning" ? "#f59e0b" : "#3b82f6");
  const list = (arr: ReportData["insights"]) =>
    arr.length === 0
      ? '<p style="color:#64748b;font-size:13px;margin:8px 0">Sin novedades.</p>'
      : arr.slice(0, 3).map((i) => `
          <div style="border-left:3px solid ${color(i.severity)};padding:8px 12px;margin:8px 0;background:#f8fafc;border-radius:4px">
            <div style="font-weight:600;font-size:14px;color:#0f172a">${esc(i.title)}</div>
            <div style="font-size:13px;color:#475569;margin-top:2px">${esc(i.body ?? "")}</div>
          </div>`).join("");

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
    <div style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:24px;border-radius:8px 8px 0 0">
      <div style="font-size:13px;opacity:0.9">${esc(p.date)}</div>
      <h1 style="margin:4px 0 0;font-size:22px">Reporte diario · ${esc(p.name)}</h1>
    </div>
    <div style="padding:20px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr>
          <td style="padding:12px;background:#f8fafc;border-radius:6px;width:50%"><div style="font-size:12px;color:#64748b">Ventas</div><div style="font-size:20px;font-weight:700;color:#0f172a">${money(p.sales)}</div></td>
          <td style="width:8px"></td>
          <td style="padding:12px;background:#f8fafc;border-radius:6px;width:50%"><div style="font-size:12px;color:#64748b">Pedidos</div><div style="font-size:20px;font-weight:700;color:#0f172a">${p.orders}</div></td>
        </tr>
        <tr><td style="height:8px"></td></tr>
        <tr>
          <td style="padding:12px;background:#f8fafc;border-radius:6px"><div style="font-size:12px;color:#64748b">Ticket promedio</div><div style="font-size:20px;font-weight:700;color:#0f172a">${money(p.avgTicket)}</div></td>
          <td></td>
          <td style="padding:12px;background:#f8fafc;border-radius:6px"><div style="font-size:12px;color:#64748b">Balance de caja</div><div style="font-size:20px;font-weight:700;color:${p.cashBalance >= 0 ? "#16a34a" : "#ef4444"}">${money(p.cashBalance)}</div></td>
        </tr>
      </table>
      ${p.topProduct ? `<div style="padding:12px;background:#fef3c7;border-radius:6px;margin-bottom:16px"><div style="font-size:12px;color:#92400e">Top del día</div><div style="font-size:15px;font-weight:600;color:#78350f">${esc(p.topProduct.name)} · ${p.topProduct.units} unidades</div></div>` : ""}
      <h2 style="font-size:15px;color:#0f172a;margin:20px 0 4px">Alertas relevantes</h2>
      ${list(p.insights)}
      <h2 style="font-size:15px;color:#0f172a;margin:20px 0 4px">Recomendaciones IA</h2>
      ${list(p.recommendations)}
      <p style="font-size:11px;color:#94a3b8;margin-top:24px;text-align:center">Datta · Análisis automático generado a las ${esc(new Date().toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }))}</p>
    </div>
  </div>`;
}

interface Options {
  /** Solo ese establecimiento (envío manual); si falta, todos los que tengan el reporte activo. */
  establishmentId?: string;
  /** Solo los que tengan configurada esta hora (ART): lo usa el cron horario. */
  hour?: number;
}

export async function runDailyReports(opts: Options = {}) {
  if (!env.RESEND_API_KEY.trim()) return { sent: 0, errors: [], reason: "RESEND_API_KEY no configurada" };
  const resend = new Resend(env.RESEND_API_KEY);
  const y = artDayRange(1);
  const dateLabel = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${y.date}T12:00:00Z`),
  );

  return withDb(SERVICE, async (c) => {
    const q = async (sql: string, p: unknown[]) => (await c.query(sql, p)).rows;
    const targets = await q(
      `SELECT p.establishment_id, p.daily_report_emails, e.name
         FROM public.ai_insight_preferences p JOIN public.establishments e ON e.id = p.establishment_id
        WHERE p.daily_report_enabled = true
          AND ($1::uuid IS NULL OR p.establishment_id = $1)
          AND ($2::int IS NULL OR p.daily_report_hour = $2)`,
      [opts.establishmentId ?? null, opts.hour ?? null],
    );
    if (!targets.length) return { sent: 0, errors: [], reason: "sin destinatarios" };

    let sent = 0;
    const errors: unknown[] = [];
    for (const t of targets) {
      const recipients: string[] = Array.isArray(t.daily_report_emails) ? t.daily_report_emails.filter(Boolean) : [];
      if (!recipients.length) continue;

      const orders = await q(
        `SELECT id, total FROM public.orders WHERE establishment_id = $1 AND status = 'closed' AND created_at >= $2 AND created_at < $3`,
        [t.establishment_id, y.start, y.end],
      );
      const sales = orders.reduce((s, o) => s + Number(o.total ?? 0), 0);
      const avgTicket = orders.length ? sales / orders.length : 0;

      const tx = await q(`SELECT type, amount FROM public.finance_transactions WHERE establishment_id = $1 AND date >= $2 AND date < $3`, [t.establishment_id, y.date, y.nextDate]);
      const cashBalance = tx.reduce((s, r) => s + (r.type === "income" ? Number(r.amount) : -Number(r.amount)), 0);

      let topProduct: ReportData["topProduct"];
      if (orders.length) {
        const items = await q(
          `SELECT oi.quantity, p.name FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id WHERE oi.order_id = ANY($1)`,
          [orders.map((o) => o.id)],
        );
        const tally = new Map<string, number>();
        for (const i of items) tally.set(i.name, (tally.get(i.name) ?? 0) + Number(i.quantity ?? 0));
        const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) topProduct = { name: top[0], units: top[1] };
      }

      const insights = await q(
        `SELECT title, body, severity, kind FROM public.ai_insights WHERE establishment_id = $1 AND created_at >= $2
          ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 20`,
        [t.establishment_id, y.start],
      );

      const html = buildHtml({
        name: t.name ?? "Tu negocio", date: dateLabel, sales, orders: orders.length, avgTicket, cashBalance, topProduct,
        insights: insights.filter((i) => i.kind === "alert"),
        recommendations: insights.filter((i) => i.kind === "recommendation"),
      });

      const { error } = await resend.emails.send({ from: env.REPORT_FROM_EMAIL, to: recipients, subject: `Reporte diario · ${dateLabel}`, html });
      if (error) errors.push({ establishment_id: t.establishment_id, error });
      else sent++;
    }
    return { sent, errors };
  });
}
