import type { FastifyInstance } from "fastify";
import forge from "node-forge";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { decryptSecret, encryptSecret } from "../secrets.js";
import { fail, hasEstablishmentRole, requireSession } from "./common.js";

const body = z.object({ establishment_id: z.string().uuid(), action: z.string().optional() });

export async function registerAfipCsr(app: FastifyInstance) {
  // Genera clave + CSR (la clave privada nunca viaja al navegador salvo descarga explícita del admin).
  app.post("/api/fn/afip-csr", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const p = body.safeParse(req.body);
    if (!p.success) return fail(reply, 400, "Falta establishment_id");
    const { establishment_id, action } = p.data;
    // Solo admin del establecimiento (o superadmin): el cajero no administra certificados.
    if (!(await hasEstablishmentRole(user.id, establishment_id, ["admin"]))) return fail(reply, 403, "Permisos insuficientes");

    if (action === "download_key") {
      return withDb(SERVICE, async (c) => {
        const row = (await c.query(`SELECT private_key_pem FROM public.afip_certificates WHERE establishment_id = $1`, [establishment_id])).rows[0];
        if (!row?.private_key_pem?.trim()) return fail(reply, 404, "No hay clave privada generada. Generá primero el CSR.");
        const est = (await c.query(`SELECT cuit FROM public.establishments WHERE id = $1`, [establishment_id])).rows[0];
        const cuitKey = String(est?.cuit ?? "").replace(/\D/g, "") || "datta";
        return { key: decryptSecret(row.private_key_pem), filename: `datta-${cuitKey}.key` };
      });
    }

    return withDb(SERVICE, async (c) => {
      const est = (await c.query(`SELECT name, cuit, razon_social FROM public.establishments WHERE id = $1`, [establishment_id])).rows[0];
      if (!est) return fail(reply, 404, "Establecimiento no encontrado");
      const cuit = String(est.cuit ?? "").replace(/\D/g, "");
      if (cuit.length !== 11) return fail(reply, 400, "Cargá y guardá primero un CUIT válido (11 dígitos) en los datos fiscales.");

      const commonName =
        String(est.razon_social || est.name || "datta").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9 ._-]/g, "").slice(0, 50) || "datta";

      const keys = forge.pki.rsa.generateKeyPair(2048);
      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = keys.publicKey;
      csr.setSubject([
        { name: "countryName", value: "AR" },
        { name: "organizationName", value: commonName },
        { name: "commonName", value: commonName },
        { name: "serialNumber", type: "2.5.4.5", value: `CUIT ${cuit}` },
      ]);
      csr.sign(keys.privateKey, forge.md.sha256.create());
      const csrPem = forge.pki.certificationRequestToPem(csr);
      const keyPem = encryptSecret(forge.pki.privateKeyToPem(keys.privateKey));

      await c.query(
        `INSERT INTO public.afip_certificates (establishment_id, private_key_pem, certificate_pem) VALUES ($1, $2, '')
         ON CONFLICT (establishment_id) DO UPDATE SET private_key_pem = EXCLUDED.private_key_pem, certificate_pem = ''`,
        [establishment_id, keyPem],
      );
      return { csr: csrPem, filename: `datta-${cuit}.csr`, subject: `C=AR, O=${commonName}, CN=${commonName}, serialNumber=CUIT ${cuit}` };
    });
  });

  // Carga del certificado emitido por ARCA (y opcionalmente la clave privada propia). Reemplaza el
  // insert/update directo sobre afip_certificates que hacía el navegador.
  app.post("/api/fn/afip-certificate", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const p = z
      .object({ establishment_id: z.string().uuid(), certificate_pem: z.string().max(20000), private_key_pem: z.string().max(20000).nullish() })
      .safeParse(req.body);
    if (!p.success) return fail(reply, 400, "Datos inválidos");
    const b = p.data;
    if (!(await hasEstablishmentRole(user.id, b.establishment_id, ["admin"]))) return fail(reply, 403, "Permisos insuficientes");

    let cert: forge.pki.Certificate;
    try {
      cert = forge.pki.certificateFromPem(b.certificate_pem.trim());
    } catch {
      return fail(reply, 400, "El archivo no es un certificado PEM válido");
    }
    if (b.private_key_pem) {
      try {
        forge.pki.privateKeyFromPem(b.private_key_pem.trim());
      } catch {
        return fail(reply, 400, "El archivo .key no es una clave privada PEM válida");
      }
    }
    const expires = cert.validity.notAfter.toISOString().slice(0, 10);

    return withDb(SERVICE, async (c) => {
      const existing = (await c.query(`SELECT id, private_key_pem FROM public.afip_certificates WHERE establishment_id = $1`, [b.establishment_id])).rows[0];
      if (!b.private_key_pem && !existing?.private_key_pem) return fail(reply, 400, "Falta la clave privada (.key)");
      // La clave y el certificado deben corresponder entre sí.
      const keyPem = b.private_key_pem ? b.private_key_pem.trim() : decryptSecret(existing.private_key_pem);
      const priv = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
      const pub = cert.publicKey as forge.pki.rsa.PublicKey;
      if (priv.n.compareTo(pub.n) !== 0 || priv.e.compareTo(pub.e) !== 0) {
        return fail(reply, 400, "La clave privada no corresponde a este certificado");
      }
      const stored = b.private_key_pem ? encryptSecret(keyPem) : existing.private_key_pem;
      await c.query(
        `INSERT INTO public.afip_certificates (establishment_id, certificate_pem, private_key_pem, expires_at) VALUES ($1,$2,$3,$4)
         ON CONFLICT (establishment_id) DO UPDATE SET certificate_pem = EXCLUDED.certificate_pem, private_key_pem = EXCLUDED.private_key_pem, expires_at = EXCLUDED.expires_at`,
        [b.establishment_id, b.certificate_pem.trim(), stored, expires],
      );
      return { ok: true, expires_at: expires };
    });
  });
}
