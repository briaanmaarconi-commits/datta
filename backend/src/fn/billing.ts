import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { runBillingSweep } from "../jobs/billingSweep.js";
import { addMonths, applyPayment, evaluate, graceDays, logEvent, setServiceStatus } from "../lib/billing.js";
import { handleAuthorizedPaymentId, recordAuthorizedPayment, syncPreapproval } from "../lib/billingMp.js";
import {
  MpError, cancelPreapproval, createPreapproval, getPayment, getPreapproval, mpEnabled, updatePreapprovalAmount, verifyWebhookSignature,
} from "../lib/mercadopago.js";
import { addDays, artDateString, artMidnight } from "../lib/time.js";
import { autoIssueForPayment } from "../lib/dattaInvoice.js";
import { fail, loadRoles, requireSession } from "./common.js";

const uuid = z.string().uuid();

/** Solo el superadmin administra suscripciones. */
export async function requireSuper(req: FastifyRequest, reply: FastifyReply) {
  const user = requireSession(req, reply);
  if (!user) return null;
  const roles = await loadRoles(user.id);
  if (!roles.some((r) => r.role === "superadmin")) {
    void fail(reply, 403, "Solo el superadmin puede administrar suscripciones");
    return null;
  }
  return user;
}

const mpFail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof MpError) return fail(reply, e.status >= 500 || e.status === 503 ? 502 : 400, `Mercado Pago: ${e.message}`);
  throw e;
};

export async function registerBilling(app: FastifyInstance) {
  // ---------------------------------------------------------------- panel (superadmin)

  // Resumen para Cobranzas y Dashboard: estado calculado HOY de cada cliente + totales.
  app.post("/api/fn/billing/overview", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    const today = artDateString();
    return withDb(SERVICE, async (c) => {
      const grace = await graceDays(c);
      const rows = (
        await c.query(
          `SELECT e.id, e.name, e.city, e.contact_email, e.contact_phone, e.is_active, e.service_status, e.agreed_price::float AS agreed_price,
                  e.trial_ends_at::text AS trial_ends_at, e.next_due_date::text AS next_due_date, e.mp_preapproval_id, e.mp_status, e.mp_init_point,
                  e.suspended_at, e.suspension_reason,
                  (SELECT max(p.payment_date)::text FROM public.client_payments p WHERE p.establishment_id = e.id) AS last_payment_date,
                  (SELECT p.amount::float FROM public.client_payments p WHERE p.establishment_id = e.id ORDER BY p.payment_date DESC, p.created_at DESC LIMIT 1) AS last_payment_amount
             FROM public.establishments e ORDER BY e.name`,
        )
      ).rows;
      const clients = rows.map((r) => {
        const ev = evaluate(r, today, grace);
        return { ...r, effective_status: ev.status, overdue_days: ev.overdueDays, days_to_suspension: ev.daysToSuspension, billing_configured: !!r.next_due_date };
      });
      const monthStart = `${today.slice(0, 8)}01`;
      const collected = (await c.query(`SELECT coalesce(sum(amount),0)::float AS s FROM public.client_payments WHERE payment_date >= $1`, [monthStart])).rows[0].s;
      const paying = clients.filter((x) => x.effective_status === "active" && x.is_active);
      return {
        today,
        grace_days: grace,
        mp_enabled: mpEnabled(),
        plan_price: Number((await c.query(`SELECT value FROM public.app_settings WHERE key = 'plan_price'`)).rows[0]?.value ?? 0),
        totals: {
          mrr: paying.reduce((s, x) => s + Number(x.agreed_price || 0), 0),
          collected_this_month: collected,
          counts: Object.fromEntries(["trial", "active", "past_due", "suspended", "cancelled"].map((k) => [k, clients.filter((x) => x.effective_status === k).length])),
        },
        clients,
      };
    });
  });

  // Historial de eventos de un cliente
  app.post("/api/fn/billing/events", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    const b = z.object({ establishment_id: uuid, limit: z.number().int().min(1).max(200).default(50) }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Datos inválidos");
    return withDb(SERVICE, async (c) => ({
      events: (await c.query(`SELECT id, type, details, actor, created_at FROM public.subscription_events WHERE establishment_id = $1 ORDER BY created_at DESC LIMIT $2`, [b.data.establishment_id, b.data.limit])).rows,
    }));
  });

  // Prueba gratis por N días (en vez de un pago): el cliente vence al terminar la prueba.
  app.post("/api/fn/billing/trial", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const b = z.object({ establishment_id: uuid, days: z.number().int().min(1).max(365) }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Indicá una cantidad de días entre 1 y 365");
    const end = addDays(artDateString(), b.data.days);
    return withDb(SERVICE, async (c) => {
      const r = await c.query(
        `UPDATE public.establishments SET service_status = 'trial', trial_ends_at = $2, next_due_date = $2, suspended_at = NULL, suspension_reason = NULL WHERE id = $1 RETURNING id`,
        [b.data.establishment_id, end],
      );
      if (!r.rowCount) return fail(reply, 404, "Cliente inexistente");
      await logEvent(c, b.data.establishment_id, "trial_started", { days: b.data.days, ends: end }, user.id);
      return { ok: true, trial_ends_at: end };
    });
  });

  // Pago manual (transferencia, efectivo, etc.)
  app.post("/api/fn/billing/register-payment", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const b = z
      .object({
        establishment_id: uuid, amount: z.number().positive(), payment_method: z.string().max(40).default("transfer"),
        period_month: z.number().int().min(1).max(12).optional(), period_year: z.number().int().min(2020).max(2100).optional(),
        payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), notes: z.string().max(500).nullish(),
      })
      .safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Datos de pago inválidos");
    const r = await withDb(SERVICE, (c) =>
      applyPayment(c, {
        establishmentId: b.data.establishment_id, amount: b.data.amount, method: b.data.payment_method, paymentDate: b.data.payment_date,
        periodMonth: b.data.period_month, periodYear: b.data.period_year, source: "manual", notes: b.data.notes, createdBy: user.id,
      }),
    );
    if (!r.inserted) return fail(reply, 409, "Ya existe un pago registrado para ese período");
    // Con el pago ya guardado: factura automática si está activada (si ARCA falla, el pago queda igual).
    if (r.paymentId) await autoIssueForPayment(r.paymentId, user.id, req.log);
    return { ok: true, next_due_date: r.nextDueDate, payment_id: r.paymentId };
  });

  // Suspender / reactivar / cancelar a mano
  app.post("/api/fn/billing/set-status", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const b = z
      .object({ establishment_id: uuid, status: z.enum(["active", "suspended", "cancelled"]), reason: z.string().max(300).nullish(), extend_days: z.number().int().min(1).max(365).optional() })
      .safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Datos inválidos");
    return withDb(SERVICE, async (c) => {
      const exists = (await c.query(`SELECT 1 FROM public.establishments WHERE id = $1`, [b.data.establishment_id])).rowCount;
      if (!exists) return fail(reply, 404, "Cliente inexistente");
      if (b.data.status === "active") {
        // reactivación sin pago: se le da un nuevo vencimiento (por defecto 30 días) para que no se vuelva a suspender enseguida
        const due = addDays(artDateString(), b.data.extend_days ?? 30);
        await c.query(`UPDATE public.establishments SET next_due_date = $2, is_active = true WHERE id = $1`, [b.data.establishment_id, due]);
        await setServiceStatus(c, b.data.establishment_id, "active", b.data.reason ?? "Reactivado por el superadmin", user.id, { next_due_date: due });
        return { ok: true, next_due_date: due };
      }
      await setServiceStatus(c, b.data.establishment_id, b.data.status, b.data.reason ?? (b.data.status === "suspended" ? "Suspendido por el superadmin" : "Cancelado por el superadmin"), user.id);
      return { ok: true };
    });
  });

  // Link de suscripción de Mercado Pago (el cliente lo abre y autoriza su tarjeta una vez)
  app.post("/api/fn/billing/create-subscription", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const b = z.object({ establishment_id: uuid, payer_email: z.string().email(), amount: z.number().positive().optional() }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Indicá el email del titular de la tarjeta");
    try {
      return await withDb(SERVICE, async (c) => {
        const e = (await c.query(`SELECT id, name, agreed_price::float AS price, trial_ends_at::text AS trial_ends_at, mp_preapproval_id, mp_status FROM public.establishments WHERE id = $1 FOR UPDATE`, [b.data.establishment_id])).rows[0];
        if (!e) return fail(reply, 404, "Cliente inexistente");
        if (e.mp_preapproval_id && ["pending", "authorized"].includes(e.mp_status)) {
          return fail(reply, 409, "Este cliente ya tiene una suscripción en Mercado Pago. Cancelala antes de generar otra.");
        }
        const planPrice = Number((await c.query(`SELECT value FROM public.app_settings WHERE key = 'plan_price'`)).rows[0]?.value ?? 0);
        const amount = b.data.amount ?? (e.price > 0 ? e.price : planPrice);
        if (!(amount > 0)) return fail(reply, 400, "Primero definí el precio del cliente o del plan (tiene que ser mayor a 0).");

        const today = artDateString();
        // si está en prueba, el primer cobro es recién cuando termina; si no, hoy
        const start = e.trial_ends_at && e.trial_ends_at > today ? e.trial_ends_at : today;
        const startIso = start === today ? new Date(Date.now() + 60_000).toISOString() : artMidnight(start).toISOString();
        const pre = await createPreapproval({
          reason: `Datta – ${e.name}`, externalReference: e.id, payerEmail: b.data.payer_email, amount, startDate: startIso,
          backUrl: `${env.PUBLIC_ORIGIN}/login`,
        });
        await c.query(
          `UPDATE public.establishments SET mp_preapproval_id = $2, mp_payer_email = $3, mp_init_point = $4, mp_status = $5, agreed_price = $6 WHERE id = $1`,
          [e.id, pre.id, b.data.payer_email, pre.init_point ?? null, pre.status, amount],
        );
        await logEvent(c, e.id, "mp_link_created", { preapproval_id: pre.id, amount, start }, user.id);
        return { ok: true, init_point: pre.init_point, preapproval_id: pre.id, amount };
      });
    } catch (e) {
      return mpFail(reply, e);
    }
  });

  app.post("/api/fn/billing/cancel-subscription", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const b = z.object({ establishment_id: uuid }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Datos inválidos");
    try {
      return await withDb(SERVICE, async (c) => {
        const e = (await c.query(`SELECT mp_preapproval_id FROM public.establishments WHERE id = $1 FOR UPDATE`, [b.data.establishment_id])).rows[0];
        if (!e?.mp_preapproval_id) return fail(reply, 404, "El cliente no tiene suscripción en Mercado Pago");
        await cancelPreapproval(e.mp_preapproval_id);
        await c.query(`UPDATE public.establishments SET mp_status = 'cancelled' WHERE id = $1`, [b.data.establishment_id]);
        await logEvent(c, b.data.establishment_id, "mp_cancelled", {}, user.id);
        return { ok: true };
      });
    } catch (e) {
      return mpFail(reply, e);
    }
  });

  // Precio: plan único. Sin ajuste automático; el superadmin decide cuándo y a quiénes aplicarlo.
  app.post("/api/fn/billing/update-price", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const b = z.object({ amount: z.number().positive().max(100_000_000), establishment_id: uuid.optional(), apply_to_all: z.boolean().default(false) }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Precio inválido");
    return withDb(SERVICE, async (c) => {
      // el precio del plan (para clientes nuevos) solo cambia cuando no se está editando a un cliente puntual
      if (!b.data.establishment_id) {
        await c.query(
          `INSERT INTO public.app_settings (key, value) VALUES ('plan_price', to_jsonb($1::numeric)) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [b.data.amount],
        );
      }
      if (!b.data.establishment_id) await c.query(`UPDATE public.client_plans SET price = $1 WHERE is_active`, [b.data.amount]);
      const targets = b.data.establishment_id
        ? (await c.query(`SELECT id, mp_preapproval_id, mp_status FROM public.establishments WHERE id = $1`, [b.data.establishment_id])).rows
        : b.data.apply_to_all
          ? (await c.query(`SELECT id, mp_preapproval_id, mp_status FROM public.establishments WHERE service_status <> 'cancelled' AND is_active`)).rows
          : [];
      const mpResults: { establishmentId: string; ok: boolean; error?: string }[] = [];
      for (const t of targets) {
        await c.query(`UPDATE public.establishments SET agreed_price = $2 WHERE id = $1`, [t.id, b.data.amount]);
        await logEvent(c, t.id, "price_changed", { amount: b.data.amount }, user.id);
        if (t.mp_preapproval_id && ["pending", "authorized"].includes(t.mp_status)) {
          try {
            await updatePreapprovalAmount(t.mp_preapproval_id, b.data.amount);
            mpResults.push({ establishmentId: t.id, ok: true });
          } catch (e) {
            mpResults.push({ establishmentId: t.id, ok: false, error: (e as Error).message });
          }
        }
      }
      return { ok: true, updated: targets.length, mp: mpResults };
    });
  });

  app.post("/api/fn/billing/settings", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const b = z.object({ grace_days: z.number().int().min(1).max(365) }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Días de gracia inválidos");
    await withDb(SERVICE, (c) =>
      c.query(`INSERT INTO public.app_settings (key, value) VALUES ('billing_grace_days', to_jsonb($1::int)) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [b.data.grace_days]),
    );
    return { ok: true };
  });

  // Barrido manual (el automático corre cada madrugada)
  app.post("/api/fn/billing/sweep", async (req, reply) => {
    const internal = !!env.INTERNAL_CRON_SECRET && req.headers["x-cron-secret"] === env.INTERNAL_CRON_SECRET;
    if (!internal && !(await requireSuper(req, reply))) return;
    return runBillingSweep();
  });

  // ---------------------------------------------------------------- webhook de Mercado Pago (público)
  const webhook = async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string | undefined>;
    const body = (req.body ?? {}) as { type?: string; topic?: string; data?: { id?: string | number }; id?: string | number };
    const topic = String(q.type ?? q.topic ?? body.type ?? body.topic ?? "");
    const dataId = String(q["data.id"] ?? q.id ?? body.data?.id ?? body.id ?? "");
    req.log.info({ topic, dataId }, "mp-subscription-webhook");

    if (!verifyWebhookSignature({ signature: req.headers["x-signature"] as string | undefined, requestId: req.headers["x-request-id"] as string | undefined, dataId })) {
      return fail(reply, 401, "Firma inválida");
    }
    if (!dataId || !/^[A-Za-z0-9_-]{3,80}$/.test(dataId)) return { ok: true, ignored: "sin id" };

    let newPaymentId: string | undefined;
    try {
      await withDb(SERVICE, async (c) => {
        if (topic === "subscription_preapproval") {
          await syncPreapproval(c, dataId);
        } else if (topic === "subscription_authorized_payment") {
          const r = await handleAuthorizedPaymentId(c, dataId);
          if (r.recorded) newPaymentId = r.paymentId;
        } else if (topic === "payment") {
          // pago suelto: solo se toma si pertenece a una suscripción conocida
          const pay = await getPayment(dataId);
          const preId = pay.metadata?.preapproval_id;
          if (preId && pay.status === "approved") {
            const r = await recordAuthorizedPayment(c, { id: dataId, preapproval_id: preId, payment: { id: pay.id, status: pay.status } });
            if (r.recorded) newPaymentId = r.paymentId;
          }
        }
      });
    } catch (e) {
      req.log.error({ err: (e as Error).message, topic, dataId }, "mp-subscription-webhook falló");
      // 500 para que Mercado Pago reintente
      return fail(reply, 500, "No se pudo procesar");
    }
    // Fuera de la transacción del cobro y sin demorar la respuesta a Mercado Pago:
    // la factura nunca hace fallar el registro del pago.
    if (newPaymentId) void autoIssueForPayment(newPaymentId, null, req.log);
    return { ok: true };
  };
  const hookOpts = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
  app.post("/api/mercadopago/subscriptions/webhook", hookOpts, webhook);
  app.get("/api/mercadopago/subscriptions/webhook", hookOpts, webhook);
}
