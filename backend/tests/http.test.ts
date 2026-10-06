import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import forge from "node-forge";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";

process.env.STORAGE_DIR = resolve("./uploads-test");
const { buildApp } = await import("../src/server.js");
const { pool } = await import("../src/db/pool.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const u = (n: string) => `${n}-${crypto.randomUUID().slice(0, 8)}@http-test.local`.toLowerCase();
const ids = { estA: crypto.randomUUID(), estB: crypto.randomUUID() };
const users = {
  adminA: { email: u("adminA"), role: "admin", est: ids.estA, id: "" },
  cashierA: { email: u("cashierA"), role: "cashier", est: ids.estA, id: "" },
  waiterA: { email: u("waiterA"), role: "waiter", est: ids.estA, id: "" },
  adminB: { email: u("adminB"), role: "admin", est: ids.estB, id: "" },
  superU: { email: u("super"), role: "superadmin", est: null as string | null, id: "" },
};
const cookies: Record<string, string> = {};

async function login(name: keyof typeof users, password = PASS) {
  const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: users[name].email, password } });
  const sc = r.headers["set-cookie"];
  if (r.statusCode === 200 && sc) cookies[name] = String(Array.isArray(sc) ? sc[0] : sc).split(";")[0];
  return r;
}
const call = (name: keyof typeof users | null, method: "GET" | "POST", url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method, url, payload: payload as any, headers: { ...(name ? { cookie: cookies[name] } : {}), ...headers } });

async function cleanup() {
  const stale = await owner.query(`SELECT id FROM public.establishments WHERE name LIKE 'HTTP Test %'`);
  const ests = stale.rows.map((r) => r.id);
  if (ests.length) {
    await owner.query(`DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE establishment_id = ANY($1))`, [ests]);
    await owner.query(`DELETE FROM public.orders WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.products WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [ests]);
  }
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@http-test.local'`);
}

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(`INSERT INTO public.establishments (id, name, cuit, razon_social) VALUES ($1,'HTTP Test A','20123456786','Test A SRL'), ($2,'HTTP Test B',NULL,NULL)`, [ids.estA, ids.estB]);
  const hash = await bcrypt.hash(PASS, 4);
  for (const k of Object.keys(users) as (keyof typeof users)[]) {
    const r = await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [users[k].email, hash]);
    users[k].id = r.rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [users[k].id, users[k].role, users[k].est]);
  }
  app = await buildApp();
  for (const k of Object.keys(users) as (keyof typeof users)[]) await login(k);
});

afterAll(async () => {
  await app?.close();
  await cleanup();
  await owner.end();
  await pool.end();
  await rm(resolve("./uploads-test"), { recursive: true, force: true });
});

describe("sesiones", () => {
  it("login correcto devuelve usuario, rol y establecimiento", async () => {
    const r = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookies.adminA } });
    expect(r.json().user).toMatchObject({ role: "admin", establishmentId: ids.estA });
  });
  it("contraseña incorrecta y usuario inexistente dan el mismo 401", async () => {
    const a = await login("adminA", "mala");
    const b = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "nadie@x.com", password: "x" } });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });
  it("las rutas protegidas exigen sesión", async () => {
    expect((await call(null, "POST", "/api/db/query", { table: "products", op: "select" })).statusCode).toBe(401);
    expect((await call(null, "POST", "/api/fn/create-user", {})).statusCode).toBe(401);
    expect((await call(null, "GET", "/api/events")).statusCode).toBe(401);
  });
  it("logout invalida la sesión", async () => {
    await login("waiterA");
    const old = cookies.waiterA;
    await call("waiterA", "POST", "/api/auth/logout");
    const r = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: old } });
    expect(r.json().user).toBeNull();
    await login("waiterA");
  });
});

describe("create-user (matriz de permisos)", () => {
  it("admin crea personal en su establecimiento y esa persona puede entrar", async () => {
    const email = u("nuevo");
    const r = await call("adminA", "POST", "/api/fn/create-user", { email, password: "Clave-1234", fullName: "Nuevo Mozo", role: "waiter", establishmentId: ids.estA });
    expect(r.statusCode).toBe(200);
    const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "Clave-1234" } });
    expect(l.json().user).toMatchObject({ role: "waiter", establishmentId: ids.estA, fullName: "Nuevo Mozo" });
  });
  it("no puede crear en otro establecimiento ni asignar superadmin", async () => {
    expect((await call("adminA", "POST", "/api/fn/create-user", { email: u("x"), password: "Clave-1234", role: "waiter", establishmentId: ids.estB })).statusCode).toBe(403);
    expect((await call("adminA", "POST", "/api/fn/create-user", { email: u("y"), password: "Clave-1234", role: "superadmin" })).statusCode).toBe(403);
  });
  it("el cajero solo asigna mozo/cocina y el mozo no administra", async () => {
    expect((await call("cashierA", "POST", "/api/fn/create-user", { email: u("c1"), password: "Clave-1234", role: "waiter", establishmentId: ids.estA })).statusCode).toBe(200);
    expect((await call("cashierA", "POST", "/api/fn/create-user", { email: u("c2"), password: "Clave-1234", role: "admin", establishmentId: ids.estA })).statusCode).toBe(403);
    expect((await call("waiterA", "POST", "/api/fn/create-user", { email: u("c3"), password: "Clave-1234", role: "waiter", establishmentId: ids.estA })).statusCode).toBe(403);
  });
  it("email duplicado da un error claro", async () => {
    const r = await call("adminA", "POST", "/api/fn/create-user", { email: users.waiterA.email, password: "Clave-1234", role: "waiter", establishmentId: ids.estA });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Ya existe/);
  });
  it("reset de contraseña: devuelve temporal, cierra sesiones y la vieja deja de servir", async () => {
    const r = await call("adminA", "POST", "/api/fn/create-user", { action: "reset_password", userId: users.waiterA.id });
    expect(r.statusCode).toBe(200);
    const temp = r.json().tempPassword as string;
    expect(temp.length).toBeGreaterThanOrEqual(12);
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookies.waiterA } });
    expect(me.json().user).toBeNull();
    expect((await login("waiterA", PASS)).statusCode).toBe(401);
    expect((await login("waiterA", temp)).statusCode).toBe(200);
  });
  it("adminB no puede resetear a un usuario de A", async () => {
    expect((await call("adminB", "POST", "/api/fn/create-user", { action: "reset_password", userId: users.adminA.id })).statusCode).toBe(403);
  });
});

describe("storage", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const upload = (who: keyof typeof users, bucket: string, path: string, file = png, filename = "f.png") => {
    const boundary = "----t" + Math.random().toString(16).slice(2);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${path}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      file,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({ method: "POST", url: `/api/storage/${bucket}`, payload: body, headers: { cookie: cookies[who], "content-type": `multipart/form-data; boundary=${boundary}` } });
  };

  it("sube una imagen a su establecimiento y se sirve públicamente sin sesión", async () => {
    const path = `products/${ids.estA}/${Date.now()}.png`;
    const up = await upload("adminA", "product-images", path);
    expect(up.statusCode).toBe(200);
    const get = await app.inject({ method: "GET", url: `/files/product-images/${path}` });
    expect(get.statusCode).toBe(200);
    expect(get.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(get.rawPayload, png)).toBe(0);
  });
  it("rechaza otro establecimiento, extensiones peligrosas y path traversal", async () => {
    expect((await upload("adminA", "product-images", `products/${ids.estB}/a.png`)).statusCode).toBe(403);
    expect((await upload("adminA", "product-images", `products/${ids.estA}/a.svg`, png, "a.svg")).statusCode).toBe(415);
    expect((await upload("adminA", "product-images", `products/${ids.estA}/../../x.png`)).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/files/product-images/..%2F..%2Fpackage.json" })).statusCode).toBeGreaterThanOrEqual(400);
  });
  it("los comprobantes son privados y por establecimiento", async () => {
    const path = `${ids.estA}/${crypto.randomUUID()}.png`;
    expect((await upload("adminA", "purchase-receipts", path)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/files/purchase-receipts/${path}` })).statusCode).toBe(401);
    expect((await call("adminB", "GET", `/files/purchase-receipts/${path}`)).statusCode).toBe(403);
    expect((await call("adminA", "GET", `/files/purchase-receipts/${path}`)).statusCode).toBe(200);
    expect((await call("superU", "GET", `/files/purchase-receipts/${path}`)).statusCode).toBe(200);
  });
});

describe("delivery", () => {
  it("guarda credenciales, el webhook pide mapeo y luego crea el pedido (idempotente)", async () => {
    const save = await call("adminA", "POST", "/api/fn/delivery-credentials", { establishment_id: ids.estA, platform: "rappi", client_id: "cid", client_secret: "supersecret1234" });
    expect(save.statusCode).toBe(200);
    expect((await call("adminB", "POST", "/api/fn/delivery-credentials", { establishment_id: ids.estA, platform: "rappi" })).statusCode).toBe(403);

    const st = await call("adminA", "POST", "/api/db/rpc", { fn: "get_delivery_integration_status", args: { _establishment_id: ids.estA } });
    const row = (st.json().data as any[])[0];
    expect(row.secret_last4).toBe("1234");
    expect(JSON.stringify(row)).not.toContain("supersecret");
    const token = row.webhook_token as string;

    const cat = await owner.query(`INSERT INTO public.categories (establishment_id, name) VALUES ($1,'Cat') RETURNING id`, [ids.estA]);
    const prod = await owner.query(`INSERT INTO public.products (category_id, establishment_id, name, price) VALUES ($1,$2,'Milanesa',100) RETURNING id`, [cat.rows[0].id, ids.estA]);

    const payload = { external_order_id: "R-1", delivery_fee: 50, customer: { name: "Ana", address: "Calle 1", phone: "11" }, items: [{ id: "SKU1", name: "Milanesa", quantity: 2, unit_price: 100 }] };
    expect((await app.inject({ method: "POST", url: "/api/delivery-webhook?token=malo", payload })).statusCode).toBe(401);
    const unmapped = await app.inject({ method: "POST", url: `/api/delivery-webhook?token=${token}`, payload });
    expect(unmapped.statusCode).toBe(422);

    await owner.query(`UPDATE public.delivery_menu_mapping SET product_id = $1 WHERE establishment_id = $2 AND external_item_id = 'SKU1'`, [prod.rows[0].id, ids.estA]);
    const ok = await app.inject({ method: "POST", url: `/functions/v1/delivery-webhook`, headers: { "x-datta-token": token }, payload });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().ok).toBe(true);
    const o = await owner.query(`SELECT total, channel, external_platform FROM public.orders WHERE id = $1`, [ok.json().order_id]);
    expect(Number(o.rows[0].total)).toBe(250);
    expect(o.rows[0]).toMatchObject({ channel: "delivery", external_platform: "rappi" });
    const dup = await app.inject({ method: "POST", url: `/api/delivery-webhook?token=${token}`, payload });
    expect(dup.json().duplicated).toBe(true);
  });
});

describe("AFIP: CSR y certificado", () => {
  it("genera CSR, permite descargar la clave y valida que el certificado corresponda", async () => {
    expect((await call("cashierA", "POST", "/api/fn/afip-csr", { establishment_id: ids.estA })).statusCode).toBe(403);
    const csr = await call("adminA", "POST", "/api/fn/afip-csr", { establishment_id: ids.estA });
    expect(csr.statusCode).toBe(200);
    expect(csr.json().csr).toContain("BEGIN CERTIFICATE REQUEST");
    expect(csr.json().subject).toContain("CUIT 20123456786");

    const key = (await call("adminA", "POST", "/api/fn/afip-csr", { establishment_id: ids.estA, action: "download_key" })).json().key as string;
    expect(key).toContain("PRIVATE KEY");

    // certificado autofirmado con la clave generada (en producción lo emite ARCA a partir del CSR)
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
    const certPem = forge.pki.certificateToPem(cert);

    const up = await call("adminA", "POST", "/api/fn/afip-certificate", { establishment_id: ids.estA, certificate_pem: certPem });
    expect(up.statusCode).toBe(200);
    const status = await call("adminA", "POST", "/api/db/rpc", { fn: "get_afip_cert_status", args: { _establishment_id: ids.estA } });
    expect(status.json().data).toMatchObject({ exists: true, has_cert: true, has_key: true });

    const other = forge.pki.rsa.generateKeyPair(1024);
    const wrongKey = forge.pki.privateKeyToPem(other.privateKey);
    const bad = await call("adminA", "POST", "/api/fn/afip-certificate", { establishment_id: ids.estA, certificate_pem: certPem, private_key_pem: wrongKey });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/no corresponde/);
  });
  it("el navegador ya no puede leer afip_certificates", async () => {
    const r = await call("adminA", "POST", "/api/db/query", { table: "afip_certificates", op: "select" });
    expect(r.json().error?.code).toBe("42501");
  });
  it("afip-invoice exige permisos y datos fiscales completos", async () => {
    expect((await call("waiterA", "POST", "/api/fn/afip-invoice", { action: "test", establishment_id: ids.estA })).statusCode).toBe(403);
    expect((await call("adminB", "POST", "/api/fn/afip-invoice", { action: "test", establishment_id: ids.estB })).statusCode).toBe(400);
  });
});

describe("IA y tareas", () => {
  it("sin ANTHROPIC_API_KEY el asistente y la lectura de facturas responden 503 claro", async () => {
    if (env.ANTHROPIC_API_KEY) return;
    expect((await call("adminA", "POST", "/api/fn/restaurant-chat", { messages: [{ role: "user", content: "hola" }] })).statusCode).toBe(503);
    expect((await call("adminA", "POST", "/api/fn/parse-invoice", { fileData: "data:image/png;base64,AAAA", mimeType: "image/png" })).statusCode).toBe(503);
  });
  it("el análisis diario manual corre para el propio establecimiento y no para otro", async () => {
    const ok = await call("adminA", "POST", "/api/fn/ai-daily-analysis", {}, { "x-establishment-id": ids.estA });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().ok).toBe(true);
    expect((await call("adminB", "POST", "/api/fn/ai-daily-analysis", {}, { "x-establishment-id": ids.estA })).statusCode).toBe(403);
    expect((await call("adminA", "POST", "/api/fn/ai-daily-analysis", {})).statusCode).toBe(403); // global: solo superadmin o secreto
    expect((await call("superU", "POST", "/api/fn/ai-daily-analysis", {})).statusCode).toBe(200);
  });
  it("el reporte por mail respeta permisos", async () => {
    expect((await call("waiterA", "POST", "/api/fn/daily-report-email", { establishment_id: ids.estA })).statusCode).toBe(403);
    expect((await call(null, "POST", "/api/fn/daily-report-email", {})).statusCode).toBe(403);
  });
});

describe("carta pública", () => {
  it("el pedido del QR calcula precios en el servidor y no acepta productos de otro local", async () => {
    const cat = await owner.query(`INSERT INTO public.categories (establishment_id, name) VALUES ($1,'QR') RETURNING id`, [ids.estA]);
    const p = await owner.query(`INSERT INTO public.products (category_id, establishment_id, name, price) VALUES ($1,$2,'Pizza',500) RETURNING id`, [cat.rows[0].id, ids.estA]);
    const t = await owner.query(`INSERT INTO public.tables (establishment_id, number) VALUES ($1, 99) RETURNING id`, [ids.estA]);
    const r = await app.inject({ method: "POST", url: "/api/public/orders", payload: { tableId: t.rows[0].id, items: [{ productId: p.rows[0].id, quantity: 3 }] } });
    expect(r.statusCode).toBe(200);
    const o = await owner.query(`SELECT total FROM public.orders WHERE id = $1`, [r.json().orderId]);
    expect(Number(o.rows[0].total)).toBe(1500);
    const bad = await app.inject({ method: "POST", url: "/api/public/orders", payload: { tableId: t.rows[0].id, items: [{ productId: crypto.randomUUID(), quantity: 1 }] } });
    expect(bad.statusCode).toBe(422);
  });
});
