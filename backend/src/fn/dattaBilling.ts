import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import forge from "node-forge";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { decryptSecret, encryptSecret } from "../secrets.js";
import { env } from "../env.js";
import {
  CANCEL_REASONS, DUE_NOTICE_DAYS, applyDueCancellations, applyPayment, daysBetween, evaluate, graceDays, logEvent, surchargePct,
} from "../lib/billing.js";
import { AutoDebitError, startAutoDebit, stopAutoDebit } from "../lib/billingMp.js";
import { MpError, mpEnabled } from "../lib/mercadopago.js";
import { autoIssueForPayment, issueForPayment, loadFiscal, missingConfig, publicIssuer, testConnection } from "../lib/dattaInvoice.js";
import { artDateString } from "../lib/time.js";
import { HttpError } from "./afipInvoice.js";
import { fail, loadRoles, requireSession } from "./common.js";

// Facturación de Datta a sus clientes (superadmin) y la sección "Suscripción" de cada local (admin y cajero).

async function requireSuper(req: FastifyRequest, reply: FastifyReply) {
  const user = requireSession(req, reply);
  if (!user) return null;
  if (!(await loadRoles(user.id)).some((r) => r.role === "superadmin")) {
    void fail(reply, 403, "Solo el superadmin administra la facturación de Datta");
    return null;
  }
  return user;
}

/** Local donde el usuario es admin (solo el admin paga y configura el débito). */
async function adminEstablishment(userId: string): Promise<string | null> {
  return (await loadRoles(userId)).find((r) => r.role === "admin" && r.establishment_id)?.establishment_id ?? null;
}

/**
 * Pago pendiente del local hoy: se puede pagar desde 7 días antes del vencimiento, vencido o suspendido
 * (no si está cancelado o sin vencimiento). El monto lleva el recargo por atraso.
 */
function receiptDue(e: { service_status: string; next_due_date: string | null } | undefined, today: string, base: number | null) {
  if (!e?.next_due_date || e.service_status === "cancelled") return { open: false, surchargePct: 0, amount: null as number | null };
  const overdue = Math.max(0, daysBetween(e.next_due_date, today));
  const open = overdue > 0 || daysBetween(today, e.next_due_date) <= DUE_NOTICE_DAYS;
  const pct = Math.min(surchargePct(overdue), 20);
  return { open, surchargePct: pct, amount: base == null ? null : Math.round(base * (1 + pct / 100)) };
}

const sendError = (req: FastifyRequest, reply: FastifyReply, e: unknown, what: string) => {
  const status = e instanceof HttpError ? e.status : 502;
  req.log.error({ err: (e as Error).message }, what);
  return reply.code(status).send({ error: (e as Error).message ?? "Error inesperado", ...(e instanceof HttpError ? e.extra : {}) });
};

const fiscalBody = z.object({
  cuit: z.string().max(20).nullish(),
  razon_social: z.string().max(120).nullish(),
  condicion_iva: z.enum(["monotributo", "responsable_inscripto", "exento"]),
  punto_venta: z.number().int().min(1).max(99998).nullish(),
  environment: z.enum(["testing", "production"]),
  domicilio: z.string().max(200).nullish(),
  iibb: z.string().max(40).nullish(),
  inicio_actividades: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  auto_issue: z.boolean(),
});

export async function registerDattaBilling(app: FastifyInstance) {
  // ---------------------------------------------------------------- configuración fiscal (superadmin)

  app.post("/api/fn/datta-fiscal/get", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    const f = await withDb(SERVICE, loadFiscal);
    return {
      ...publicIssuer(f),
      environment: f.environment,
      auto_issue: f.auto_issue,
      has_private_key: !!f.private_key_pem,
      has_certificate: !!f.certificate_pem,
      certificate_expires_at: f.certificate_expires_at,
      missing: missingConfig(f),
    };
  });

  app.post("/api/fn/datta-fiscal/save", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    const p = fiscalBody.safeParse(req.body);
    if (!p.success) return fail(reply, 400, "Datos fiscales inválidos");
    const b = p.data;
    const cuit = b.cuit ? b.cuit.replace(/\D/g, "") : null;
    if (cuit && cuit.length !== 11) return fail(reply, 400, "El CUIT debe tener 11 dígitos");
    await withDb(SERVICE, async (c) => {
      const prev = await loadFiscal(c);
      // Si cambia el CUIT, el certificado anterior deja de servir.
      const resetCert = !!prev.cuit && prev.cuit !== cuit;
      await c.query(
        `UPDATE public.datta_fiscal_settings
            SET cuit = $1, razon_social = $2, condicion_iva = $3, punto_venta = $4, environment = $5, domicilio = $6, iibb = $7,
                inicio_actividades = $8, auto_issue = $9, updated_at = now(),
                certificate_pem = CASE WHEN $10 THEN NULL ELSE certificate_pem END,
                private_key_pem = CASE WHEN $10 THEN NULL ELSE private_key_pem END,
                certificate_expires_at = CASE WHEN $10 THEN NULL ELSE certificate_expires_at END
          WHERE id`,
        [cuit, b.razon_social?.trim() || null, b.condicion_iva, b.punto_venta ?? null, b.environment, b.domicilio?.trim() || null,
          b.iibb?.trim() || null, b.inicio_actividades || null, b.auto_issue, resetCert],
      );
      // El ticket de ARCA es por certificado: al cambiarlo hay que pedir uno nuevo.
      if (resetCert) await c.query(`DELETE FROM public.datta_afip_tokens`);
    });
    return { ok: true };
  });

  // Genera clave privada + CSR para pedir el certificado en ARCA. La clave queda cifrada en la base.
  app.post("/api/fn/datta-fiscal/csr", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    return withDb(SERVICE, async (c) => {
      const f = await loadFiscal(c);
      const cuit = String(f.cuit ?? "").replace(/\D/g, "");
      if (cuit.length !== 11) return fail(reply, 400, "Guardá primero el CUIT de Datta (11 dígitos).");
      const cn = String(f.razon_social || "datta").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9 ._-]/g, "").slice(0, 50) || "datta";
      const keys = forge.pki.rsa.generateKeyPair(2048);
      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = keys.publicKey;
      csr.setSubject([
        { name: "countryName", value: "AR" },
        { name: "organizationName", value: cn },
        { name: "commonName", value: "datta-facturacion" },
        { name: "serialNumber", type: "2.5.4.5", value: `CUIT ${cuit}` },
      ]);
      csr.sign(keys.privateKey, forge.md.sha256.create());
      await c.query(
        `UPDATE public.datta_fiscal_settings SET private_key_pem = $1, certificate_pem = NULL, certificate_expires_at = NULL, updated_at = now() WHERE id`,
        [encryptSecret(forge.pki.privateKeyToPem(keys.privateKey))],
      );
      await c.query(`DELETE FROM public.datta_afip_tokens`);
      return { csr: forge.pki.certificationRequestToPem(csr), filename: `datta-${cuit}.csr` };
    });
  });

  // Carga del certificado (.crt) que devuelve ARCA para el CSR generado.
  app.post("/api/fn/datta-fiscal/certificate", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    const p = z.object({ certificate_pem: z.string().min(50).max(20000) }).safeParse(req.body);
    if (!p.success) return fail(reply, 400, "Falta el certificado");
    let cert: forge.pki.Certificate;
    try {
      cert = forge.pki.certificateFromPem(p.data.certificate_pem.trim());
    } catch {
      return fail(reply, 400, "El archivo no es un certificado PEM válido (.crt)");
    }
    return withDb(SERVICE, async (c) => {
      const f = await loadFiscal(c);
      if (!f.private_key_pem) return fail(reply, 400, "Primero generá el CSR: el certificado tiene que corresponder a esa clave.");
      const priv = forge.pki.privateKeyFromPem(decryptSecret(f.private_key_pem)) as forge.pki.rsa.PrivateKey;
      const pub = cert.publicKey as forge.pki.rsa.PublicKey;
      if (priv.n.compareTo(pub.n) !== 0 || priv.e.compareTo(pub.e) !== 0) {
        return fail(reply, 400, "Este certificado no corresponde al último CSR generado. Descargalo de ARCA para ese CSR.");
      }
      const serial = cert.subject.attributes.find((a: any) => a.type === "2.5.4.5" || a.name === "serialNumber");
      const certCuit = String(serial?.value ?? "").replace(/\D/g, "");
      if (certCuit && certCuit !== String(f.cuit ?? "").replace(/\D/g, "")) return fail(reply, 400, `El certificado es del CUIT ${certCuit}, no del CUIT de Datta.`);
      const expires = cert.validity.notAfter.toISOString().slice(0, 10);
      await c.query(
        `UPDATE public.datta_fiscal_settings SET certificate_pem = $1, certificate_expires_at = $2, updated_at = now() WHERE id`,
        [p.data.certificate_pem.trim(), expires],
      );
      await c.query(`DELETE FROM public.datta_afip_tokens`);
      return { ok: true, expires_at: expires };
    });
  });

  app.post("/api/fn/datta-fiscal/test", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    try {
      return { ok: true, ...(await testConnection()) };
    } catch (e) {
      return sendError(req, reply, e, "datta-fiscal/test");
    }
  });

  // ---------------------------------------------------------------- emisión (superadmin)

  app.post("/api/fn/datta-invoice/issue", async (req, reply) => {
    const user = await requireSuper(req, reply);
    if (!user) return;
    const p = z.object({ client_payment_id: z.string().uuid() }).safeParse(req.body);
    if (!p.success) return fail(reply, 400, "Falta el pago a facturar");
    try {
      return await issueForPayment(p.data.client_payment_id, user.id);
    } catch (e) {
      return sendError(req, reply, e, "datta-invoice/issue");
    }
  });

  // ---------------------------------------------------------------- suscripción del local (admin y cajero)

  app.post("/api/fn/subscription/me", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const roles = await loadRoles(user.id);
    const mine = roles.find((r) => (r.role === "admin" || r.role === "cashier") && r.establishment_id);
    if (!mine?.establishment_id) return fail(reply, 403, "Solo el administrador o el cajero de un local ven la suscripción");
    const estId = mine.establishment_id;

    return withDb(SERVICE, async (c) => {
      const e = (
        await c.query(
          `SELECT e.id, e.name, e.cuit, e.razon_social, e.is_active, e.service_status, e.agreed_price::float AS agreed_price,
                  e.trial_ends_at::text AS trial_ends_at, e.next_due_date::text AS next_due_date, e.service_start_date::text AS service_start_date,
                  e.mp_status, e.mp_init_point, e.mp_payer_email, e.plan_id
             FROM public.establishments e WHERE e.id = $1`,
          [estId],
        )
      ).rows[0];
      if (!e) return fail(reply, 404, "Local no encontrado");
      const ev = evaluate(e, artDateString(), await graceDays(c));
      const planPrice = Number((await c.query(`SELECT value FROM public.app_settings WHERE key = 'plan_price'`)).rows[0]?.value ?? 0);
      const base = Number(e.agreed_price) > 0 ? Number(e.agreed_price) : planPrice > 0 ? planPrice : null;
      const due = receiptDue(e, artDateString(), base);
      const plan = (
        await c.query(
          `SELECT name, description, features, price::float AS price FROM public.client_plans
            WHERE id = $1 OR ($1::uuid IS NULL AND is_active) ORDER BY (id = $1) DESC NULLS LAST, created_at LIMIT 1`,
          [e.plan_id],
        )
      ).rows[0] ?? null;
      const payments = (
        await c.query(
          `SELECT id, amount::float AS amount, payment_method, period_month, period_year, payment_date::text AS payment_date, source, receipt_path, surcharge_pct
             FROM public.client_payments WHERE establishment_id = $1 ORDER BY payment_date DESC, created_at DESC LIMIT 36`,
          [estId],
        )
      ).rows;
      const rejected = (
        await c.query(
          `SELECT id, amount::float AS amount, payment_date::text AS payment_date, reason, created_at
             FROM public.rejected_receipts WHERE establishment_id = $1 AND created_at > now() - interval '60 days' ORDER BY created_at DESC LIMIT 5`,
          [estId],
        )
      ).rows;
      const invoices = (
        await c.query(
          `SELECT id, client_payment_id, environment, tipo_cbte, punto_venta, cbte_numero::int AS cbte_numero, cae, cae_vto::text AS cae_vto,
                  issue_date::text AS issue_date, period_from::text AS period_from, period_to::text AS period_to, description,
                  total::float AS total, neto_gravado::float AS neto_gravado, iva_amount::float AS iva_amount, emisor, receptor
             FROM public.datta_invoices WHERE establishment_id = $1 ORDER BY issue_date DESC, cbte_numero DESC LIMIT 36`,
          [estId],
        )
      ).rows;
      const cancellation = (
        await c.query(
          `SELECT id, reason_category, reason_detail, effective_date::text AS effective_date, created_at
             FROM public.cancellation_requests WHERE establishment_id = $1 AND status = 'pending' LIMIT 1`,
          [estId],
        )
      ).rows[0] ?? null;
      // el cajero ve el estado y el vencimiento, pero no montos, pagos ni facturas
      const isAdmin = mine.role === "admin";
      const money = <T,>(v: T, hidden: T) => (isAdmin ? v : hidden);
      return {
        establishment: { id: e.id, name: e.name, cuit: e.cuit, razon_social: e.razon_social },
        cancellation,
        status: ev.status,
        overdue_days: ev.overdueDays,
        days_to_suspension: ev.daysToSuspension,
        next_due_date: e.next_due_date,
        trial_ends_at: e.trial_ends_at,
        service_start_date: e.service_start_date,
        amount: money(base, null),
        days_to_due: ev.daysToDue,
        surcharge_pct: due.surchargePct,
        amount_due: money(due.amount, null),
        can_upload_receipt: due.open && !cancellation,
        is_admin: isAdmin,
        plan,
        auto_debit: e.mp_status === "authorized",
        auto_debit_pending: e.mp_status === "pending",
        mp_payer_email: e.mp_payer_email ?? null,
        pay_url: e.mp_init_point ?? null,
        payments: money(payments, []),
        rejected: money(rejected, []),
        invoices: money(invoices, []),
      };
    });
  });

  // Trámite de baja: el admin indica el motivo; el local sigue operando hasta el fin del período pagado.
  app.post("/api/fn/subscription/request-cancellation", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const estId = await adminEstablishment(user.id);
    if (!estId) return fail(reply, 403, "Solo el administrador del local puede dar de baja la suscripción");
    const b = z
      .object({
        reason_category: z.enum(CANCEL_REASONS),
        reason_detail: z.string().trim().min(10, "Contanos un poco más el motivo (al menos 10 letras)").max(1000),
      })
      .safeParse(req.body);
    if (!b.success) return fail(reply, 400, b.error.issues[0]?.message ?? "Completá el motivo de la baja");
    const today = artDateString();
    const r = await withDb(SERVICE, async (c) => {
      const e = (
        await c.query(`SELECT service_status, next_due_date::text AS next_due_date, mp_preapproval_id, mp_status FROM public.establishments WHERE id = $1 FOR UPDATE`, [estId])
      ).rows[0];
      if (!e || e.service_status === "cancelled") return { error: "La suscripción ya está dada de baja" };
      const pending = (await c.query(`SELECT 1 FROM public.cancellation_requests WHERE establishment_id = $1 AND status = 'pending'`, [estId])).rowCount;
      if (pending) return { error: "Ya pediste la baja. Si te arrepentiste, podés cancelar el pedido." };
      // hasta el último día pagado (o la prueba); si ya venció, la baja es hoy
      const effective = e.next_due_date && e.next_due_date > today ? e.next_due_date : today;
      const ins = await c.query(
        `INSERT INTO public.cancellation_requests (establishment_id, reason_category, reason_detail, effective_date, requested_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [estId, b.data.reason_category, b.data.reason_detail, effective, user.id],
      );
      await logEvent(c, estId, "cancellation_requested", { reason_category: b.data.reason_category, reason_detail: b.data.reason_detail, effective_date: effective }, user.id);
      // que no se cobre nada más: se corta el débito automático
      let autoDebitStopped = false;
      if (e.mp_preapproval_id && ["pending", "authorized", "paused"].includes(e.mp_status)) {
        try {
          await stopAutoDebit(c, estId, user.id);
          autoDebitStopped = true;
        } catch (err) {
          req.log.error({ err: (err as Error).message, estId }, "baja: no se pudo cancelar el débito en Mercado Pago");
        }
      }
      if (effective === today) await applyDueCancellations(c, today);
      return { id: ins.rows[0].id as string, effective, autoDebitStopped };
    });
    if ("error" in r) return fail(reply, 409, r.error as string);
    return { ok: true, effective_date: r.effective, auto_debit_stopped: r.autoDebitStopped };
  });

  app.post("/api/fn/subscription/withdraw-cancellation", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const estId = await adminEstablishment(user.id);
    if (!estId) return fail(reply, 403, "Solo el administrador del local puede cancelar el pedido de baja");
    return withDb(SERVICE, async (c) => {
      const r = await c.query(
        `UPDATE public.cancellation_requests SET status = 'withdrawn', resolved_at = now()
          WHERE establishment_id = $1 AND status = 'pending' RETURNING id`,
        [estId],
      );
      if (!r.rowCount) return fail(reply, 404, "No hay un pedido de baja pendiente");
      await logEvent(c, estId, "cancellation_withdrawn", {}, user.id);
      return { ok: true };
    });
  });

  // El admin sube el comprobante de pago: se acepta al instante (el superadmin lo puede rechazar después).
  app.post("/api/fn/subscription/upload-receipt", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const estId = await adminEstablishment(user.id);
    if (!estId) return fail(reply, 403, "Solo el administrador del local puede subir el comprobante");
    const b = z
      .object({ receipt_path: z.string().min(3).max(300), payment_method: z.enum(["transferencia", "efectivo", "otro"]).default("transferencia"), notes: z.string().max(300).nullish() })
      .safeParse(req.body);
    if (!b.success || !b.data.receipt_path.startsWith(`${estId}/`)) return fail(reply, 400, "Falta el comprobante");
    const today = artDateString();
    const r = await withDb(SERVICE, async (c) => {
      const e = (
        await c.query(
          `SELECT service_status, next_due_date::text AS next_due_date, agreed_price::float AS agreed_price,
                  (SELECT (value #>> '{}')::float FROM public.app_settings WHERE key = 'plan_price') AS plan_price
             FROM public.establishments WHERE id = $1 FOR UPDATE`,
          [estId],
        )
      ).rows[0];
      const base = Number(e?.agreed_price) > 0 ? Number(e.agreed_price) : Number(e?.plan_price) > 0 ? Number(e.plan_price) : null;
      const due = receiptDue(e, today, base);
      if (!due.open) return { error: "Todavía no hay un pago pendiente: el comprobante se sube desde una semana antes del vencimiento" };
      if (due.amount == null) return { error: "El equipo de Datta todavía no definió tu precio. Escribinos por Inconvenientes." };
      return applyPayment(c, {
        establishmentId: estId, amount: due.amount, method: b.data.payment_method, source: "receipt", receiptPath: b.data.receipt_path,
        surchargePct: due.surchargePct, notes: b.data.notes ?? null, createdBy: user.id,
      });
    });
    if ("error" in r) return fail(reply, 409, r.error as string);
    if (!r.inserted) return fail(reply, 409, "No se pudo registrar el pago");
    if (r.paymentId) await autoIssueForPayment(r.paymentId, user.id, req.log);
    return { ok: true, next_due_date: r.nextDueDate };
  });

  // Débito automático con Mercado Pago, activado por el admin del local.
  app.post("/api/fn/subscription/auto-debit", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const estId = await adminEstablishment(user.id);
    if (!estId) return fail(reply, 403, "Solo el administrador del local puede activar el débito automático");
    const b = z.object({ payer_email: z.string().email() }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Indicá el email de tu cuenta de Mercado Pago");
    if (!mpEnabled()) return fail(reply, 503, "El débito automático no está disponible en este momento");
    try {
      const r = await withDb(SERVICE, (c) =>
        startAutoDebit(c, { establishmentId: estId, payerEmail: b.data.payer_email, backUrl: `${env.PUBLIC_ORIGIN}/admin/suscripcion`, actor: user.id }),
      );
      return { ok: true, init_point: r.init_point };
    } catch (e) {
      if (e instanceof AutoDebitError) return fail(reply, e.status, e.status === 409 ? "Ya tenés un débito automático en curso. Desactivalo antes de generar otro." : e.message);
      if (e instanceof MpError) return fail(reply, 502, `Mercado Pago: ${e.message}`);
      throw e;
    }
  });

  app.post("/api/fn/subscription/cancel-auto-debit", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const estId = await adminEstablishment(user.id);
    if (!estId) return fail(reply, 403, "Solo el administrador del local puede desactivar el débito automático");
    try {
      await withDb(SERVICE, (c) => stopAutoDebit(c, estId, user.id));
      return { ok: true };
    } catch (e) {
      if (e instanceof AutoDebitError) return fail(reply, e.status, e.message);
      if (e instanceof MpError) return fail(reply, 502, `Mercado Pago: ${e.message}`);
      throw e;
    }
  });
}
