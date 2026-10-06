import { SERVICE, withDb } from "../db/pool.js";
import { evaluate, graceDays, setServiceStatus } from "../lib/billing.js";
import { reconcileSubscription } from "../lib/billingMp.js";
import { mpEnabled } from "../lib/mercadopago.js";
import { artDateString } from "../lib/time.js";

export interface SweepResult {
  today: string;
  graceDays: number;
  toPastDue: string[];
  suspended: string[];
  recoveredFromMp: number;
  errors: { establishmentId: string; error: string }[];
}

/**
 * Barrido diario de cobranzas (cron 03:00 ART, también manual desde el panel):
 *  1) concilia con Mercado Pago (registra cobros que no llegaron por webhook),
 *  2) pasa a `past_due` los vencidos y 3) suspende a los que superan los días de gracia.
 * Los clientes sin next_due_date (facturación no configurada) no se tocan.
 */
export async function runBillingSweep(today = artDateString()): Promise<SweepResult> {
  const out: SweepResult = { today, graceDays: 0, toPastDue: [], suspended: [], recoveredFromMp: 0, errors: [] };

  // 1) conciliación con Mercado Pago (cada suscripción en su propia transacción: un error no frena al resto)
  if (mpEnabled()) {
    const subs = await withDb(SERVICE, async (c) =>
      (await c.query(`SELECT id, mp_preapproval_id FROM public.establishments WHERE mp_preapproval_id IS NOT NULL AND service_status <> 'cancelled' AND mp_status IN ('pending', 'authorized', 'paused')`)).rows,
    );
    for (const s of subs) {
      try {
        const r = await withDb(SERVICE, (c) => reconcileSubscription(c, s.mp_preapproval_id));
        out.recoveredFromMp += r.recorded;
      } catch (e) {
        out.errors.push({ establishmentId: s.id, error: (e as Error).message });
      }
    }
  }

  // 2) y 3) estados por vencimiento
  await withDb(SERVICE, async (c) => {
    out.graceDays = await graceDays(c);
    const rows = (
      await c.query(
        `SELECT id, service_status, next_due_date::text AS next_due_date FROM public.establishments
          WHERE service_status IN ('trial', 'active', 'past_due') AND next_due_date IS NOT NULL AND is_active FOR UPDATE`,
      )
    ).rows;
    for (const r of rows) {
      const ev = evaluate(r, today, out.graceDays);
      if (ev.status === r.service_status) continue;
      if (ev.status === "suspended") {
        await setServiceStatus(c, r.id, "suspended", `Falta de pago: ${ev.overdueDays} días de atraso (gracia de ${out.graceDays})`, null, { overdue_days: ev.overdueDays, automatic: true });
        out.suspended.push(r.id);
      } else if (ev.status === "past_due") {
        await setServiceStatus(c, r.id, "past_due", `Vencido hace ${ev.overdueDays} días`, null, { overdue_days: ev.overdueDays, days_to_suspension: ev.daysToSuspension, automatic: true });
        out.toPastDue.push(r.id);
      }
    }
  });
  return out;
}
