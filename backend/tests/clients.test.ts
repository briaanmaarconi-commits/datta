import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { FastifyInstance } from "fastify";

// Los archivos de prueba y la papelera van a una carpeta temporal, no al volumen real.
const STORAGE = mkdtempSync(join(tmpdir(), "datta-del-"));
process.env.STORAGE_DIR = STORAGE;
process.env.MERCADOPAGO_ACCESS_TOKEN = "test-token";

const { env } = await import("../src/env.js");
const { buildApp } = await import("../src/server.js");
const { pool } = await import("../src/db/pool.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const tag = crypto.randomUUID().slice(0, 8);
const mail = (n: string) => `${n}-${tag}@del-test.local`;
const NAME_A = `Del Test A ${tag}`;
const ids = { a: crypto.randomUUID(), b: crypto.randomUUID(), c: crypto.randomUUID() };
const U: Record<string, { email: string; role: string; est: string | null; id: string; cookie: string }> = {
  superU: { email: mail("super"), role: "superadmin", est: null, id: "", cookie: "" },
  adminA: { email: mail("admin-a"), role: "admin", est: ids.a, id: "", cookie: "" },
  cashA: { email: mail("cash-a"), role: "cashier", est: ids.a, id: "", cookie: "" },
  adminB: { email: mail("admin-b"), role: "admin", est: ids.b, id: "", cookie: "" },
};
const call = (who: string | null, url: string, payload: unknown = {}) =>
  app.inject({ method: "POST", url, payload: payload as any, headers: who ? { cookie: U[who].cookie } : {} });
const count = async (sql: string, p: unknown[] = []) => Number((await owner.query(sql, p)).rows[0].n);

const mpCalls: { method: string; url: string; body?: any }[] = [];
let mpStatus = 200;
const realFetch = globalThis.fetch;

async function seedClient(estId: string, adminId: string) {
  const q = (sql: string, p: unknown[] = []) => owner.query(sql, p);
  const cat = (await q(`INSERT INTO public.categories (establishment_id, name) VALUES ($1,'Cat') RETURNING id`, [estId])).rows[0].id;
  const prod = (await q(`INSERT INTO public.products (establishment_id, category_id, name, price) VALUES ($1,$2,'Plato',1000) RETURNING id`, [estId, cat])).rows[0].id;
  const table = (await q(`INSERT INTO public.tables (establishment_id, number) VALUES ($1, 1) RETURNING id`, [estId])).rows[0].id;
  const order = (await q(`INSERT INTO public.orders (establishment_id, table_id, total, created_by) VALUES ($1,$2,2000,$3) RETURNING id`, [estId, table, adminId])).rows[0].id;
  await q(`INSERT INTO public.order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,2,1000)`, [order, prod]);
  const inv = (await q(`INSERT INTO public.invoices (establishment_id, table_number, order_ids, items, payment_method, created_by) VALUES ($1,1,$2,'[]','cash',$3) RETURNING id`, [estId, [order], adminId])).rows[0].id;
  await q(`INSERT INTO public.fiscal_invoices (establishment_id, tipo_cbte, punto_venta, invoice_id) VALUES ($1,11,8,$2)`, [estId, inv]);
  const ing = (await q(`INSERT INTO public.ingredients (establishment_id, name) VALUES ($1,'Harina') RETURNING id`, [estId])).rows[0].id;
  await q(`INSERT INTO public.product_recipes (product_id, ingredient_id, quantity) VALUES ($1,$2,1)`, [prod, ing]).catch(() => undefined);
  await q(`INSERT INTO public.stock_movements (establishment_id, ingredient_id, type, quantity) VALUES ($1,$2,'sale',1)`, [estId, ing]);
  const pinv = (await q(`INSERT INTO public.purchase_invoices (establishment_id, supplier) VALUES ($1,'Proveedor') RETURNING id`, [estId])).rows[0].id;
  await q(`INSERT INTO public.purchase_invoice_items (invoice_id, ingredient_id, quantity, unit_price) VALUES ($1,$2,1,10)`, [pinv, ing]).catch(() => undefined);
  await q(`INSERT INTO public.audit_logs (establishment_id, action, table_name, user_id) VALUES ($1,'test','orders',$2)`, [estId, adminId]);
  await q(`INSERT INTO public.reservations (establishment_id, table_id, customer_name, reservation_at) VALUES ($1,$2,'Cliente',now())`, [estId, table]);
  await q(`INSERT INTO public.shift_controls (establishment_id, shift_date, controlled_by) VALUES ($1, current_date, $2)`, [estId, adminId]).catch(() => undefined);
  const fcat = (await q(`SELECT id FROM public.finance_categories WHERE establishment_id = $1 LIMIT 1`, [estId])).rows[0]?.id
    ?? (await q(`INSERT INTO public.finance_categories (establishment_id, name, type) VALUES ($1,'Ventas','income') RETURNING id`, [estId])).rows[0].id;
  await q(`INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, created_by) VALUES ($1,$2,'income',2000,$3)`, [estId, fcat, adminId]);
  await q(`INSERT INTO public.client_payments (establishment_id, period_month, period_year, amount, created_by) VALUES ($1,10,2026,50000,$2)`, [estId, U.superU.id]);
  const dcat = (await q(`SELECT id FROM public.datta_finance_categories LIMIT 1`)).rows[0].id;
  await q(`INSERT INTO public.datta_transactions (establishment_id, type, category_id, amount, description) VALUES ($1,'income',$2,50000,$3)`, [estId, dcat, `del-test-${tag}`]);
  return { order };
}

async function cleanup() {
  await owner.query(`DELETE FROM public.datta_transactions WHERE description = $1`, [`del-test-${tag}`]);
  const ests = (await owner.query(`SELECT id FROM public.establishments WHERE name LIKE 'Del Test %'`)).rows.map((r) => r.id);
  if (ests.length) {
    await owner.query(`DELETE FROM public.fiscal_invoices WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.invoices WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.datta_transactions WHERE establishment_id = ANY($1)`, [ests]);
    for (const t of ["audit_logs", "reservations", "stock_movements", "purchase_invoices", "ingredients"]) {
      await owner.query(`DELETE FROM public."${t}" WHERE establishment_id = ANY($1)`, [ests]);
    }
    await owner.query(`DELETE FROM public.products WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [ests]);
  }
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@del-test.local'`);
}

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,$2), ($3,$4)`, [ids.a, NAME_A, ids.b, `Del Test B ${tag}`]);
  const hash = await bcrypt.hash(PASS, 4);
  for (const k of Object.keys(U)) {
    U[k].id = (await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [U[k].email, hash])).rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [U[k].id, U[k].role, U[k].est]);
  }
  await seedClient(ids.a, U.adminA.id);
  await seedClient(ids.b, U.adminB.id);
  mkdirSync(join(STORAGE, "purchase-receipts", ids.a), { recursive: true });
  writeFileSync(join(STORAGE, "purchase-receipts", ids.a, "r.pdf"), "x");
  mkdirSync(join(STORAGE, "product-images", "menu", ids.a), { recursive: true });
  writeFileSync(join(STORAGE, "product-images", "menu", ids.a, "p.png"), "x");
  mkdirSync(join(STORAGE, "purchase-receipts", ids.b), { recursive: true });
  writeFileSync(join(STORAGE, "purchase-receipts", ids.b, "r.pdf"), "x");
  app = await buildApp();
  vi.stubGlobal("fetch", async (url: string, init: any = {}) => {
    if (!String(url).startsWith("https://api.mercadopago.com")) return realFetch(url, init);
    mpCalls.push({ method: init.method ?? "GET", url: String(url).replace("https://api.mercadopago.com", ""), body: init.body ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify(mpStatus === 200 ? { id: "pre-x", status: "cancelled" } : { message: "boom" }), { status: mpStatus });
  });
  for (const k of Object.keys(U)) {
    const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: U[k].email, password: PASS } });
    U[k].cookie = String(l.headers["set-cookie"]).split(";")[0];
  }
}, 300_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await app?.close();
  await cleanup();
  await owner.end();
  await pool.end();
  rmSync(STORAGE, { recursive: true, force: true });
}, 120_000);

describe("eliminar clientes", { timeout: 120_000 }, () => {
  it("solo el superadmin; sin sesión es 401", async () => {
    for (const url of ["delete-preview", "delete"]) {
      const body = { establishment_id: ids.a, confirm_name: NAME_A };
      expect((await call("adminA", `/api/fn/clients/${url}`, body)).statusCode, url).toBe(403);
      expect((await call("cashA", `/api/fn/clients/${url}`, body)).statusCode, url).toBe(403);
      expect((await call(null, `/api/fn/clients/${url}`, body)).statusCode, url).toBe(401);
    }
    expect(await count(`SELECT count(*) n FROM public.establishments WHERE id = $1`, [ids.a])).toBe(1);
  });

  it("la vista previa cuenta lo que se va a borrar", async () => {
    const r = await call("superU", "/api/fn/clients/delete-preview", { establishment_id: ids.a });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ name: NAME_A, orders: 1, fiscal_invoices: 1, products: 1, payments: 1, users: 2, has_data: true });
    expect((await call("superU", "/api/fn/clients/delete-preview", { establishment_id: crypto.randomUUID() })).statusCode).toBe(404);
  });

  it("con el nombre equivocado no borra nada", async () => {
    const r = await call("superU", "/api/fn/clients/delete", { establishment_id: ids.a, confirm_name: "otro nombre" });
    expect(r.statusCode).toBe(400);
    expect(await count(`SELECT count(*) n FROM public.establishments WHERE id = $1`, [ids.a])).toBe(1);
    expect(await count(`SELECT count(*) n FROM public.orders WHERE establishment_id = $1`, [ids.a])).toBe(1);
  });

  it("si Mercado Pago falla al cancelar la suscripción, no se borra nada", async () => {
    await owner.query(`UPDATE public.establishments SET mp_preapproval_id = 'pre-x', mp_status = 'authorized' WHERE id = $1`, [ids.a]);
    mpStatus = 500;
    const r = await call("superU", "/api/fn/clients/delete", { establishment_id: ids.a, confirm_name: NAME_A });
    expect(r.statusCode).toBe(502);
    expect(await count(`SELECT count(*) n FROM public.establishments WHERE id = $1`, [ids.a])).toBe(1);
    expect(await count(`SELECT count(*) n FROM auth.users WHERE id = $1`, [U.adminA.id])).toBe(1);
    mpStatus = 200;
  });

  it("elimina el cliente con todo lo suyo, deja copia de seguridad y no toca a otros", async () => {
    mpCalls.length = 0;
    const r = await call("superU", "/api/fn/clients/delete", { establishment_id: ids.a, confirm_name: ` ${NAME_A} ` });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().deleted).toMatchObject({ orders: 1, fiscal_invoices: 1, products: 1, users: 2 });
    expect(mpCalls).toContainEqual({ method: "PUT", url: "/preapproval/pre-x", body: { status: "cancelled" } });

    for (const t of ["orders", "products", "categories", "tables", "invoices", "fiscal_invoices", "ingredients", "stock_movements", "purchase_invoices", "audit_logs", "reservations", "finance_transactions", "client_payments", "user_roles", "shift_controls"]) {
      expect(await count(`SELECT count(*) n FROM public."${t}" WHERE establishment_id = $1`, [ids.a]), t).toBe(0);
    }
    expect(await count(`SELECT count(*) n FROM public.establishments WHERE id = $1`, [ids.a])).toBe(0);
    expect(await count(`SELECT count(*) n FROM auth.users WHERE id = ANY($1)`, [[U.adminA.id, U.cashA.id]])).toBe(0); // usuarios del cliente
    expect(await count(`SELECT count(*) n FROM public.profiles WHERE id = ANY($1)`, [[U.adminA.id, U.cashA.id]])).toBe(0);

    // la contabilidad de Datta se conserva
    expect(await count(`SELECT count(*) n FROM public.datta_transactions WHERE description = $1 AND establishment_id IS NULL`, [`del-test-${tag}`])).toBe(1);
    // el superadmin y el otro cliente siguen intactos
    expect(await count(`SELECT count(*) n FROM auth.users WHERE id = $1`, [U.superU.id])).toBe(1);
    expect(await count(`SELECT count(*) n FROM public.orders WHERE establishment_id = $1`, [ids.b])).toBe(1);
    expect(await count(`SELECT count(*) n FROM public.fiscal_invoices WHERE establishment_id = $1`, [ids.b])).toBe(1);
    expect(await count(`SELECT count(*) n FROM auth.users WHERE id = $1`, [U.adminB.id])).toBe(1);

    // copia de seguridad en la papelera
    const trash = join(STORAGE, "_deleted-clients");
    const gz = readdirSync(trash).find((f) => f.endsWith(".json.gz"))!;
    const backup = JSON.parse(gunzipSync(readFileSync(join(trash, gz))).toString());
    expect(backup.establishment.name).toBe(NAME_A);
    expect(backup.tables.orders).toHaveLength(1);
    expect(backup.tables.order_items).toHaveLength(1);
    expect(backup.tables.fiscal_invoices).toHaveLength(1);
    expect(backup.users.map((u: any) => u.email).sort()).toEqual([U.adminA.email, U.cashA.email].sort());
    // los archivos se mueven, no se pierden; los de otros clientes quedan donde estaban
    expect(existsSync(join(STORAGE, "purchase-receipts", ids.a))).toBe(false);
    expect(existsSync(join(STORAGE, "product-images", "menu", ids.a))).toBe(false);
    expect(existsSync(join(STORAGE, "purchase-receipts", ids.b, "r.pdf"))).toBe(true);
    const moved = readdirSync(trash).find((f) => f.endsWith("-archivos"))!;
    expect(existsSync(join(trash, moved, "purchase-receipts", ids.a, "r.pdf"))).toBe(true);
    expect(existsSync(join(trash, moved, "product-images", "menu", ids.a, "p.png"))).toBe(true);
  });

  it("un cliente ya eliminado da 404", async () => {
    const r = await call("superU", "/api/fn/clients/delete", { establishment_id: ids.a, confirm_name: NAME_A });
    expect(r.statusCode).toBe(404);
  });
});
