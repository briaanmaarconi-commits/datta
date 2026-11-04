import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import forge from "node-forge";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";

// ARCA simulado: se capturan los SOAP enviados y se responde como homologación. Nunca sale a la red.
const sent: { action: string; body: string }[] = [];
vi.mock("undici", async (orig) => {
  const real = await orig<typeof import("undici")>();
  return {
    ...real,
    fetch: async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      const action = String(init.headers.SOAPAction || "").split("/").pop() || "";
      sent.push({ action, body: init.body });
      const xml =
        action === "FECompUltimoAutorizado" ? "<CbteNro>0</CbteNro>"
        : action === "FECAESolicitar" ? "<Resultado>A</Resultado><CAE>71234567890123</CAE><CAEFchVto>20261231</CAEFchVto>"
        : "";
      return new Response(`<soap:Envelope><soap:Body>${xml}</soap:Body></soap:Envelope>`, { status: 200 });
    },
  };
});

const { buildApp } = await import("../src/server.js");
const { pool } = await import("../src/db/pool.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const estId = crypto.randomUUID();
const email = `cashier-${crypto.randomUUID().slice(0, 8)}@afip-receptor-test.local`;
const adminEmail = `admin-${crypto.randomUUID().slice(0, 8)}@afip-receptor-test.local`;
const cookies: Record<string, string> = {};

async function cleanup() {
  const stale = (await owner.query(`SELECT id FROM public.establishments WHERE name = 'AFIP Receptor Test'`)).rows.map((r) => r.id);
  if (stale.length) {
    await owner.query(`DELETE FROM public.fiscal_invoices WHERE establishment_id = ANY($1)`, [stale]);
    await owner.query(`DELETE FROM public.afip_tokens WHERE establishment_id = ANY($1)`, [stale]);
    await owner.query(`DELETE FROM public.afip_certificates WHERE establishment_id = ANY($1)`, [stale]);
    await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [stale]);
  }
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@afip-receptor-test.local'`);
}

const call = (who: string, url: string, payload: unknown) =>
  app.inject({ method: "POST", url, payload: payload as any, headers: { cookie: cookies[who] } });

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(
    `INSERT INTO public.establishments (id, name, cuit, razon_social, condicion_iva, punto_venta_afip, afip_environment)
     VALUES ($1,'AFIP Receptor Test','20123456786','Test SRL','responsable_inscripto',1,'testing')`,
    [estId],
  );
  const hash = await bcrypt.hash(PASS, 4);
  for (const [who, mail, role] of [["cashier", email, "cashier"], ["admin", adminEmail, "admin"]]) {
    const id = (await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [mail, hash])).rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [id, role, estId]);
  }
  app = await buildApp();
  for (const [who, mail] of [["cashier", email], ["admin", adminEmail]]) {
    const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: mail, password: PASS } });
    const sc = r.headers["set-cookie"];
    cookies[who] = String(Array.isArray(sc) ? sc[0] : sc).split(";")[0];
  }
  // certificado autofirmado con la clave que genera el sistema
  await call("admin", "/api/fn/afip-csr", { establishment_id: estId });
  const key = (await call("admin", "/api/fn/afip-csr", { establishment_id: estId, action: "download_key" })).json().key as string;
  const priv = forge.pki.privateKeyFromPem(key) as forge.pki.rsa.PrivateKey;
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(priv.n, priv.e);
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const attrs = [{ name: "commonName", value: "test" }, { name: "serialNumber", type: "2.5.4.5", value: "CUIT 20123456786" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(priv, forge.md.sha256.create());
  expect((await call("admin", "/api/fn/afip-certificate", { establishment_id: estId, certificate_pem: forge.pki.certificateToPem(cert) })).statusCode).toBe(200);
  // ticket WSAA ya vigente: no hace falta loguearse en ARCA
  await owner.query(
    `INSERT INTO public.afip_tokens (establishment_id, service, environment, token, sign, expires_at) VALUES ($1,'wsfe','testing','TOK','SIG', now() + interval '6 hours')`,
    [estId],
  );
});

afterAll(async () => {
  await app?.close();
  await cleanup();
  await owner.end();
  await pool.end();
});

const authorize = (extra: Record<string, unknown>) =>
  call("cashier", "/api/fn/afip-invoice", {
    action: "authorize", establishment_id: estId, total: 1210, items: [], payment_method: "cash",
    receptor_condicion_iva: "consumidor_final", ...extra,
  });
const lastCae = () => [...sent].reverse().find((s) => s.action === "FECAESolicitar")!.body;

describe("Factura B con datos del cliente", () => {
  it("sin CUIT sale a Consumidor Final (DocTipo 99)", async () => {
    const r = await authorize({});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().tipo_cbte).toBe(6);
    expect(lastCae()).toContain("<ar:DocTipo>99</ar:DocTipo>");
    expect(lastCae()).toContain("<ar:DocNro>0</ar:DocNro>");
    const row = (await owner.query(`SELECT receptor_cuit, receptor_razon_social FROM public.fiscal_invoices WHERE id = $1`, [r.json().fiscal_invoice_id])).rows[0];
    expect(row).toEqual({ receptor_cuit: null, receptor_razon_social: null });
  });
  it("con CUIT va identificado (DocTipo 80 + CUIT) y se guarda la razón social", async () => {
    const r = await authorize({ receptor_cuit: "20-12345678-6", receptor_razon_social: "  Cliente SA " });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().tipo_cbte).toBe(6);
    expect(lastCae()).toContain("<ar:DocTipo>80</ar:DocTipo>");
    expect(lastCae()).toContain("<ar:DocNro>20123456786</ar:DocNro>");
    const row = (await owner.query(`SELECT receptor_cuit, receptor_razon_social FROM public.fiscal_invoices WHERE id = $1`, [r.json().fiscal_invoice_id])).rows[0];
    expect(row).toEqual({ receptor_cuit: "20123456786", receptor_razon_social: "Cliente SA" });
  });
  it("CUIT con dígito verificador mal: no se manda a ARCA", async () => {
    const before = sent.length;
    const r = await authorize({ receptor_cuit: "20123456785", receptor_razon_social: "X" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/CUIT del cliente no es válido/);
    expect(sent.length).toBe(before);
  });
  it("Factura A sin CUIT da un error claro", async () => {
    const r = await authorize({ receptor_condicion_iva: "responsable_inscripto" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Factura A necesita el CUIT/);
  });
});
