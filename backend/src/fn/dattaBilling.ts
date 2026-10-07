import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import forge from "node-forge";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { decryptSecret, encryptSecret } from "../secrets.js";
import { evaluate, graceDays } from "../lib/billing.js";
import { issueForPayment, loadFiscal, missingConfig, publicIssuer, testConnection } from "../lib/dattaInvoice.js";
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
                  e.mp_status, e.mp_init_point, e.plan_id
             FROM public.establishments e WHERE e.id = $1`,
          [estId],
        )
      ).rows[0];
      if (!e) return fail(reply, 404, "Local no encontrado");
      const ev = evaluate(e, artDateString(), await graceDays(c));
      const planPrice = Number((await c.query(`SELECT value FROM public.app_settings WHERE key = 'plan_price'`)).rows[0]?.value ?? 0);
      const plan = (
        await c.query(
          `SELECT name, description, features, price::float AS price FROM public.client_plans
            WHERE id = $1 OR ($1::uuid IS NULL AND is_active) ORDER BY (id = $1) DESC NULLS LAST, created_at LIMIT 1`,
          [e.plan_id],
        )
      ).rows[0] ?? null;
      const payments = (
        await c.query(
          `SELECT id, amount::float AS amount, payment_method, period_month, period_year, payment_date::text AS payment_date, source
             FROM public.client_payments WHERE establishment_id = $1 ORDER BY payment_date DESC, created_at DESC LIMIT 36`,
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
      return {
        establishment: { id: e.id, name: e.name, cuit: e.cuit, razon_social: e.razon_social },
        status: ev.status,
        overdue_days: ev.overdueDays,
        days_to_suspension: ev.daysToSuspension,
        next_due_date: e.next_due_date,
        trial_ends_at: e.trial_ends_at,
        service_start_date: e.service_start_date,
        amount: Number(e.agreed_price) > 0 ? Number(e.agreed_price) : planPrice > 0 ? planPrice : null,
        plan,
        auto_debit: e.mp_status === "authorized",
        pay_url: e.mp_init_point ?? null,
        payments,
        invoices,
      };
    });
  });
}
