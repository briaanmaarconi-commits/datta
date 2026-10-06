import type { FastifyInstance } from "fastify";
import forge from "node-forge";
import { Agent, fetch as ufetch } from "undici";
import { SERVICE, withDb } from "../db/pool.js";
import { decryptSecret } from "../secrets.js";
import { loadRoles, requireSession } from "./common.js";

// Port de la edge function afip-invoice. La lógica fiscal (tipos de comprobante, IVA, fechas, SOAP)
// se mantiene idéntica; cambian el acceso a datos, la autenticación y el candado del ticket WSAA.

const WSAA_URL_TESTING = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
const WSAA_URL_PRODUCTION = "https://wsaa.afip.gov.ar/ws/services/LoginCms";
const WSFE_URL_TESTING = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
const WSFE_URL_PRODUCTION = "https://servicios1.afip.gov.ar/wsfev1/service.asmx";
const PADRON_URL_TESTING = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5";
const PADRON_URL_PRODUCTION = "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5";

// Los servidores de ARCA usan parámetros DH antiguos que OpenSSL 3 rechaza con el nivel de seguridad por defecto.
const afipAgent = new Agent({ connect: { ciphers: "DEFAULT@SECLEVEL=1" } });
const afipFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
  ufetch(url, { ...init, dispatcher: afipAgent });

const TIPO_LABELS: Record<number, string> = {
  1: "Factura A", 3: "Nota de Crédito A", 6: "Factura B", 8: "Nota de Crédito B",
  11: "Factura C", 13: "Nota de Crédito C",
};

// RG 5616 — Condición frente al IVA del receptor
const COND_IVA_RECEPTOR_ID: Record<string, number> = {
  responsable_inscripto: 1,
  exento: 4,
  consumidor_final: 5,
  monotributo: 6,
};

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function getTipoCbte(condicionEmisor: string, condicionReceptor: string): number {
  if (condicionEmisor === "monotributo") return 11; // Factura C
  if (condicionReceptor === "responsable_inscripto") return 1; // Factura A
  return 6; // Factura B
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlValue(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  return m?.[1]?.trim() ?? "";
}

function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "gi");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Fecha yyyymmdd en horario de Argentina */
function fechaAR(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return parts.replace(/-/g, "");
}

// ---------------------------------------------------------------- WSAA

function buildTRA(service: string): string {
  const now = Date.now();
  const iso = (d: number) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now / 1000)}</uniqueId>
    <generationTime>${iso(now - 10 * 60 * 1000)}</generationTime>
    <expirationTime>${iso(now + 10 * 60 * 1000)}</expirationTime>
  </header>
  <service>${service}</service>
</loginTicketRequest>`;
}

function signTRA(tra: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  } as any);
  p7.sign({ detached: false });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

function validateCertificateIdentity(certPem: string, keyPem: string, expectedCuit: string) {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
  const serialAttribute = cert.subject.attributes.find((attribute: any) =>
    attribute.type === "2.5.4.5" || attribute.name === "serialNumber"
  );
  const certificateCuit = String(serialAttribute?.value ?? "").replace(/\D/g, "");
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;

  if (!certificateCuit || certificateCuit !== expectedCuit) {
    const formattedCertificateCuit = certificateCuit || "no identificado";
    throw new HttpError(
      400,
      `El certificado cargado pertenece al CUIT ${formattedCertificateCuit}, pero el establecimiento usa el CUIT ${expectedCuit}. Cargá el certificado emitido por ARCA para ${expectedCuit}.`,
    );
  }

  if (publicKey.n.compareTo(key.n) !== 0 || publicKey.e.compareTo(key.e) !== 0) {
    throw new HttpError(400, "El certificado de ARCA y la clave privada cargada no pertenecen al mismo CSR.");
  }
}

/**
 * Ticket de acceso (TA) con caché en afip_tokens. Un lock por (establecimiento, servicio, ambiente) evita que
 * dos requests simultáneos pidan un TA nuevo: ARCA rechaza un segundo login mientras haya uno vigente.
 */
async function getTicket(
  establishmentId: string,
  certPem: string,
  keyPem: string,
  isProduction: boolean,
  service = "wsfe",
): Promise<{ token: string; sign: string }> {
  const environment = isProduction ? "production" : "testing";
  return withDb(SERVICE, async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`afip-ta:${establishmentId}:${service}:${environment}`]);

    const cached = (
      await c.query(
        `SELECT token, sign, expires_at FROM public.afip_tokens WHERE establishment_id = $1 AND service = $2 AND environment = $3`,
        [establishmentId, service, environment],
      )
    ).rows[0];
    if (cached && new Date(cached.expires_at).getTime() - Date.now() > 10 * 60 * 1000) {
      return { token: cached.token, sign: cached.sign };
    }

    const cms = signTRA(buildTRA(service), certPem, keyPem);
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="https://wsaahomo.afip.gov.ar/ws/services/LoginCms">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cms}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;

    const res = await afipFetch(isProduction ? WSAA_URL_PRODUCTION : WSAA_URL_TESTING, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: envelope,
    });
    const text = await res.text();

    if (!res.ok || /faultstring/i.test(text)) {
      const fault = xmlValue(text, "faultstring") || text.slice(0, 500);
      throw new Error(`WSAA: ${decodeEntities(fault)}`);
    }

    const ta = decodeEntities(xmlValue(text, "loginCmsReturn"));
    const token = xmlValue(ta, "token");
    const sign = xmlValue(ta, "sign");
    const expiration = xmlValue(ta, "expirationTime");
    if (!token || !sign) throw new Error(`WSAA: respuesta inválida — ${text.slice(0, 300)}`);

    await c.query(
      `INSERT INTO public.afip_tokens (establishment_id, service, environment, token, sign, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (establishment_id, service, environment) DO UPDATE SET token = EXCLUDED.token, sign = EXCLUDED.sign, expires_at = EXCLUDED.expires_at`,
      [
        establishmentId, service, environment, token, sign,
        expiration ? new Date(expiration).toISOString() : new Date(Date.now() + 11 * 3600 * 1000).toISOString(),
      ],
    );
    return { token, sign };
  });
}

// ---------------------------------------------------------------- WSFEv1

async function callWsfe(url: string, action: string, body: string): Promise<string> {
  const res = await afipFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `http://ar.gov.afip.dif.FEV1/${action}`,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok || /faultstring/i.test(text)) {
    const fault = xmlValue(text, "faultstring") || text.slice(0, 500);
    throw new Error(`WSFEv1 ${action}: ${decodeEntities(fault)}`);
  }
  const errors = xmlAll(text, "Err");
  if (errors.length) {
    const msgs = errors.map((e) => `${xmlValue(e, "Code")} - ${xmlValue(e, "Msg")}`).join(" | ");
    throw new Error(`ARCA rechazó la solicitud: ${msgs}`);
  }
  return text;
}

function authXml(token: string, sign: string, cuit: string) {
  return `<ar:Auth><ar:Token>${token}</ar:Token><ar:Sign>${sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`;
}

async function ultimoAutorizado(
  url: string, token: string, sign: string, cuit: string, ptoVta: number, tipoCbte: number,
): Promise<number> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECompUltimoAutorizado>
      ${authXml(token, sign, cuit)}
      <ar:PtoVta>${ptoVta}</ar:PtoVta>
      <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`;
  const xml = await callWsfe(url, "FECompUltimoAutorizado", envelope);
  return Number(xmlValue(xml, "CbteNro") || 0);
}

/** Fecha (AAAAMMDD) del último comprobante autorizado para ese PV/tipo, o null. */
async function fechaComprobante(
  url: string, token: string, sign: string, cuit: string, ptoVta: number, tipoCbte: number, nro: number,
): Promise<string | null> {
  if (!nro) return null;
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECompConsultar>
      ${authXml(token, sign, cuit)}
      <ar:FeCompConsReq>
        <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
        <ar:CbteNro>${nro}</ar:CbteNro>
        <ar:PtoVta>${ptoVta}</ar:PtoVta>
      </ar:FeCompConsReq>
    </ar:FECompConsultar>
  </soap:Body>
</soap:Envelope>`;
  try {
    const xml = await callWsfe(url, "FECompConsultar", envelope);
    const f = xmlValue(xml, "CbteFch");
    return /^\d{8}$/.test(f || "") ? f : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Padrón A5

/** Consulta ws_sr_padron_a5 (getPersona) y devuelve razón social / nombre. */
async function getPersonaPadron(
  url: string, token: string, sign: string, cuit: string, cuitConsultado: string,
): Promise<{ razon_social: string; tipo_persona: string | null }> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns1:getPersona xmlns:ns1="http://a5.soap.ws.server.puc.sr.afip.gov.ar/">
      <token>${token}</token>
      <sign>${sign}</sign>
      <cuitRepresentada>${cuit}</cuitRepresentada>
      <idPersona>${cuitConsultado}</idPersona>
    </ns1:getPersona>
  </soap:Body>
</soap:Envelope>`;

  const res = await afipFetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok || /faultstring/i.test(text)) {
    const fault = xmlValue(text, "faultstring") || text.slice(0, 500);
    throw new Error(`Padrón ARCA: ${decodeEntities(fault)}`);
  }

  const datos = xmlValue(text, "datosGenerales") || text;
  const razonSocial = xmlValue(datos, "razonSocial");
  const nombre = xmlValue(datos, "nombre");
  const apellido = xmlValue(datos, "apellido");
  const tipo = xmlValue(datos, "tipoPersona") || null;

  const final = razonSocial || [apellido, nombre].filter(Boolean).join(" ").trim();
  if (!final) throw new Error("ARCA no encontró datos para ese CUIT");
  return { razon_social: final, tipo_persona: tipo };
}

// ---------------------------------------------------------------- handler

export async function registerAfipInvoice(app: FastifyInstance) {
  app.post("/api/fn/afip-invoice", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const body = (req.body ?? {}) as Record<string, any>;

    try {
      const { action, establishment_id } = body;
      if (!establishment_id) throw new HttpError(400, "establishment_id requerido");

      const roles = await loadRoles(user.id);
      const allowed = roles.some(
        (r) => r.role === "superadmin" || ((r.role === "admin" || r.role === "cashier") && r.establishment_id === establishment_id),
      );
      if (!allowed) throw new HttpError(403, "Forbidden");

      const { est, cert } = await withDb(SERVICE, async (c) => {
        const e = (
          await c.query(
            `SELECT cuit, razon_social, condicion_iva, punto_venta_afip, afip_environment, domicilio_comercial FROM public.establishments WHERE id = $1`,
            [establishment_id],
          )
        ).rows[0];
        const k = (
          await c.query(`SELECT certificate_pem, private_key_pem, expires_at FROM public.afip_certificates WHERE establishment_id = $1`, [establishment_id])
        ).rows[0];
        return { est: e, cert: k };
      });

      if (!est) throw new HttpError(404, "Establecimiento no encontrado");
      if (!est.cuit || !est.punto_venta_afip) throw new HttpError(400, "Configuración fiscal incompleta (CUIT o Punto de Venta faltante)");
      if (!cert?.certificate_pem || !cert?.private_key_pem) throw new HttpError(400, "Falta el certificado digital de ARCA (.crt) o su clave privada");

      const certPem: string = cert.certificate_pem;
      const keyPem = decryptSecret(cert.private_key_pem);
      const isProduction = est.afip_environment === "production";
      const wsfeUrl = isProduction ? WSFE_URL_PRODUCTION : WSFE_URL_TESTING;
      const cuit = String(est.cuit).replace(/\D/g, "");
      validateCertificateIdentity(certPem, keyPem, cuit);

      // ---------------- consulta padrón (razón social por CUIT)
      if (action === "padron") {
        const cuitConsultado = String(body.cuit_consultado || "").replace(/\D/g, "");
        if (!/^\d{11}$/.test(cuitConsultado)) throw new HttpError(400, "CUIT inválido (11 dígitos)");
        const { token, sign } = await getTicket(establishment_id, certPem, keyPem, isProduction, "ws_sr_padron_a5");
        const padronUrl = isProduction ? PADRON_URL_PRODUCTION : PADRON_URL_TESTING;
        const persona = await getPersonaPadron(padronUrl, token, sign, cuit, cuitConsultado);
        return { success: true, ...persona };
      }

      // ---------------- test de conexión real
      if (action === "test") {
        const { token, sign } = await getTicket(establishment_id, certPem, keyPem, isProduction);
        const tipoDefault = est.condicion_iva === "monotributo" ? 11 : 6;
        const last = await ultimoAutorizado(wsfeUrl, token, sign, cuit, est.punto_venta_afip, tipoDefault);
        return {
          success: true,
          message: "Conexión con ARCA establecida correctamente",
          cuit,
          punto_venta: est.punto_venta_afip,
          condicion_iva: est.condicion_iva,
          environment: est.afip_environment,
          has_certificate: true,
          certificate_expires_at: cert.expires_at,
          tipo_consultado: TIPO_LABELS[tipoDefault],
          last_number: last,
          next_number: last + 1,
        };
      }

      // ---------------- emisión real
      if (action === "authorize") {
        const {
          invoice_id, total, items, payment_method,
          receptor_condicion_iva = "consumidor_final",
          receptor_cuit, receptor_razon_social,
          is_credit_note = false,
          related_fiscal_invoice_id,
          credit_note_reason,
          original_tipo_cbte, original_punto_venta, original_cbte_numero,
          fecha_emision,
        } = body;

        const totalNum = Number(total);
        if (!Number.isFinite(totalNum) || totalNum <= 0) throw new HttpError(400, "Total inválido");

        const tipoCbte = is_credit_note && original_tipo_cbte
          ? ({ 1: 3, 6: 8, 11: 13 } as Record<number, number>)[original_tipo_cbte] ?? 13
          : getTipoCbte(est.condicion_iva, receptor_condicion_iva);

        // Factura C (monotributo): no se discrimina IVA. A y B: neto + IVA 21%
        const discriminaIva = tipoCbte !== 11 && tipoCbte !== 13;
        const netoGravado = discriminaIva ? Number((totalNum / 1.21).toFixed(2)) : totalNum;
        const iva21 = discriminaIva ? Number((totalNum - netoGravado).toFixed(2)) : 0;

        const docTipo = receptor_cuit ? 80 : 99;
        const docNro = receptor_cuit ? String(receptor_cuit).replace(/\D/g, "") : "0";
        const condIvaReceptor = COND_IVA_RECEPTOR_ID[receptor_condicion_iva] ?? 5;

        const { token, sign } = await getTicket(establishment_id, certPem, keyPem, isProduction);
        const last = await ultimoAutorizado(wsfeUrl, token, sign, cuit, est.punto_venta_afip, tipoCbte);
        const nextNumber = last + 1;
        const hoy = fechaAR();
        let fecha = hoy;
        let concepto = 1;
        let servXml = "";

        if (fecha_emision) {
          const solicitada = String(fecha_emision).replace(/-/g, "");
          if (!/^\d{8}$/.test(solicitada)) throw new HttpError(400, "Fecha de emisión inválida");
          if (solicitada > hoy) throw new HttpError(400, "La fecha de emisión no puede ser futura");

          const toDate = (s: string) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
          const diasAtras = Math.round((toDate(hoy).getTime() - toDate(solicitada).getTime()) / 86400000);
          if (diasAtras > 10) throw new HttpError(400, "ARCA sólo permite emitir hasta 10 días hacia atrás (servicios).");
          fecha = solicitada;

          // ARCA exige que la fecha no sea anterior a la del último comprobante
          // autorizado del mismo punto de venta y tipo (error 10016).
          const fechaUltimo = await fechaComprobante(wsfeUrl, token, sign, cuit, est.punto_venta_afip, tipoCbte, last);
          if (fechaUltimo && fecha < fechaUltimo) {
            const fmt = (s: string) => `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
            throw new HttpError(
              400,
              `No se puede facturar con fecha ${fmt(fecha)}: el último comprobante autorizado ` +
                `(N° ${last}) tiene fecha ${fmt(fechaUltimo)}. ARCA exige numeración y fechas correlativas, ` +
                `así que la fecha mínima posible es ${fmt(fechaUltimo)}.`,
            );
          }

          const diasReales = Math.round((toDate(hoy).getTime() - toDate(fecha).getTime()) / 86400000);
          if (diasReales > 5) {
            // Productos sólo admite 5 días; usamos Concepto 2 (servicios) que admite 10
            concepto = 2;
            servXml = `<ar:FchServDesde>${fecha}</ar:FchServDesde><ar:FchServHasta>${fecha}</ar:FchServHasta><ar:FchVtoPago>${fecha}</ar:FchVtoPago>`;
          }
        }

        const ivaArray = discriminaIva
          ? `<ar:Iva><ar:AlicIva><ar:Id>5</ar:Id><ar:BaseImp>${netoGravado.toFixed(2)}</ar:BaseImp><ar:Importe>${iva21.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>`
          : "";

        const cbtesAsoc = is_credit_note && original_tipo_cbte
          ? `<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>${original_tipo_cbte}</ar:Tipo><ar:PtoVta>${original_punto_venta}</ar:PtoVta><ar:Nro>${original_cbte_numero}</ar:Nro><ar:Cuit>${cuit}</ar:Cuit></ar:CbteAsoc></ar:CbtesAsoc>`
          : "";

        const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
  <soap:Body>
    <ar:FECAESolicitar>
      ${authXml(token, sign, cuit)}
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${est.punto_venta_afip}</ar:PtoVta>
          <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${concepto}</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${nextNumber}</ar:CbteDesde>
            <ar:CbteHasta>${nextNumber}</ar:CbteHasta>
            <ar:CbteFch>${fecha}</ar:CbteFch>
            ${servXml}
            <ar:ImpTotal>${totalNum.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${netoGravado.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:ImpIVA>${iva21.toFixed(2)}</ar:ImpIVA>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>
            <ar:CondicionIVAReceptorId>${condIvaReceptor}</ar:CondicionIVAReceptorId>
            ${cbtesAsoc}
            ${ivaArray}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soap:Body>
</soap:Envelope>`;

        const xml = await callWsfe(wsfeUrl, "FECAESolicitar", envelope);

        const resultado = xmlValue(xml, "Resultado");
        const cae = xmlValue(xml, "CAE");
        const caeVtoRaw = xmlValue(xml, "CAEFchVto");
        const observaciones = xmlAll(xml, "Obs").map((o) => `${xmlValue(o, "Code")} - ${xmlValue(o, "Msg")}`);

        if (resultado !== "A" || !cae) {
          throw new HttpError(
            400,
            `ARCA rechazó el comprobante${observaciones.length ? ": " + observaciones.join(" | ") : ""}`,
            { resultado, observaciones },
          );
        }

        const caeVto = caeVtoRaw.length === 8
          ? `${caeVtoRaw.slice(0, 4)}-${caeVtoRaw.slice(4, 6)}-${caeVtoRaw.slice(6, 8)}`
          : null;

        // El CAE ya fue emitido por ARCA: si falla el guardado, el error debe ser muy visible.
        const inserted = await withDb(SERVICE, async (c) =>
          (
            await c.query(
              `INSERT INTO public.fiscal_invoices
                 (establishment_id, invoice_id, tipo_cbte, punto_venta, cbte_numero, cae, cae_vto, total, neto_gravado, iva_amount,
                  items_detail, payment_method, receptor_cuit, receptor_razon_social, receptor_condicion_iva, status,
                  is_credit_note, related_fiscal_invoice_id, credit_note_reason, created_by, afip_response)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,'authorized',$16,$17,$18,$19,$20::jsonb)
               RETURNING id`,
              [
                establishment_id, invoice_id || null, tipoCbte, est.punto_venta_afip, nextNumber, cae, caeVto, totalNum, netoGravado, iva21,
                items ? JSON.stringify(items) : null, payment_method || null, receptor_cuit || null, receptor_razon_social || null,
                receptor_condicion_iva, !!is_credit_note, related_fiscal_invoice_id || null, credit_note_reason || null, user.id,
                JSON.stringify({ resultado, cae, cae_vto: caeVto, observaciones, environment: est.afip_environment }),
              ],
            )
          ).rows[0],
        );

        return {
          success: true,
          fiscal_invoice_id: inserted.id,
          tipo_cbte: tipoCbte,
          tipo_label: TIPO_LABELS[tipoCbte] ?? `Tipo ${tipoCbte}`,
          punto_venta: est.punto_venta_afip,
          cbte_numero: nextNumber,
          cae,
          cae_vto: caeVto,
          total: totalNum,
          neto_gravado: netoGravado,
          iva_amount: iva21,
          observaciones,
        };
      }

      throw new HttpError(400, "Acción no reconocida");
    } catch (err: any) {
      const status = err instanceof HttpError ? err.status : 500;
      req.log.error({ err: err?.message, status }, "afip-invoice");
      return reply.code(status).send({ error: err?.message ?? "Error inesperado", ...(err instanceof HttpError ? err.extra : {}) });
    }
  });
}
