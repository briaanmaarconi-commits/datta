import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend';

function money(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
}

function buildHtml(p: {
  name: string;
  date: string;
  sales: number;
  orders: number;
  avgTicket: number;
  topProduct?: { name: string; units: number };
  cashBalance: number;
  insights: any[];
  recommendations: any[];
}) {
  const severityColor = (s: string) =>
    s === 'critical' ? '#ef4444' : s === 'warning' ? '#f59e0b' : '#3b82f6';

  const list = (arr: any[]) =>
    arr.length === 0
      ? '<p style="color:#64748b;font-size:13px;margin:8px 0">Sin novedades.</p>'
      : arr.slice(0, 3).map((i) => `
          <div style="border-left:3px solid ${severityColor(i.severity)};padding:8px 12px;margin:8px 0;background:#f8fafc;border-radius:4px">
            <div style="font-weight:600;font-size:14px;color:#0f172a">${i.title}</div>
            <div style="font-size:13px;color:#475569;margin-top:2px">${i.body ?? ''}</div>
          </div>`).join('');

  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">
    <div style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:24px;border-radius:8px 8px 0 0">
      <div style="font-size:13px;opacity:0.9">${p.date}</div>
      <h1 style="margin:4px 0 0;font-size:22px">Reporte diario · ${p.name}</h1>
    </div>
    <div style="padding:20px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr>
          <td style="padding:12px;background:#f8fafc;border-radius:6px;width:50%">
            <div style="font-size:12px;color:#64748b">Ventas</div>
            <div style="font-size:20px;font-weight:700;color:#0f172a">${money(p.sales)}</div>
          </td>
          <td style="width:8px"></td>
          <td style="padding:12px;background:#f8fafc;border-radius:6px;width:50%">
            <div style="font-size:12px;color:#64748b">Pedidos</div>
            <div style="font-size:20px;font-weight:700;color:#0f172a">${p.orders}</div>
          </td>
        </tr>
        <tr><td style="height:8px"></td></tr>
        <tr>
          <td style="padding:12px;background:#f8fafc;border-radius:6px">
            <div style="font-size:12px;color:#64748b">Ticket promedio</div>
            <div style="font-size:20px;font-weight:700;color:#0f172a">${money(p.avgTicket)}</div>
          </td>
          <td></td>
          <td style="padding:12px;background:#f8fafc;border-radius:6px">
            <div style="font-size:12px;color:#64748b">Balance de caja</div>
            <div style="font-size:20px;font-weight:700;color:${p.cashBalance >= 0 ? '#16a34a' : '#ef4444'}">${money(p.cashBalance)}</div>
          </td>
        </tr>
      </table>

      ${p.topProduct ? `
        <div style="padding:12px;background:#fef3c7;border-radius:6px;margin-bottom:16px">
          <div style="font-size:12px;color:#92400e">Top del día</div>
          <div style="font-size:15px;font-weight:600;color:#78350f">${p.topProduct.name} · ${p.topProduct.units} unidades</div>
        </div>
      ` : ''}

      <h2 style="font-size:15px;color:#0f172a;margin:20px 0 4px">Alertas relevantes</h2>
      ${list(p.insights)}

      <h2 style="font-size:15px;color:#0f172a;margin:20px 0 4px">Recomendaciones IA</h2>
      ${list(p.recommendations)}

      <p style="font-size:11px;color:#94a3b8;margin-top:24px;text-align:center">
        Datta · Análisis automático generado a las ${new Date().toLocaleTimeString('es-AR')}
      </p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const targetEstablishmentId: string | undefined = body.establishment_id;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // fetch list of establishments with email enabled
    let query = supabase
      .from('ai_insight_preferences')
      .select('establishment_id, email_recipients, establishments(name)')
      .eq('email_enabled', true);
    if (targetEstablishmentId) query = query.eq('establishment_id', targetEstablishmentId);
    const { data: targets, error: tErr } = await query;
    if (tErr) throw tErr;

    if (!targets || targets.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no targets' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Resend connector not linked', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const today = new Date();
    const yStart = new Date(today); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0,0,0,0);
    const yEnd = new Date(today); yEnd.setHours(0,0,0,0);
    const dateLabel = yStart.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

    let sent = 0;
    const errors: any[] = [];

    for (const t of targets as any[]) {
      const recipients: string[] = Array.isArray(t.email_recipients) ? t.email_recipients : [];
      if (recipients.length === 0) continue;

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total')
        .eq('establishment_id', t.establishment_id)
        .eq('status', 'closed')
        .gte('created_at', yStart.toISOString())
        .lt('created_at', yEnd.toISOString());

      const sales = (orders ?? []).reduce((s, o: any) => s + Number(o.total ?? 0), 0);
      const ordersCount = orders?.length ?? 0;
      const avgTicket = ordersCount > 0 ? sales / ordersCount : 0;

      const { data: tx } = await supabase
        .from('finance_transactions')
        .select('type, amount')
        .eq('establishment_id', t.establishment_id)
        .gte('date', yStart.toISOString().slice(0,10))
        .lt('date', yEnd.toISOString().slice(0,10));
      const cashBalance = (tx ?? []).reduce((s, r: any) =>
        s + (r.type === 'income' ? Number(r.amount) : -Number(r.amount)), 0);

      const orderIds = (orders ?? []).map((o: any) => o.id);
      let topProduct: { name: string; units: number } | undefined;
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from('order_items')
          .select('quantity, products(name)')
          .in('order_id', orderIds);
        const tally = new Map<string, number>();
        (items ?? []).forEach((i: any) => {
          const n = i.products?.name;
          if (!n) return;
          tally.set(n, (tally.get(n) ?? 0) + Number(i.quantity ?? 0));
        });
        const top = Array.from(tally.entries()).sort((a,b) => b[1]-a[1])[0];
        if (top) topProduct = { name: top[0], units: top[1] };
      }

      const { data: insights } = await supabase
        .from('ai_insights')
        .select('title, body, severity, kind')
        .eq('establishment_id', t.establishment_id)
        .gte('created_at', yStart.toISOString())
        .order('severity', { ascending: false })
        .limit(20);

      const alerts = (insights ?? []).filter((i: any) => i.kind === 'alert');
      const recos = (insights ?? []).filter((i: any) => i.kind === 'recommendation');

      const html = buildHtml({
        name: t.establishments?.name ?? 'Tu negocio',
        date: dateLabel,
        sales, orders: ordersCount, avgTicket, cashBalance, topProduct,
        insights: alerts,
        recommendations: recos,
      });

      const res = await fetch(`${GATEWAY_URL}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': RESEND_API_KEY,
        },
        body: JSON.stringify({
          from: 'Datta <onboarding@resend.dev>',
          to: recipients,
          subject: `Reporte diario · ${dateLabel}`,
          html,
        }),
      });

      if (!res.ok) {
        errors.push({ establishment_id: t.establishment_id, status: res.status, body: await res.text() });
      } else {
        sent++;
      }
    }

    return new Response(JSON.stringify({ sent, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('daily-report-email error', e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
