import type pg from "pg";
import { SERVICE, withDb } from "../db/pool.js";
import { decryptSecret } from "../secrets.js";
import {
  COND_IVA_RECEPTOR_ID, HttpError, TIPO_LABELS, WSAA_URL_PRODUCTION, WSAA_URL_TESTING, WSFE_URL_PRODUCTION, WSFE_URL_TESTING,
  afipFetch, authXml, buildTRA, callWsfe, decodeEntities, fechaAR, getTipoCbte, signTRA, ultimoAutorizado,
  validateCertificateIdentity, xmlAll, xmlValue,
} from "../fn/afipInvoice.js";
import { logEvent } from "./billing.js";

// Facturas de la suscripción que Datta emite a sus clientes. Usa el mismo cliente SOAP que la facturación
// de los locales, pero con los datos fiscales y el certificado de Datta (datta_fiscal_settings).

export interface DattaFiscal {
  cuit: string | null;
  razon_social: string | null;
  condicion_iva: "monotributo" | "responsable_inscripto" | "exento";
  punto_venta: number | null;
  environment: "testing" | "production";
  domicilio: string | null;
  iibb: string | null;
  inicio_actividades: string | null;
  auto_issue: boolean;
  certificate_pem: string | null;
  private_key_pem: string | null;
  certificate_expires_at: string | null;
}

export async function loadFiscal(c: pg.PoolClient): Promise<DattaFiscal> {
  const r = await c.query(
    `SELECT cuit, razon_social, condicion_iva, punto_venta, environment, domicilio, iibb, inicio_actividades::text AS inicio_actividades,
            auto_issue, certificate_pem, private_key_pem, certificate_expires_at::text AS certificate_expires_at
       FROM public.datta_fiscal_settings WHERE id`,
  );
  return r.rows[0];
}

/** Qué falta para poder facturar (vacío = listo). */
export function missingConfig(f: DattaFiscal): string[] {
  const out: string[] = [];
  if (!/^\d{11}$/.test(String(f.cuit ?? "").replace(/\D/g, ""))) out.push("CUIT de Datta");
  if (!f.razon_social?.trim()) out.push("razón social");
  if (!f.punto_venta) out.push("punto de venta");
  if (!f.private_key_pem) out.push("clave privada (generá el CSR)");
  if (!f.certificate_pem) out.push("certificado de ARCA");
  return out;
}

/** Datos del emisor que se imprimen en la factura (sin secretos). */
export function publicIssuer(f: DattaFiscal) {
  return {
    cuit: f.cuit, razon_social: f.razon_social, condicion_iva: f.condicion_iva, punto_venta: f.punto_venta,
    domicilio: f.domicilio, iibb: f.iibb, inicio_actividades: f.inicio_actividades,
  };
}

function credentials(f: DattaFiscal) {
  const missing = missingConfig(f);
  if (missing.length) throw new HttpError(400, `Falta configurar la facturación de Datta: ${missing.join(", ")}.`);
  const cuit = String(f.cuit).replace(/\D/g, "");
  const certPem = f.certificate_pem!;
  const keyPem = decryptSecret(f.private_key_pem!);
  validateCertificateIdentity(certPem, keyPem, cuit);
  const isProduction = f.environment === "production";
  return { cuit, certPem, keyPem, isProduction, wsfeUrl: isProduction ? WSFE_URL_PRODUCTION : WSFE_URL_TESTING };
}

/** Ticket de acceso de ARCA para Datta, con caché y candado (ARCA rechaza dos logins simultáneos). */
async function getTicket(certPem: string, keyPem: string, isProduction: boolean, service = "wsfe") {
  const environment = isProduction ? "production" : "testing";
  return withDb(SERVICE, async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`datta-afip-ta:${service}:${environment}`]);
    const cached = (await c.query(`SELECT token, sign, expires_at FROM public.datta_afip_tokens WHERE service = $1 AND environment = $2`, [service, environment])).rows[0];
    if (cached && new Date(cached.expires_at).getTime() - Date.now() > 10 * 60 * 1000) return { token: cached.token as string, sign: cached.sign as string };

    const cms = signTRA(buildTRA(service), certPem, keyPem);
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="https://wsaahomo.afip.gov.ar/ws/services/LoginCms">
  <soapenv:Header/>
  <soapenv:Body><wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms></soapenv:Body>
</soapenv:Envelope>`;
    const res = await afipFetch(isProduction ? WSAA_URL_PRODUCTION : WSAA_URL_TESTING, {
      method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" }, body: envelope,
    });
    const text = await res.text();
    if (!res.ok || /faultstring/i.test(text)) throw new Error(`WSAA: ${decodeEntities(xmlValue(text, "faultstring") || text.slice(0, 500))}`);
    const ta = decodeEntities(xmlValue(text, "loginCmsReturn"));
    const token = xmlValue(ta, "token");
    const sign = xmlValue(ta, "sign");
    const expiration = xmlValue(ta, "expirationTime");
    if (!token || !sign) throw new Error(`WSAA: respuesta inválida — ${text.slice(0, 300)}`);
    await c.query(
      `INSERT INTO public.datta_afip_tokens (service, environment, token, sign, expires_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (service, environment) DO UPDATE SET token = EXCLUDED.token, sign = EXCLUDED.sign, expires_at = EXCLUDED.expires_at`,
      [service, environment, token, sign, expiration ? new Date(expiration).toISOString() : new Date(Date.now() + 11 * 3600 * 1000).toISOString()],
    );
    return { token, sign };
  });
}

/** Prueba real de conexión: login en ARCA y último número autorizado. */
export async function testConnection() {
  const f = await withDb(SERVICE, loadFiscal);
  const cr = credentials(f);
  const { token, sign } = await getTicket(cr.certPem, cr.keyPem, cr.isProduction);
  const tipo = f.condicion_iva === "monotributo" ? 11 : 6;
  const last = await ultimoAutorizado(cr.wsfeUrl, token, sign, cr.cuit, f.punto_venta!, tipo);
  return { environment: f.environment, punto_venta: f.punto_venta, tipo_label: TIPO_LABELS[tipo], last_number: last, next_number: last + 1 };
}

const ymd = (s: string) => s.replace(/-/g, "");
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

/**
 * Emite la factura de un pago de suscripción. Idempotente: si ese pago ya tiene factura en el ambiente
 * actual, la devuelve sin volver a llamar a ARCA.
 */
export async function issueForPayment(paymentId: string, actor: string | null) {
  const f = await withDb(SERVICE, loadFiscal);
  const cr = credentials(f);

  return withDb(SERVICE, async (c) => {
    // Un solo emisor a la vez por ambiente: la numeración de ARCA es correlativa.
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`datta-invoice:${f.environment}`]);

    const existing = (await c.query(`SELECT * FROM public.datta_invoices WHERE client_payment_id = $1 AND environment = $2`, [paymentId, f.environment])).rows[0];
    if (existing) return { invoice: existing, created: false };

    const p = (
      await c.query(
        `SELECT p.id, p.amount::float AS amount, p.period_month, p.period_year, p.establishment_id,
                e.name, e.cuit, e.razon_social, e.condicion_iva, e.domicilio_comercial
           FROM public.client_payments p JOIN public.establishments e ON e.id = p.establishment_id
          WHERE p.id = $1`,
        [paymentId],
      )
    ).rows[0];
    if (!p) throw new HttpError(404, "Pago inexistente");
    const total = Number(p.amount);
    if (!(total > 0)) throw new HttpError(400, "El pago no tiene un importe válido");

    const receptorCuit = String(p.cuit ?? "").replace(/\D/g, "");
    const hasCuit = /^\d{11}$/.test(receptorCuit);
    const receptorCond = hasCuit && p.condicion_iva && COND_IVA_RECEPTOR_ID[p.condicion_iva] ? p.condicion_iva : "consumidor_final";
    const tipoCbte = getTipoCbte(f.condicion_iva, receptorCond);
    const discriminaIva = tipoCbte !== 11;
    const neto = discriminaIva ? Number((total / 1.21).toFixed(2)) : total;
    const iva = discriminaIva ? Number((total - neto).toFixed(2)) : 0;

    const periodFrom = `${p.period_year}-${String(p.period_month).padStart(2, "0")}-01`;
    const periodTo = lastDayOfMonth(p.period_year, p.period_month);
    const hoy = fechaAR();
    const issueDate = `${hoy.slice(0, 4)}-${hoy.slice(4, 6)}-${hoy.slice(6, 8)}`;
    // ARCA exige que el vencimiento del pago no sea anterior a la fecha del comprobante.
    const vtoPago = hoy;

    const { token, sign } = await getTicket(cr.certPem, cr.keyPem, cr.isProduction);
    const nro = (await ultimoAutorizado(cr.wsfeUrl, token, sign, cr.cuit, f.punto_venta!, tipoCbte)) + 1;
    const ivaXml = discriminaIva
      ? `<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>${neto.toFixed(2)}</ar:BaseImp><ar:Importe>${iva.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>`
      : "";
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECAESolicitar>
      ${authXml(token, sign, cr.cuit)}
      <ar:FeCAEReq>
        <ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${f.punto_venta}</ar:PtoVta><ar:CbteTipo>${tipoCbte}</ar:CbteTipo></ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>2</ar:Concepto>
            <ar:DocTipo>${hasCuit ? 80 : 99}</ar:DocTipo>
            <ar:DocNro>${hasCuit ? receptorCuit : "0"}</ar:DocNro>
            <ar:CbteDesde>${nro}</ar:CbteDesde>
            <ar:CbteHasta>${nro}</ar:CbteHasta>
            <ar:CbteFch>${hoy}</ar:CbteFch>
            <ar:FchServDesde>${ymd(periodFrom)}</ar:FchServDesde>
            <ar:FchServHasta>${ymd(periodTo)}</ar:FchServHasta>
            <ar:FchVtoPago>${vtoPago}</ar:FchVtoPago>
            <ar:ImpTotal>${total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${neto.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:ImpIVA>${iva.toFixed(2)}</ar:ImpIVA>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:CondicionIVAReceptorId>${COND_IVA_RECEPTOR_ID[receptorCond] ?? 5}</ar:CondicionIVAReceptorId>
            ${ivaXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

    const xml = await callWsfe(cr.wsfeUrl, "FECAESolicitar", envelope);
    const resultado = xmlValue(xml, "Resultado");
    const cae = xmlValue(xml, "CAE");
    const caeVtoRaw = xmlValue(xml, "CAEFchVto");
    const observaciones = xmlAll(xml, "Obs").map((o) => `${xmlValue(o, "Code")} - ${xmlValue(o, "Msg")}`);
    if (resultado !== "A" || !cae) {
      throw new HttpError(400, `ARCA rechazó el comprobante${observaciones.length ? ": " + observaciones.join(" | ") : ""}`, { observaciones });
    }
    const caeVto = caeVtoRaw.length === 8 ? `${caeVtoRaw.slice(0, 4)}-${caeVtoRaw.slice(4, 6)}-${caeVtoRaw.slice(6, 8)}` : null;
    const description = `Suscripción Datta - período ${String(p.period_month).padStart(2, "0")}/${p.period_year}`;

    // El CAE ya existe en ARCA: si el guardado falla, el error tiene que verse.
    const inv = (
      await c.query(
        `INSERT INTO public.datta_invoices
           (establishment_id, client_payment_id, environment, tipo_cbte, punto_venta, cbte_numero, cae, cae_vto, issue_date,
            period_from, period_to, description, total, neto_gravado, iva_amount, emisor, receptor, afip_response, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19)
         RETURNING *`,
        [
          p.establishment_id, paymentId, f.environment, tipoCbte, f.punto_venta, nro, cae, caeVto, issueDate,
          periodFrom, periodTo, description, total, neto, iva,
          JSON.stringify(publicIssuer(f)),
          JSON.stringify({
            name: p.name, razon_social: p.razon_social || p.name, cuit: hasCuit ? receptorCuit : null,
            condicion_iva: receptorCond, domicilio: p.domicilio_comercial ?? null,
          }),
          JSON.stringify({ resultado, cae, cae_vto: caeVto, observaciones }),
          actor,
        ],
      )
    ).rows[0];
    await logEvent(c, p.establishment_id, "invoice_issued", {
      invoice_id: inv.id, tipo: TIPO_LABELS[tipoCbte], numero: nro, total, environment: f.environment,
    }, actor);
    return { invoice: inv, created: true };
  });
}

/**
 * Facturación automática al registrar un pago (si está activada). Nunca hace fallar el cobro:
 * si ARCA rechaza, queda registrado en el historial del cliente para emitirla a mano.
 */
export async function autoIssueForPayment(paymentId: string, actor: string | null, log: { error: (o: object, m: string) => void }) {
  try {
    const f = await withDb(SERVICE, loadFiscal);
    if (!f.auto_issue || missingConfig(f).length) return;
    await issueForPayment(paymentId, actor);
  } catch (e) {
    log.error({ err: (e as Error).message, paymentId }, "facturación automática de Datta");
    await withDb(SERVICE, async (c) => {
      const est = (await c.query(`SELECT establishment_id FROM public.client_payments WHERE id = $1`, [paymentId])).rows[0];
      if (est) await logEvent(c, est.establishment_id, "invoice_failed", { payment_id: paymentId, error: (e as Error).message }, actor);
    }).catch(() => undefined);
  }
}
