import type pg from "pg";
import { applyPayment, logEvent } from "./billing.js";
import { getAuthorizedPayment, getPayment, getPreapproval, searchAuthorizedPayments, type AuthorizedPayment } from "./mercadopago.js";
import { artDateString } from "./time.js";

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
