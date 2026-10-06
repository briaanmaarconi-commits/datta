import type pg from "pg";
import { artDateString } from "./time.js";

export type ServiceStatus = "trial" | "active" | "past_due" | "suspended" | "cancelled";
/** Estados en los que el local no puede operar. */
export const BLOCKED_STATUSES: ServiceStatus[] = ["suspended", "cancelled"];
export const DEFAULT_GRACE_DAYS = 25;

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Días enteros desde a hasta b (positivo si b es posterior). */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);

/** Suma meses de calendario conservando el día (31 de enero + 1 mes = 28/29 de febrero). */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export interface BillingFacts {
  service_status: string;
  next_due_date: string | null;
}

export interface Evaluation {
  status: ServiceStatus;
  /** días de atraso sobre next_due_date (0 si no venció) */
  overdueDays: number;
  /** días que faltan para la suspensión automática (solo si está vencido) */
  daysToSuspension: number | null;
}

/**
 * Estado que corresponde HOY según el vencimiento y los días de gracia.
 * - Sin next_due_date la facturación no está configurada: no se toca.
 * - Suspendido/cancelado no se reactivan solos (solo un pago o el superadmin).
 * - Vence el día siguiente a next_due_date; a los `grace` días de atraso se suspende.
 */
export function evaluate(f: BillingFacts, today: string, grace: number): Evaluation {
  const current = f.service_status as ServiceStatus;
  if (BLOCKED_STATUSES.includes(current) || !f.next_due_date) {
    return { status: current, overdueDays: 0, daysToSuspension: null };
  }
  const overdue = Math.max(0, daysBetween(f.next_due_date, today));
  if (overdue === 0) return { status: current === "past_due" ? "active" : current, overdueDays: 0, daysToSuspension: null };
  if (overdue >= grace) return { status: "suspended", overdueDays: overdue, daysToSuspension: 0 };
  return { status: "past_due", overdueDays: overdue, daysToSuspension: grace - overdue };
}

/** Próximo vencimiento tras un pago: sigue el ciclo; si el atraso fue muy grande, reinicia desde hoy. */
export function nextDueAfterPayment(currentDue: string | null, today: string): string {
  const next = addMonths(currentDue ?? today, 1);
  return daysBetween(today, next) <= 0 ? addMonths(today, 1) : next;
}

// ------------------------------------------------------------------ acceso a datos (cliente pg ya abierto)
/** ¿El local puede operar (activo y con servicio no suspendido/cancelado)? */
export async function isServiceable(c: pg.PoolClient, establishmentId: string): Promise<boolean> {
  const r = await c.query(`SELECT public.establishment_serviceable($1) AS ok`, [establishmentId]);
  return !!r.rows[0]?.ok;
}

export async function graceDays(c: pg.PoolClient): Promise<number> {
  const r = await c.query(`SELECT value FROM public.app_settings WHERE key = 'billing_grace_days'`);
  const n = Number(r.rows[0]?.value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GRACE_DAYS;
}

export async function logEvent(c: pg.PoolClient, establishmentId: string, type: string, details: Record<string, unknown> = {}, actor: string | null = null) {
  await c.query(`INSERT INTO public.subscription_events (establishment_id, type, details, actor) VALUES ($1, $2, $3::jsonb, $4)`, [
    establishmentId, type, JSON.stringify(details), actor,
  ]);
}

export async function setServiceStatus(
  c: pg.PoolClient, establishmentId: string, status: ServiceStatus, reason: string | null, actor: string | null = null, extra: Record<string, unknown> = {},
) {
  const suspended = status === "suspended";
  await c.query(
    `UPDATE public.establishments
        SET service_status = $2,
            suspended_at = CASE WHEN $3 THEN COALESCE(suspended_at, now()) ELSE NULL END,
            suspension_reason = CASE WHEN $3 THEN $4 ELSE NULL END
      WHERE id = $1`,
    [establishmentId, status, suspended, reason],
  );
  await logEvent(c, establishmentId, `status_${status}`, { reason, ...extra }, actor);
}

export interface PaymentInput {
  establishmentId: string;
  amount: number;
  method: string;
  paymentDate?: string;
  periodMonth?: number;
  periodYear?: number;
  source: "manual" | "mercadopago";
  mpPaymentId?: string | null;
  mpStatus?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  /** vencimiento que informa Mercado Pago (next_payment_date) si lo hay */
  nextDueDate?: string | null;
}

/**
 * Registra un pago y deja al cliente al día: estado active, suspensión levantada, nuevo vencimiento,
 * movimiento en Caja Datta y evento. Idempotente para pagos de MP (mismo mp_payment_id = no hace nada).
 */
export async function applyPayment(c: pg.PoolClient, p: PaymentInput): Promise<{ inserted: boolean; paymentId?: string; nextDueDate?: string }> {
  const today = artDateString();
  const paymentDate = p.paymentDate ?? today;
  const month = p.periodMonth ?? Number(paymentDate.slice(5, 7));
  const year = p.periodYear ?? Number(paymentDate.slice(0, 4));

  const ins = await c.query(
    `INSERT INTO public.client_payments (establishment_id, amount, payment_method, period_month, period_year, payment_date, notes, created_by, source, mp_payment_id, mp_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT DO NOTHING RETURNING id`,
    [p.establishmentId, p.amount, p.method, month, year, paymentDate, p.notes ?? null, p.createdBy ?? null, p.source, p.mpPaymentId ?? null, p.mpStatus ?? null],
  );
  if (!ins.rows.length) return { inserted: false };
  const paymentId = ins.rows[0].id as string;

  const cat = await c.query(`SELECT id FROM public.datta_finance_categories WHERE name = 'Suscripciones' AND type = 'income' LIMIT 1`);
  if (cat.rows.length) {
    await c.query(
      `INSERT INTO public.datta_transactions (type, amount, description, category_id, establishment_id, date, created_by, client_payment_id)
       VALUES ('income', $1, $2, $3, $4, $5, $6, $7) ON CONFLICT (client_payment_id) DO NOTHING`,
      [p.amount, `Suscripción ${String(month).padStart(2, "0")}/${year}${p.source === "mercadopago" ? " (Mercado Pago)" : ""}`, cat.rows[0].id, p.establishmentId, paymentDate, p.createdBy ?? null, paymentId],
    );
  }

  const est = (await c.query(`SELECT next_due_date::text AS due FROM public.establishments WHERE id = $1 FOR UPDATE`, [p.establishmentId])).rows[0];
  const nextDue = p.nextDueDate && daysBetween(today, p.nextDueDate) > 0 ? p.nextDueDate : nextDueAfterPayment(est?.due ?? null, today);
  await c.query(
    `UPDATE public.establishments SET service_status = 'active', suspended_at = NULL, suspension_reason = NULL, next_due_date = $2, trial_ends_at = NULL WHERE id = $1`,
    [p.establishmentId, nextDue],
  );
  await logEvent(c, p.establishmentId, "payment", { amount: p.amount, source: p.source, mp_payment_id: p.mpPaymentId ?? null, period: `${month}/${year}`, next_due_date: nextDue }, p.createdBy ?? null);
  return { inserted: true, paymentId, nextDueDate: nextDue };
}
