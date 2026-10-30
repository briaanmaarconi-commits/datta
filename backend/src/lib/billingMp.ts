import type pg from "pg";
import { applyPayment, logEvent } from "./billing.js";
import {
  cancelPreapproval, createPreapproval, getAuthorizedPayment, getPayment, getPreapproval, searchAuthorizedPayments, type AuthorizedPayment,
} from "./mercadopago.js";
import { artDateString, artMidnight } from "./time.js";

const toArtDate = (iso?: string | null) => (iso ? artDateString(new Date(iso)) : null);

/** Sincroniza estado y próximo cobro de la suscripción de un local con lo que dice Mercado Pago. */
export async function syncPreapproval(c: pg.PoolClient, preapprovalId: string): Promise<{ establishmentId: string; status: string } | null> {
  const est = (await c.query(`SELECT id, service_status, next_due_date::text AS due FROM public.establishments WHERE mp_preapproval_id = $1 FOR UPDATE`, [preapprovalId])).rows[0];
  if (!est) return null;
  const pre = await getPreapproval(preapprovalId);
  const next = toArtDate(pre.next_payment_date);
  await c.query(`UPDATE public.establishments SET mp_status = $2 WHERE id = $1`, [est.id, pre.status]);
  // el próximo cobro de MP pasa a ser el vencimiento, salvo que el local ya esté suspendido/cancelado
  if (pre.status === "authorized" && next && !["suspended", "cancelled"].includes(est.service_status)) {
    await c.query(`UPDATE public.establishments SET next_due_date = $2 WHERE id = $1`, [est.id, next]);
  }
  if (est.service_status !== "cancelled") await logEvent(c, est.id, "mp_status", { status: pre.status, next_payment_date: next });
  return { establishmentId: est.id, status: pre.status };
}

/** Registra un cobro autorizado si está aprobado. Idempotente por id de pago de MP. */
export async function recordAuthorizedPayment(c: pg.PoolClient, ap: AuthorizedPayment): Promise<{ recorded: boolean; reason?: string; paymentId?: string }> {
  if (!ap.preapproval_id) return { recorded: false, reason: "sin suscripción" };
  const est = (await c.query(`SELECT id FROM public.establishments WHERE mp_preapproval_id = $1`, [ap.preapproval_id])).rows[0];
  if (!est) return { recorded: false, reason: "suscripción desconocida" };
  const payId = ap.payment?.id ? String(ap.payment.id) : null;
  if (!payId) return { recorded: false, reason: "sin pago asociado" };

  const pay = await getPayment(payId); // se confirma contra la API: el webhook no es prueba de pago
  if (pay.status !== "approved") return { recorded: false, reason: `estado ${pay.status}` };

  const pre = await getPreapproval(ap.preapproval_id).catch(() => null);
  const res = await applyPayment(c, {
    establishmentId: est.id,
    amount: Number(pay.transaction_amount),
    method: "mercadopago",
    paymentDate: toArtDate(pay.date_approved) ?? artDateString(),
    source: "mercadopago",
    mpPaymentId: payId,
    mpStatus: pay.status,
    nextDueDate: toArtDate(pre?.next_payment_date),
  });
  return { recorded: res.inserted, reason: res.inserted ? undefined : "ya registrado", paymentId: res.paymentId };
}

export async function handleAuthorizedPaymentId(c: pg.PoolClient, id: string) {
  return recordAuthorizedPayment(c, await getAuthorizedPayment(id));
}

export class AutoDebitError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Genera el link de débito automático de Mercado Pago para un local (lo usan el superadmin y el admin del local).
 * El primer cobro es en el próximo vencimiento (o fin de la prueba); si ya pasó, hoy.
 */
export async function startAutoDebit(
  c: pg.PoolClient, o: { establishmentId: string; payerEmail: string; amount?: number; backUrl: string; actor: string | null },
): Promise<{ init_point: string | null | undefined; preapproval_id: string; amount: number }> {
  const e = (
    await c.query(
      `SELECT id, name, agreed_price::float AS price, trial_ends_at::text AS trial_ends_at, next_due_date::text AS next_due_date, mp_preapproval_id, mp_status
         FROM public.establishments WHERE id = $1 FOR UPDATE`,
      [o.establishmentId],
    )
  ).rows[0];
  if (!e) throw new AutoDebitError(404, "Cliente inexistente");
  if (e.mp_preapproval_id && ["pending", "authorized"].includes(e.mp_status)) {
    throw new AutoDebitError(409, "Este cliente ya tiene una suscripción en Mercado Pago. Cancelala antes de generar otra.");
  }
  const planPrice = Number((await c.query(`SELECT value FROM public.app_settings WHERE key = 'plan_price'`)).rows[0]?.value ?? 0);
  const amount = o.amount ?? (e.price > 0 ? e.price : planPrice);
  if (!(amount > 0)) throw new AutoDebitError(400, "Primero definí el precio del cliente o del plan (tiene que ser mayor a 0).");

  const today = artDateString();
  const firstCharge = [e.next_due_date, e.trial_ends_at].find((d: string | null) => d && d > today) ?? today;
  const startIso = firstCharge === today ? new Date(Date.now() + 60_000).toISOString() : artMidnight(firstCharge).toISOString();
  const pre = await createPreapproval({
    reason: `Datta – ${e.name}`, externalReference: e.id, payerEmail: o.payerEmail, amount, startDate: startIso, backUrl: o.backUrl,
  });
  await c.query(
    `UPDATE public.establishments SET mp_preapproval_id = $2, mp_payer_email = $3, mp_init_point = $4, mp_status = $5, agreed_price = $6 WHERE id = $1`,
    [e.id, pre.id, o.payerEmail, pre.init_point ?? null, pre.status, amount],
  );
  await logEvent(c, e.id, "mp_link_created", { preapproval_id: pre.id, amount, start: firstCharge }, o.actor);
  return { init_point: pre.init_point, preapproval_id: pre.id, amount };
}

/** Cancela el débito automático de un local en Mercado Pago. */
export async function stopAutoDebit(c: pg.PoolClient, establishmentId: string, actor: string | null) {
  const e = (await c.query(`SELECT mp_preapproval_id FROM public.establishments WHERE id = $1 FOR UPDATE`, [establishmentId])).rows[0];
  if (!e?.mp_preapproval_id) throw new AutoDebitError(404, "El cliente no tiene suscripción en Mercado Pago");
  await cancelPreapproval(e.mp_preapproval_id);
  await c.query(`UPDATE public.establishments SET mp_status = 'cancelled' WHERE id = $1`, [establishmentId]);
  await logEvent(c, establishmentId, "mp_cancelled", {}, actor);
}

/** Red de seguridad: recorre los cobros de la suscripción y registra los que falten. */
export async function reconcileSubscription(c: pg.PoolClient, preapprovalId: string): Promise<{ recorded: number }> {
  await syncPreapproval(c, preapprovalId);
  const found = await searchAuthorizedPayments(preapprovalId);
  let recorded = 0;
  for (const ap of found.results ?? []) {
    if (ap.payment?.status && ap.payment.status !== "approved") continue;
    const r = await recordAuthorizedPayment(c, { ...ap, preapproval_id: ap.preapproval_id ?? preapprovalId });
    if (r.recorded) recorded++;
  }
  return { recorded };
}
